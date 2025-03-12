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

// A Overview or Table of Contents for a summary.

import { SummaryStats } from "../../stats/summary_stats";
import { SummaryContent } from "../../types";
import { RecursiveSummary } from "./recursive_summarization";

export class OverviewSummary extends RecursiveSummary<SummaryStats> {
  getSummary(): Promise<SummaryContent> {
    let text = `The public input collected covered a wide range of topics:\n`;

    const totalComments = this.input.commentCount;
    for (const topicStats of this.input.getStatsByTopic()) {
      const commentPercentage = Math.round((topicStats.commentCount / totalComments) * 100);
      text += ` * ${topicStats.name} (${commentPercentage}% of statements)\n`;
    }

    return Promise.resolve({ title: "## Overview", text: text });
  }
}
