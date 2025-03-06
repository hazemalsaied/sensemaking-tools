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

// Functions for different ways to summarize Comment and Vote data.

import { Model } from "../models/model";
import { Comment, SummarizationType, Summary, SummaryContent } from "../types";
import { GroupedSummaryStats, MajoritySummaryStats, SummaryStats, TopicStats } from "../stats_util";
import { IntroSummary } from "./summarization_subtasks/intro";
import { GroupsSummary } from "./summarization_subtasks/groups";
import { TopicsSummary } from "./summarization_subtasks/topics";

/**
 * Summarizes comments based on the specified summarization type.
 *
 * @param model The language model to use for summarization.
 * @param comments An array of `Comment` objects containing the comments to summarize.
 * @param summarizationType The type of summarization to perform (e.g., GROUP_INFORMED_CONSENSUS).
 * @param additionalContext Optional additional instructions to guide the summarization process. These instructions will be included verbatim in the prompt sent to the LLM.
 * @returns A Promise that resolves to the generated summary string.
 * @throws {TypeError} If an unknown `summarizationType` is provided.
 */
export async function summarizeByType(
  model: Model,
  comments: Comment[],
  summarizationType: SummarizationType,
  additionalContext?: string
): Promise<Summary> {
  let summaryStats: SummaryStats;
  if (summarizationType === SummarizationType.GROUP_INFORMED_CONSENSUS) {
    summaryStats = new GroupedSummaryStats(comments);
  } else if (summarizationType === SummarizationType.AGGREGATE_VOTE) {
    summaryStats = new MajoritySummaryStats(comments);
  } else {
    throw new TypeError("Unknown Summarization Type.");
  }
  const summaryText = await new MultiStepSummary(
    summaryStats,
    model,
    additionalContext
  ).getSummary();
  return parseStringIntoSummary(summaryText, comments);
}

/**
 * Parses a string containing claim annotations into a `Summary` object.
 *
 * @param summaryText The summary string.
 * @returns A `Summary` object representing the parsed summary.
 *
 */
export async function parseStringIntoSummary(
  groundingResult: string,
  comments: Comment[]
): Promise<Summary> {
  // Regex for citation annotations like: "[[This is a grounded claim.]]^[id1,id2]"
  const groundingCitationRegex = /\[\[(.*?)]]\^\[(.*?)]/g;
  // The regex repeatedly splits summary into segments of 3 groups appended next to each other:
  // 1. filler text, 2. claim (without brackets), 3 comment ids (without brackets)
  //
  // For example, this summary:
  //  This is a filler text.
  //  [[Grounded claim...]]^[id1] [[Deeply, fully grounded claim.]]^[id2,id3][[Claim with no space in front]]^[id4,id5,id6]
  //  Finally, this is another filler text.
  //
  // will be split into:
  // [
  //   'This is a filler text.\n',
  //   'Grounded claim...',
  //   'id1',
  //   ' ',
  //   'Deeply, fully grounded claim.',
  //   'id2,id3',
  //   '',
  //   'Claim with no space in front',
  //   'id4,id5,id6',
  //   '\nFinally, this is another filler text.'
  // ]
  const parts = groundingResult.split(groundingCitationRegex);
  const chunks: SummaryContent[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      // Add filler text, if not empty (in case two claims have no space in between)
      chunks.push({ text: parts[i] });
    }

    if (i < parts.length - 2) {
      const claim = parts[i + 1];
      const commentIds = parts[i + 2].split(",");
      chunks.push({
        text: claim,
        representativeCommentIds: commentIds,
      });
      i += 2; // bypass processed claim and comment ids elements
    }
  }
  return new Summary(chunks, comments);
}

/**
 *
 */
export class MultiStepSummary {
  private summaryStats: SummaryStats;
  private model: Model;
  // TODO: Figure out how we handle additional instructions with this structure.
  private additionalContext?: string;

  constructor(summaryStats: SummaryStats, model: Model, additionalContext?: string) {
    this.summaryStats = summaryStats;
    this.model = model;
    this.additionalContext = additionalContext;
  }

  async getSummary() {
    const introSummary = await new IntroSummary(
      this.summaryStats,
      this.model,
      this.additionalContext
    ).getSummary();
    const groupsSummary = this.summaryStats.groupBasedSummarization
      ? (await new GroupsSummary(
          this.summaryStats as GroupedSummaryStats,
          this.model,
          this.additionalContext
        ).getSummary()) + "\n\n"
      : "";
    const topicsSummary = await new TopicsSummary(
      this.summaryStats,
      this.model,
      this.additionalContext
    ).getSummary();
    // return a concatenation of the separate sections, with two newlines separating each section
    return introSummary + "\n\n" + groupsSummary + topicsSummary;
  }
}

/**
 * Quantifies topic names by adding the number of associated comments in parentheses.
 *
 * @param topics An array of `TopicStats` objects.
 * @returns A map where keys are quantified topic names and values are arrays of quantified subtopic names.
 *
 * @example
 * Example input:
 * [
 *   {
 *     name: 'Topic A',
 *     commentCount: 5,
 *     subtopicStats: [
 *       { name: 'Subtopic 1', commentCount: 2 },
 *       { name: 'Subtopic 2', commentCount: 3 }
 *     ]
 *   }
 * ]
 *
 * Expected output:
 * {
 *   'Topic A (5 comments)': [
 *     'Subtopic 1 (2 comments)',
 *     'Subtopic 2 (3 comments)'
 *   ]
 * }
 */
export function _quantifyTopicNames(topics: TopicStats[]): { [key: string]: string[] } {
  const result: { [key: string]: string[] } = {};

  for (const topic of topics) {
    const topicName = `${topic.name} (${topic.commentCount} comments)`;

    if (topic.subtopicStats) {
      result[topicName] = topic.subtopicStats.map(
        (subtopic) => `${subtopic.name} (${subtopic.commentCount} comments)`
      );
    }
  }

  return result;
}
