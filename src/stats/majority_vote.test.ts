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

import { VoteTally } from "../types";
import { MajoritySummaryStats } from "./majority_vote";

const TEST_COMMENTS = [
  // Everyone Agrees
  {
    id: "1",
    text: "comment1",
    voteInfo: {
      "0": new VoteTally(20, 1, 2),
    },
  },
  // Everyone Disagrees
  {
    id: "2",
    text: "comment2",
    voteInfo: {
      "0": new VoteTally(2, 50, 3),
    },
  },
  // Split Votes
  {
    id: "3",
    text: "comment3",
    voteInfo: {
      "0": new VoteTally(10, 11, 3),
    },
  },
];

describe("MajoritySummaryStats Test", () => {
  it("should get the total number of votes from multiple comments", () => {
    const summaryStats = new MajoritySummaryStats(TEST_COMMENTS);

    // Of the 3 test comments only the two representing high agreement should be returned.
    const commonGroundComments = summaryStats.getCommonGroundComments(3);
    expect(commonGroundComments.length).toEqual(2);
    expect(commonGroundComments.map((comment) => comment.id).sort()).toEqual(["1", "2"]);
  });

  it("should get the comments with the most agreement", () => {
    const summaryStats = new MajoritySummaryStats(TEST_COMMENTS);

    const commonGroundComment = summaryStats.getCommonGroundAgreeComments(1);
    expect(commonGroundComment[0].id).toEqual("1");
  });

  it("should get the comments with the most disagreement", () => {
    const summaryStats = new MajoritySummaryStats(TEST_COMMENTS);

    const commonGroundComment = summaryStats.getCommonGroundDisagreeComments(1);
    expect(commonGroundComment[0].id).toEqual("2");
  });
});
