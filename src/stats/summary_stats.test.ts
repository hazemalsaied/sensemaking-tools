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

import { Comment, VoteTally } from "../types";
import { SummaryStats } from "./summary_stats";

class TestSummaryStats extends SummaryStats {
  static override create(comments: Comment[]): TestSummaryStats {
    return new TestSummaryStats(comments);
  }

  getCommonGroundComments(k?: number): Comment[] {
    return this.comments.slice(0, k);
  }

  getCommonGroundScore(): number {
    return 1;
  }

  getCommonGroundAgreeComments(k?: number): Comment[] {
    return this.comments.slice(0, k);
  }

  getCommonGroundDisagreeComments(k?: number): Comment[] {
    return this.comments.slice(0, k);
  }

  getDifferenceOfOpinionScore(): number {
    return 1;
  }

  getUncertainComments(k?: number): Comment[] {
    return this.comments.slice(0, k);
  }

  getUncertainScore(): number {
    return 1;
  }

  getCommonGroundNoCommentsMessage(): string {
    return "There are no common ground comments.";
  }

  getDifferenceOfOpinionComments(k?: number): Comment[] {
    return this.comments.slice(0, k);
  }

  getDifferencesOfOpinionNoCommentsMessage(): string {
    return "There are no difference of opinion comments.";
  }
}

describe("Summary Stats methods", () => {
  it("should get stats by topic", () => {
    const comment = {
      text: "More clinicians/support providers.",
      id: "7610",
      voteTalliesByGroup: {
        "Group-1": new VoteTally(2, 0, 6),
      },
      topics: [
        {
          name: "Healthcare",
          subtopics: [{ name: "Childcare and Family Support" }, { name: "Senior Care" }],
        },
      ],
    } as Comment;

    const summaryStats = new TestSummaryStats([comment]);

    const actual = summaryStats.getStatsByTopic();
    expect(actual.length).toEqual(1);
    expect(actual[0]).toEqual({
      name: "Healthcare",
      commentCount: 1,
      subtopicStats: [
        {
          name: "Childcare and Family Support",
          commentCount: 1,
          summaryStats: expect.any(TestSummaryStats),
        },
        {
          name: "Senior Care",
          commentCount: 1,
          summaryStats: expect.any(TestSummaryStats),
        },
      ],
      summaryStats: {
        minCommonGroundProb: 0.6,
        minUncertaintyProb: 0.3,
        minAgreeProbDifference: 0.3,
        maxSampleSize: 12,
        minVoteCount: 20,
        groupBasedSummarization: true,
        comments: [comment],
        filteredComments: [],
      },
    });
  });
});
