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

// Module to interact with sensemaking tools.

import { generateTopicModelingPrompt, learnedTopicsValid } from "./tasks/topic_modeling";
import { MAX_RETRIES } from "./models/vertex_model";
import {
  CommentRecord,
  Comment,
  SummarizationType,
  Summary,
  FlatTopic,
  NestedTopic,
  Topic,
} from "./types";
import { categorizeWithRetry, generateCategorizationPrompt } from "./tasks/categorization";
import { summarizeByType } from "./tasks/summarization";
import { getPrompt, hydrateCommentRecord, retryCall } from "./sensemaker_utils";
import { Type } from "@sinclair/typebox";
import { ModelSettings, Model } from "./models/model";
import { resolvePromisesInParallel } from "./tasks/summarization_subtasks/recursive_summarization";

// Class to make sense of conversation data. Uses LLMs to learn what topics were discussed and
// categorize comments. Then these categorized comments can be used with optional Vote data to
// summarize a conversation.
export class Sensemaker {
  private modelSettings: ModelSettings;

  /**
   * Creates a Sensemaker object
   * @param modelSettings what models to use for what tasks, a default model can be set.
   */
  constructor(modelSettings: ModelSettings) {
    this.modelSettings = modelSettings;
  }

  /**
   * Get corresponding model from modelSettings object, or defaultModel if none specified.
   * @param modelSetting the key of the modelSettings options you want the Model for (corresponding to task)
   * @return The model to use for the corresponding ModelSetting key
   */
  getModel(modelSetting: keyof ModelSettings): Model {
    // Consider getting rid of this function once we have non default model
    // implementations, in case we want to switch to a static compilation of the correct model for each key.
    return this.modelSettings[modelSetting] || this.modelSettings.defaultModel;
  }

  /**
   * Generates a conversation summary, optionally incorporating vote data.
   *
   * It offers flexibility in how topics for the summary are determined:
   * 1. Categorized Comments: If the input `comments` are already categorized (i.e., they have a
   *    `topics` property), those topics are used directly for the summary structure.
   * 2. Provided Topics:  If `topics` are explicitly provided, they are used to categorize the
   *    comments before summarization. This ensures the summary has statistics based on the
   *    specified topics (like comments count per topic).
   * 3. Learned Topics: If neither categorized comments nor explicit topics are provided, the
   *    function will automatically learn topics from the comments using an LLM. This is the most
   *    automated option but requires more processing time.
   *
   * The function supports different summarization types (e.g., basic summarization,
   * vote-tally-based summarization), and allows for additional instructions to guide the
   * summarization process. The generated summary is then grounded in the original comments to
   * ensure accuracy and relevance.
   *
   * @param comments An array of `Comment` objects representing the public conversation comments. If
   *  these comments are already categorized (have a `topics` property), the summarization will be
   *  based on those existing categories.
   * @param summarizationType  The type of summarization to perform (e.g.,
   *  `SummarizationType.GROUP_INFORMED_CONSENSUS`). Defaults to
   *  `SummarizationType.GROUP_INFORMED_CONSENSUS`.
   * @param topics  An optional array of `Topic` objects. If provided, these topics will be used for
   *  comment categorization before summarization, ensuring that the summary addresses the specified
   *  topics. If `comments` are already categorized, this parameter is ignored.
   * @param additionalContext Optional additional context to provide to the LLM for
   *  summarization. The context will be appended verbatim to the summarization prompt. This
   * should be 1-2 sentences on what the conversation is about and where it takes place.
   * @returns A Promise that resolves to a `Summary` object, containing the generated summary text
   *  and metadata.
   */
  public async summarize(
    comments: Comment[],
    summarizationType: SummarizationType = SummarizationType.AGGREGATE_VOTE,
    topics?: Topic[],
    additionalContext?: string
  ): Promise<Summary> {
    const startTime = performance.now();

    // categories are required for summarization - make sure comments are categorized
    if (comments.length > 0 && !comments[0].topics) {
      if (!topics) {
        topics = await this.learnTopics(
          comments,
          true, // including subtopics (as they are important for summaries)
          undefined, // no top level topics specified
          additionalContext
        );
      }
      comments = await this.categorizeComments(comments, true, topics, additionalContext);
    }
    const summary = await retryCall(
      async function (
        model: Model,
        comments: Comment[],
        summarizationType: SummarizationType
      ): Promise<Summary> {
        return summarizeByType(model, comments, summarizationType, additionalContext);
      },
      // TODO: Consider if the Summary needs any final checks.
      function (): boolean {
        return true;
      },
      MAX_RETRIES,
      "The statistics don't match what's in the summary.",
      undefined,
      [this.getModel("summarizationModel"), comments, summarizationType],
      []
    );

    console.log(`Summarization took ${(performance.now() - startTime) / (1000 * 60)} minutes.`);
    return summary;
  }

  /**
   * Extracts topics from the comments using a LLM on Vertex AI. Retries if the LLM response is invalid.
   * @param comments The comments data for topic modeling
   * @param includeSubtopics Whether to include subtopics in the topic modeling
   * @param topics Optional. The user provided top-level topics, if these are specified only
   * subtopics will be learned.
   * @param additionalContext Optional additional context to provide to the LLM for
   *  topic learning. The context will be appended verbatim to the prompt. This
   * should be 1-2 sentences on what the conversation is about and where it takes place.
   * @returns: Topics (optionally containing subtopics) representing what is discussed in the
   * comments.
   */
  public async learnTopics(
    comments: Comment[],
    includeSubtopics: boolean,
    topics?: Topic[],
    additionalContext?: string
  ): Promise<Topic[]> {
    const startTime = performance.now();

    const instructions = generateTopicModelingPrompt(includeSubtopics, topics);

    // surround each comment by triple backticks to avoid model's confusion with single, double quotes and new lines
    const commentTexts = comments.map((comment) => "```" + comment.text + "```");
    // decide which schema to use based on includeSubtopics
    const schema = Type.Array(includeSubtopics ? NestedTopic : FlatTopic);

    return retryCall(
      async function (model: Model): Promise<Topic[]> {
        return (await model.generateData(
          getPrompt(instructions, commentTexts, additionalContext),
          schema
        )) as Topic[];
      },
      function (response: Topic[]): boolean {
        console.log(
          `Topic learning took ${(performance.now() - startTime) / (1000 * 60)} minutes.`
        );
        return learnedTopicsValid(response, topics);
      },
      MAX_RETRIES,
      "Topic modeling failed.",
      undefined,
      [this.getModel("categorizationModel")],
      []
    );
  }

  /**
   * Categorize the comments by topics using a LLM on Vertex.
   * @param comments The data to summarize
   * @param includeSubtopics Whether to include subtopics in the categorization.
   * @param topics The user provided topics (and optionally subtopics).
   * @param additionalContext Optional additional context to provide to the LLM for
   * categorization. The context will be appended verbatim to the prompt. This
   * should be 1-2 sentences on what the conversation is about and where it takes place.
   * @returns: The LLM's categorization.
   */
  public async categorizeComments(
    comments: Comment[],
    includeSubtopics: boolean,
    topics?: Topic[],
    additionalContext?: string
  ): Promise<Comment[]> {
    const startTime = performance.now();

    if (!topics) {
      topics = await this.learnTopics(comments, includeSubtopics, undefined, additionalContext);
    }

    const instructions = generateCategorizationPrompt(topics, includeSubtopics);

    // TODO: Consider the effects of smaller batch sizes. 1 comment per batch was much faster, but
    // the distribution was significantly different from what we're currently seeing. More testing
    // is needed to determine the ideal size and distribution.
    const batchesToCategorize: Promise<CommentRecord[]>[] = [];
    for (
      let i = 0;
      i < comments.length;
      i += this.modelSettings.defaultModel.categorizationBatchSize
    ) {
      const uncategorizedBatch = comments.slice(
        i,
        i + this.modelSettings.defaultModel.categorizationBatchSize
      );
      batchesToCategorize.push(
        categorizeWithRetry(
          this.modelSettings.defaultModel,
          instructions,
          uncategorizedBatch,
          includeSubtopics,
          topics,
          additionalContext
        )
      );
    }

    const categorized: CommentRecord[] = [];
    await resolvePromisesInParallel(batchesToCategorize).then((results: CommentRecord[][]) => {
      results.forEach((batch) => categorized.push(...batch));
    });

    const categorizedComments = hydrateCommentRecord(categorized, comments);
    console.log(`Categorization took ${(performance.now() - startTime) / (1000 * 60)} minutes.`);
    return categorizedComments;
  }
}
