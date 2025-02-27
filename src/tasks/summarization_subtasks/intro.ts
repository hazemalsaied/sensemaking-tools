// Copyright 2025 Google LLC
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

import { SummaryStats, TopicStats } from "../../stats_util";
import { RecursiveSummary } from "./recursive_summarization";

export class IntroSummary extends RecursiveSummary<SummaryStats> {
  getSummary() {
    const commentCountFormatted = this.input.commentCount.toLocaleString();
    const voteCountFormatted = this.input.voteCount.toLocaleString();
    let text =
      `This report summarizes the results of public input, encompassing ` +
      `__${commentCountFormatted} statements__` +
      `${this.input.voteCount > 0 ? ` and __${voteCountFormatted} votes__` : ""}. All voters were anonymous. The ` +
      `public input collected covered a wide range of topics ` +
      `${this.input.containsSubtopics ? "and subtopics " : ""}` +
      `including:\n`;

    for (const topicStats of this.input.getStatsByTopic()) {
      text += ` * __${topicStats.name} (${topicStats.commentCount} statements)__\n`;
      if (!topicStats.subtopicStats) {
        continue;
      }
      const subtopics = topicStats.subtopicStats.map((subtopic: TopicStats) => {
        return `${subtopic.name} (${subtopic.commentCount})`;
      });
      text += "     * " + subtopics.join(", ") + "\n";
    }

    return Promise.resolve(
      `## Introduction

${text}`
    );
  }
}
