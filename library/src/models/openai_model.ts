// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Module to interact with OpenAI models. This implementation provides the same interface
// as VertexModel but uses OpenAI's API instead of Google Cloud's Model Garden.

import pLimit from "p-limit";
import OpenAI from "openai";
import { Model } from "./model";
import { checkDataSchema } from "../types";
import { Static, TSchema } from "@sinclair/typebox";
import { retryCall } from "../sensemaker_utils";
import { RETRY_DELAY_MS, MAX_LLM_RETRIES } from "./model_util";
import { DEFAULT_VERTEX_PARALLELISM } from "./model_util";
import * as fs from "fs";
import * as path from "path";

/**
 * Class to interact with OpenAI models.
 */
export class OpenAIModel extends Model {
    private openai: OpenAI;
    private modelName: string;
    private maxTokens: number;
    private temperature: number;
    private limit: pLimit.Limit; // controls model calls concurrency

    /**
     * Create an OpenAI model object.
     * @param apiKey - the OpenAI API key
     * @param modelName - the name of the OpenAI model to use (default: "gpt-4o")
     * @param maxTokens - maximum tokens for response (default: 4000)
     * @param temperature - temperature for generation (default: 0)
     * @param parallelism - number of parallel requests (default: 2)
     */
    constructor(
        apiKey: string,
        modelName: string = "gpt-4o",
        maxTokens: number = 4000,
        temperature: number = 0,
        parallelism: number = 2
    ) {
        super();
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
        this.modelName = modelName;
        console.log("************************************************");
        console.log("LLM Model: ", this.modelName);
        console.log("************************************************");
        this.maxTokens = maxTokens;
        this.temperature = temperature;

        console.log(`Creating OpenAIModel with ${parallelism} parallel workers...`);
        this.limit = pLimit(DEFAULT_VERTEX_PARALLELISM);
    }



    /**
     * Generate text based on the given prompt.
     * @param prompt the text including instructions and/or data to give the model
     * @returns the model response as a string
     */
    async generateText(prompt: string): Promise<string> {
        console.log("Generating text with OpenAI model...");
        const response = await this.callLLM(prompt);
        this.exportPrompt(prompt, response);
        return response;
    }

    /**
     * Clean JSON response by removing markdown code blocks and extra whitespace
     * @param response the raw response from the model
     * @returns cleaned JSON string
     */
    private cleanJsonResponse(response: string): string {
        // Remove markdown code blocks (```json ... ```)
        let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '');

        // Remove any leading/trailing whitespace
        cleaned = cleaned.trim();

        // If the response starts with ``` and ends with ```, remove them
        if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
            cleaned = cleaned.slice(3, -3).trim();
        }

        return cleaned;
    }


    /**
     * Recursively generate examples from schema properties
     * @param schema the schema or schema property to generate example for
     * @returns example value based on schema type
     */
    private generateExampleFromSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') {
            return null;
        }

        // Handle different schema types
        switch (schema.type) {
            case 'string':
                return this.generateStringExample(schema);
            case 'number':
                return this.generateNumberExample(schema);
            case 'integer':
                return this.generateIntegerExample(schema);
            case 'boolean':
                return true;
            case 'array':
                return this.generateArrayExample(schema);
            case 'object':
                return this.generateObjectExample(schema);
            case 'null':
                return null;
            default:
                // Handle complex types or unknown types
                if (schema.anyOf) {
                    return this.generateExampleFromSchema(schema.anyOf[0]);
                }
                if (schema.oneOf) {
                    return this.generateExampleFromSchema(schema.oneOf[0]);
                }
                if (schema.allOf) {
                    return this.generateExampleFromSchema(schema.allOf[0]);
                }
                if (schema.enum) {
                    return schema.enum[0];
                }
                if (schema.const !== undefined) {
                    return schema.const;
                }
                return null;
        }
    }

    /**
     * Generate string example based on constraints
     */
    private generateStringExample(schema: any): string {
        if (schema.enum) {
            return schema.enum[0];
        }
        if (schema.const) {
            return schema.const;
        }

        let example = "example_string";

        // Add prefix based on format
        if (schema.format) {
            switch (schema.format) {
                case 'email':
                    example = "user@example.com";
                    break;
                case 'uri':
                    example = "https://example.com";
                    break;
                case 'date':
                    example = "2024-01-01";
                    break;
                case 'date-time':
                    example = "2024-01-01T12:00:00Z";
                    break;
                case 'uuid':
                    example = "123e4567-e89b-12d3-a456-426614174000";
                    break;
                case 'hostname':
                    example = "example.com";
                    break;
                case 'ipv4':
                    example = "192.168.1.1";
                    break;
                case 'ipv6':
                    example = "2001:db8::1";
                    break;
            }
        }

        // Adjust length based on constraints
        if (schema.minLength && example.length < schema.minLength) {
            example = example.padEnd(schema.minLength, 'x');
        }
        if (schema.maxLength && example.length > schema.maxLength) {
            example = example.substring(0, schema.maxLength);
        }

        return example;
    }

    /**
     * Generate number example based on constraints
     */
    private generateNumberExample(schema: any): number {
        if (schema.const !== undefined) {
            return schema.const;
        }

        let example = 42.5;

        if (schema.minimum !== undefined) {
            example = Math.max(example, schema.minimum);
        }
        if (schema.maximum !== undefined) {
            example = Math.min(example, schema.maximum);
        }
        if (schema.exclusiveMinimum !== undefined) {
            example = Math.max(example, schema.exclusiveMinimum + 0.1);
        }
        if (schema.exclusiveMaximum !== undefined) {
            example = Math.min(example, schema.exclusiveMaximum - 0.1);
        }

        return example;
    }

    /**
     * Generate integer example based on constraints
     */
    private generateIntegerExample(schema: any): number {
        if (schema.const !== undefined) {
            return schema.const;
        }

        let example = 42;

        if (schema.minimum !== undefined) {
            example = Math.max(example, schema.minimum);
        }
        if (schema.maximum !== undefined) {
            example = Math.min(example, schema.maximum);
        }
        if (schema.exclusiveMinimum !== undefined) {
            example = Math.max(example, schema.exclusiveMinimum + 1);
        }
        if (schema.exclusiveMaximum !== undefined) {
            example = Math.min(example, schema.exclusiveMaximum - 1);
        }

        return example;
    }

    /**
     * Generate array example based on constraints
     */
    private generateArrayExample(schema: any): any[] {
        if (schema.const) {
            return schema.const;
        }

        const minItems = schema.minItems || 0;
        const maxItems = schema.maxItems || Math.max(minItems, 3);
        const itemCount = Math.min(Math.max(minItems, 2), maxItems);

        const items = [];
        for (let i = 0; i < itemCount; i++) {
            if (schema.items) {
                items.push(this.generateExampleFromSchema(schema.items));
            } else if (schema.prefixItems) {
                const itemSchema = schema.prefixItems[i] || schema.additionalItems || { type: 'string' };
                items.push(this.generateExampleFromSchema(itemSchema));
            } else {
                items.push("array_item_" + (i + 1));
            }
        }

        return items;
    }

    /**
     * Generate object example based on properties
     */
    private generateObjectExample(schema: any): any {
        if (schema.const) {
            return schema.const;
        }

        const example: any = {};

        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                example[key] = this.generateExampleFromSchema(propSchema);
            }
        }

        // Handle required properties
        if (schema.required) {
            for (const requiredKey of schema.required) {
                if (!(requiredKey in example)) {
                    example[requiredKey] = this.generateExampleFromSchema({ type: 'string' });
                }
            }
        }

        // Handle additional properties
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            example["additional_property"] = this.generateExampleFromSchema(schema.additionalProperties);
        }

        return example;
    }

    /**
     * Generate a formal example based on TSchema structure (public method)
     * @param schema the TSchema to generate an example for
     * @returns a formal example object that matches the schema
     */
    generateFormalSchemaExample(schema: TSchema): any {
        return this.generateExampleFromSchema(schema);
    }

    /**
     * Generate structured data based on the given prompt.
     * @param prompt the text including instructions and/or data to give the model
     * @param schema a JSON Schema specification (generated from TypeBox)
     * @returns the model response as data structured according to the JSON Schema specification
     */
    async generateData(prompt: string, schema: TSchema): Promise<Static<typeof schema>> {
        // console.log("Generating data with OpenAI model...");
        const validateResponse = (response: string): boolean => {
            let parsedResponse;
            try {
                // Clean the response before parsing
                const cleanedResponse = this.cleanJsonResponse(response);
                parsedResponse = JSON.parse(cleanedResponse);
            } catch (e) {
                console.error(`Model returned a non-JSON response:\n${response}\n${e}`);
                return false;
            }
            if (!checkDataSchema(schema, parsedResponse)) {
                console.error("Model response does not match schema: " + response);
                return false;
            }

            return true;
        };

        // Generate a formal example based on the schema
        const schemaExample = this.generateFormalSchemaExample(schema);

        // Add JSON schema instruction to the prompt for structured output
        const structuredPrompt = `${prompt}\n\nPlease respond with valid JSON that matches this TypeBox schema: ${JSON.stringify(schema)}\n\nExample of expected structure:\n${JSON.stringify(schemaExample, null, 2)}`;

        this.exportPrompt(structuredPrompt, "");
        let response = await this.callLLM(structuredPrompt, validateResponse);
        this.exportPrompt(structuredPrompt, response);

        // Clean the response before parsing for the final return
        const cleanedResponse = this.cleanJsonResponse(response);
        return JSON.parse(cleanedResponse);
    }

    exportPrompt(prompt: string, response: string): void {
        // Enregistrer le prompt dans un fichier avec timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const start_hour = new Date().toISOString().slice(0, 13).replace(/[:]/g, '-');
        const promptsDir = path.join(__dirname, '../../data/prompts/' + start_hour);
        // Créer le répertoire s'il n'existe pas
        if (!fs.existsSync(promptsDir)) {
            fs.mkdirSync(promptsDir, { recursive: true });
        }
        const promptFileName = `prompt_${timestamp}${response == "" ? "_noResponse" : ""}.txt`;
        const promptFilePath = path.join(promptsDir, promptFileName);
        try {
            fs.writeFileSync(promptFilePath, prompt + "\n\n" + "response: " + JSON.stringify(response), 'utf8');
            // console.log(`Prompt enregistré dans: ${promptFilePath}`);
        } catch (error) {
            console.error(`Erreur lors de l'enregistrement du prompt: ${error}`);
        }
    }

    /**
     * Calls OpenAI API to generate text based on a given prompt and handles rate limiting, response validation and retries.
     *
     * Concurrency: To take advantage of concurrent execution, invoke this function as a batch of callbacks,
     * and pass it to the `executeConcurrently` function. It will run multiple `callLLM` functions concurrently,
     * up to the limit set by `p-limit` in `OpenAIModel`'s constructor.
     *
     * @param prompt - The text prompt to send to the language model.
     * @param validator - optional check for the model response.
     * @returns A Promise that resolves with the text generated by the language model.
     */
    async callLLM(
        prompt: string,
        validator: (response: string) => boolean = () => true
    ): Promise<string> {
        // Wrap the entire retryCall sequence with the `p-limit` limiter,
        // so we don't let other calls to start until we're done with the current one
        // (in case it's failing with rate limits error and needs to be waited on and retried first)
        const rateLimitedCall = () =>
            this.limit(async () => {
                return await retryCall(
                    // call OpenAI API
                    async () => {
                        const completion = await this.openai.chat.completions.create({
                            model: this.modelName,
                            messages: [{ role: "user", content: prompt }],
                            max_tokens: this.maxTokens,
                            temperature: this.temperature

                        });
                        return completion;
                    },
                    // Check if the response exists and contains content.
                    function (response): boolean {
                        if (!response) {
                            console.error("Failed to get a model response.");
                            return false;
                        }
                        const responseText = response.choices?.[0]?.message?.content;
                        if (!responseText) {
                            console.error(`Model returned an empty response:`, response);
                            return false;
                        }
                        if (!validator(responseText)) {
                            return false;
                        }
                        console.log(
                            `✓ Completed OpenAI call (input: ${response.usage?.prompt_tokens} tokens, output: ${response.usage?.completion_tokens} tokens)`
                        );
                        return true;
                    },
                    MAX_LLM_RETRIES,
                    "Failed to get a valid model response.",
                    RETRY_DELAY_MS,
                    [], // Arguments for the LLM call
                    [] // Arguments for the validator function
                );
            });

        const response = await rateLimitedCall();
        return response.choices![0].message!.content!;
    }
}
