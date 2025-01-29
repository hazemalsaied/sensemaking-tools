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

// This code processes data from the `bin/` directory ingest scripts. In general, the shape
// takes the form of the `CoreCommentCsvRow` structure below, together with the vote tally
// columns as specified by `VoteTallyGroupKey`

import { Sensemaker } from "../src/sensemaker";
import { VertexModel } from "../src/models/vertex_model";
import { Summary, VoteTally, Comment, SummarizationType, Topic } from "../src/types";
import * as path from "path";
import * as fs from "fs";
import { parse } from "csv-parse";

/**
 * Core comment columns, sans any vote tally rows
 */
type CoreCommentCsvRow = {
  index: number;
  timestamp: number;
  datetime: string;
  "comment-id": number;
  "author-id": number;
  agrees: number;
  disagrees: number;
  moderated: number;
  comment_text: string;
  passes: number;
  topics: string; // can contain both topics and subtopics
  topic: string;
  subtopic: string;
};

// Make this interface require that key names look like `group-N-VOTE-count`
type VoteTallyGroupKey =
  | `group-${number}-agree-count`
  | `group-${number}-disagree-count`
  | `group-${number}-pass-count`;

export interface VoteTallyCsvRow {
  [key: VoteTallyGroupKey]: number;
}

//This is a type that combines VoteTallyCsvRow and CoreCommentCsvRow
export type CommentCsvRow = VoteTallyCsvRow & CoreCommentCsvRow;

/**
 * Identify topics and subtopics when input data has not already been categorized.
 * @param project The Vertex GCloud project name
 * @param comments The comments from which topics need to be identified
 * @returns Promise resolving to a Topic collection containing the newly discovered topics and subtopics for the given comments
 */
export async function getTopicsAndSubtopics(
  project: string,
  comments: Comment[]
): Promise<Topic[]> {
  const sensemaker = new Sensemaker({
    defaultModel: new VertexModel(project, "us-central1"),
  });
  return await sensemaker.learnTopics(comments, true);
}

/**
 * Runs the summarization routines for the data set.
 * @param project The Vertex GCloud project name
 * @param comments The comments to summarize
 * @param topics The input topics to categorize against
 * @param additionalContext Additional context about the conversation to pass through
 * @returns Promise resolving to a Summary object containing the summary of the comments
 */
export async function getSummary(
  project: string,
  comments: Comment[],
  topics?: Topic[],
  additionalContext?: string
): Promise<Summary> {
  const sensemaker = new Sensemaker({
    defaultModel: new VertexModel(project, "us-central1"),
  });
  return await sensemaker.summarize(
    comments,
    SummarizationType.MULTI_STEP,
    topics,
    additionalContext
  );
}

/**
 * Parse a topics string from the categorization_runner.ts into a (possibly) nested topics and subtopics
 * array, omitting subtopics if not present in the labels.
 * @param topicsString A string in the format Topic1:Subtopic1:A;Topic2:Subtopic2.A
 * @returns Nested Topic structure
 */
export function parseTopicsString(topicsString: string): Topic[] {
  // use the new multiple topic output notation to parse multiple topics/subtopics
  const subtopicMappings = topicsString
    .split(";")
    .reduce(
      (
        topicMapping: { [key: string]: Topic[] },
        topicString: string
      ): { [key: string]: Topic[] } => {
        const [topicName, subtopicName] = topicString.split(":");
        // if we already have a mapping for this topic, add, otherwise create a new one
        topicMapping[topicName] = topicMapping[topicName] || [];
        if (subtopicName) {
          topicMapping[topicName].push({ name: subtopicName });
        }
        return topicMapping;
      },
      {}
    );
  // map key/value pairs from subtopicMappings to Topic objects
  return Object.entries(subtopicMappings).map(([topicName, subtopics]) => {
    if (subtopics.length === 0) {
      return { name: topicName };
    } else {
      return { name: topicName, subtopics: subtopics };
    }
  });
}

/**
 * Gets comments from a CSV file, in the style of the output from the input processing files
 * in the project's `bin/` directory. Core CSV rows are as for `CoreCommentCsvRow`, plus any
 * vote tallies in `VoteTallyCsvRow`.
 * @param inputFilePath
 * @returns
 */
export async function getCommentsFromCsv(inputFilePath: string): Promise<Comment[]> {
  // Determine the number of groups from the header row
  const header = fs.readFileSync(inputFilePath, { encoding: "utf-8" }).split("\n")[0];
  const numGroups = new Set(header.match(/group-\d/g) || []).size;

  if (!inputFilePath) {
    throw new Error("Input file path is missing!");
  }
  const filePath = path.resolve(inputFilePath);
  const fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });

  const parser = parse(fileContent, {
    delimiter: ",",
    columns: true,
  });

  return new Promise((resolve, reject) => {
    const data: Comment[] = [];
    fs.createReadStream(filePath)
      .pipe(parser)
      .on("error", reject)
      .on("data", (row: CommentCsvRow) => {
        if (row.moderated == -1) {
          return;
        }
        const newComment: Comment = {
          text: row.comment_text,
          id: row["comment-id"].toString(),
          voteTalliesByGroup: {},
        };
        const voteTalliesByGroup: { [key: string]: VoteTally } = {};
        for (let i = 0; i < numGroups; i++) {
          const groupKey: string = `group-${i}`;
          voteTalliesByGroup[groupKey] = new VoteTally(
            Number(row[`${groupKey}-agree-count` as VoteTallyGroupKey]),
            Number(row[`${groupKey}-disagree-count` as VoteTallyGroupKey]),
            Number(row[`${groupKey}-pass-count` as VoteTallyGroupKey])
          );
        }
        newComment.voteTalliesByGroup = voteTalliesByGroup;
        if (row.topics) {
          // In this case, use the topics output format from the categorization_runner.ts routines
          newComment.topics = parseTopicsString(row.topics);
        } else if (row.topic) {
          // Add topic and subtopic from single value columns if available
          newComment.topics = [];
          newComment.topics.push({
            name: row.topic.toString(),
            subtopics: row.subtopic ? [{ name: row.subtopic.toString() }] : [],
          });
        }

        data.push(newComment);
      })
      .on("end", () => resolve(data));
  });
}

export function getTopicsFromComments(comments: Comment[]): Topic[] {
  // Create a map from the topic name to a set of subtopic names.
  const mapTopicToSubtopicSet: { [topicName: string]: Set<string> } = {};
  for (const comment of comments) {
    for (const topic of comment.topics || []) {
      if (mapTopicToSubtopicSet[topic.name] == undefined) {
        mapTopicToSubtopicSet[topic.name] = new Set();
      }
      if ("subtopics" in topic) {
        for (const subtopic of topic.subtopics || []) {
          mapTopicToSubtopicSet[topic.name].add(subtopic.name);
        }
      }
    }
  }

  // Convert that map to a Topic array and return
  const returnTopics: Topic[] = [];
  for (const topicName in mapTopicToSubtopicSet) {
    const topic: Topic = { name: topicName, subtopics: [] };
    for (const subtopicName of mapTopicToSubtopicSet[topicName]!.keys()) {
      topic.subtopics.push({ name: subtopicName });
    }
    returnTopics.push(topic);
  }
  return returnTopics;
}
