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

import { Type } from "@sinclair/typebox";
import { Model } from "../models/model";
import { MAX_RETRIES } from "../models/model_util";
import { getPrompt, retryCall } from "../sensemaker_utils";
import { Comment, FlatTopic, NestedTopic, Topic } from "../types";

/**
 * @fileoverview Helper functions for performing topic modeling on sets of comments.
 */

export const LEARN_TOPICS_PROMPT = `
Identify a 1-tiered hierarchical topic modeling of the following comments.

Important Considerations:
- Use Title Case for topic names.
- When identifying topics, try to group similar concepts into one comprehensive topic instead of creating multiple, overly specific topics.
- Create as few topics as possible while covering all the comments.
- Example topic names are: "Education", "Environmental Sustainability", "Transportation"
- Bad topic names are like "Community" which is too vague
`;

export function learnSubtopicsForOneTopicPrompt(parentTopic: Topic, otherTopics?: Topic[]): string {
  const otherTopicNames = otherTopics?.map((topic) => topic.name).join(", ") ?? "";

  return `
Analyze the following comments and identify relevant subtopics within the following topic:
"${parentTopic.name}"

Important Considerations:
- Use Title Case for topic and subtopic names. Do not use capital case like "name": "INFRASTRUCTURE".
- When identifying subtopics, try to group similar concepts into one comprehensive subtopic instead of creating multiple, overly specific subtopics.
- Try to create as few subtopics as possible
- No subtopic should have the same name as the main topic.
- Do not change the name of the main topic ("${parentTopic.name}").
- There are other topics that are being used on different sets of comments, do not use these topic names as subtopic names: ${otherTopicNames}

Example of Incorrect Output:

[
  {
    "name": "Economic Development",
    "subtopics": [
        { "name": "Job Creation" },
        { "name": "Business Growth" },
        { "name": "Small Business Development" },
        { "name": "Small Business Marketing" } // Incorrect: Too closely related to the "Small Business Development" subtopic
        { "name": "Infrastructure & Transportation" } // Incorrect: This is the name of a main topic
      ]
  }
]
`;
}

/**
 * Generates an LLM prompt for topic modeling of a set of comments.
 *
 * @param parentTopics - Optional. An array of top-level topics to use.
 * @returns The generated prompt string.
 */
export function generateTopicModelingPrompt(parentTopic?: Topic, otherTopics?: Topic[]): string {
  if (parentTopic) {
    return learnSubtopicsForOneTopicPrompt(parentTopic, otherTopics);
  } else {
    return LEARN_TOPICS_PROMPT;
  }
}

/**
 * Learn either topics or subtopics from the given comments.
 * @param comments the comments to consider
 * @param model the LLM to use
 * @param topic given or learned topic that subtopics will fit under
 * @param otherTopics other topics that are being used, this is used
 * to avoid duplicate topic/subtopic names
 * @param additionalContext more info to give the model
 * @returns the topics that are present in the comments.
 */
export function learnOneLevelOfTopics(
  comments: Comment[],
  model: Model,
  topic?: Topic,
  otherTopics?: Topic[],
  additionalContext?: string
): Promise<Topic[]> {
  const instructions = generateTopicModelingPrompt(topic, otherTopics);
  const schema = topic ? Type.Array(NestedTopic) : Type.Array(FlatTopic);

  return retryCall(
    async function (model: Model): Promise<Topic[]> {
      console.log(`Identifying topics for ${comments.length} statements`);
      return (await model.generateData(
        getPrompt(
          instructions,
          comments.map((comment) => comment.text),
          additionalContext
        ),
        schema
      )) as Topic[];
    },
    function (response: Topic[]): boolean {
      return learnedTopicsValid(response, topic);
    },
    MAX_RETRIES,
    "Topic identification failed.",
    undefined,
    [model],
    []
  );
}

/**
 * Validates the topic modeling response from the LLM.
 *
 * @param response The topic modeling response from the LLM.
 * @param parentTopics Optional. An array of parent topic names to validate against.
 * @returns True if the response is valid, false otherwise.
 */
export function learnedTopicsValid(response: Topic[], parentTopic?: Topic): boolean {
  const topicNames = response.map((topic) => topic.name);

  // 1. If a parentTopic is provided, ensure no other top-level topics exist except "Other".
  if (parentTopic) {
    const allowedTopicNames = [parentTopic]
      .map((topic: Topic) => topic.name.toLowerCase())
      .concat("other");
    if (!topicNames.every((name) => allowedTopicNames.includes(name.toLowerCase()))) {
      topicNames.forEach((topicName: string) => {
        if (!allowedTopicNames.includes(topicName.toLowerCase())) {
          console.warn(
            "Invalid response: Found top-level topic not present in the provided topics. Provided topics: ",
            allowedTopicNames,
            " Found topic: ",
            topicName
          );
        }
      });
      return false;
    }
  }

  // 2. Ensure no subtopic has the same name as any main topic.
  for (const topic of response) {
    const subtopicNames =
      "subtopics" in topic ? topic.subtopics.map((subtopic) => subtopic.name) : [];
    for (const subtopicName of subtopicNames) {
      if (topicNames.includes(subtopicName) && subtopicName !== "Other") {
        console.warn(
          `Invalid response: Subtopic "${subtopicName}" has the same name as a main topic.`
        );
        return false;
      }
    }
  }

  return true;
}
