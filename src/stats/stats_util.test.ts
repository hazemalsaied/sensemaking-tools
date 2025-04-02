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

import {
  getAgreeRate,
  getGroupInformedConsensus,
  getGroupAgreeProbDifference,
  getDisagreeRate,
  getGroupInformedDisagreeConsensus,
  getMinDisagreeProb,
  getMinAgreeProb,
  getCommentVoteCount,
  getTotalAgreeRate,
} from "./stats_util";

describe("stats utility functions", () => {
  it("should get the agree probability for a given vote tally", () => {
    expect(
      getAgreeRate({ agreeCount: 10, disagreeCount: 5, passCount: 5, totalCount: 20 })
    ).toBeCloseTo((10 + 1) / (20 + 2));
  });

  it("should handle vote tallies with zero counts", () => {
    expect(getAgreeRate({ agreeCount: 0, disagreeCount: 0, totalCount: 0 })).toBeCloseTo(0.5);
    expect(getAgreeRate({ agreeCount: 0, disagreeCount: 5, totalCount: 5 })).toBeCloseTo(1 / 7);
    expect(getAgreeRate({ agreeCount: 5, disagreeCount: 0, totalCount: 5 })).toBeCloseTo(6 / 7);
  });

  it("should get the comment vote count with groups", () => {
    expect(
      getCommentVoteCount({
        id: "1",
        text: "hello",
        voteInfo: {
          "0": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 5,
            totalCount: 20,
          },
        },
      })
    ).toEqual(35);
  });

  it("should get the comment vote count without groups", () => {
    expect(
      getCommentVoteCount({
        id: "1",
        text: "hello",
        voteInfo: {
          agreeCount: 10,
          disagreeCount: 5,
          passCount: 0,
          totalCount: 15,
        },
      })
    ).toEqual(15);
  });

  it("should get the total agree rate across groups for a given comment", () => {
    expect(
      getTotalAgreeRate(
        {
          "0": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 5,
            totalCount: 20,
          },
        },
        false
      )
    ).toEqual(15 / 35);
  });

  it("should get the total agree rate for a given comment", () => {
    expect(
      getTotalAgreeRate(
        {
          agreeCount: 10,
          disagreeCount: 5,
          passCount: 0,
          totalCount: 15,
        },
        false
      )
    ).toEqual(10 / 15);
  });

  it("should get the group informed consensus for a given comment", () => {
    expect(
      getGroupInformedConsensus({
        id: "1",
        text: "comment1",
        voteInfo: {
          "0": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 5,
            totalCount: 20,
          },
        },
      })
    ).toBeCloseTo(((11 / 17) * 6) / 22);
  });

  it("should get the minimum agree probability across groups for a given comment", () => {
    expect(
      getMinAgreeProb({
        id: "1",
        text: "comment1",
        voteInfo: {
          "0": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 5,
            totalCount: 20,
          },
        },
      })
    ).toBeCloseTo(3 / 11);
  });

  it("should get the disagree probability for a given vote tally", () => {
    expect(
      getDisagreeRate({ agreeCount: 10, disagreeCount: 5, passCount: 5, totalCount: 20 })
    ).toBeCloseTo((5 + 1) / (20 + 2));
  });

  it("should handle vote tallies with zero counts", () => {
    expect(getDisagreeRate({ agreeCount: 0, disagreeCount: 0, totalCount: 0 })).toBeCloseTo(0.5);
    expect(getDisagreeRate({ agreeCount: 0, disagreeCount: 5, totalCount: 5 })).toBeCloseTo(6 / 7);
    expect(getDisagreeRate({ agreeCount: 5, disagreeCount: 0, totalCount: 5 })).toBeCloseTo(1 / 7);
  });

  it("should get the group informed consensus for a given comment", () => {
    expect(
      getGroupInformedDisagreeConsensus({
        id: "1",
        text: "comment1",
        voteInfo: {
          "0": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 5,
            totalCount: 20,
          },
        },
      })
    ).toBeCloseTo(((11 / 17) * 6) / 22);
  });

  it("should get the minimum agree probability across groups for a given comment", () => {
    expect(
      getMinDisagreeProb({
        id: "1",
        text: "comment1",
        voteInfo: {
          "0": {
            agreeCount: 5,
            disagreeCount: 10,
            passCount: 0,
            totalCount: 15,
          },
          "1": {
            agreeCount: 10,
            disagreeCount: 5,
            passCount: 5,
            totalCount: 20,
          },
        },
      })
    ).toBeCloseTo(3 / 11);
  });

  it("should get the group agree difference for a given comment and group", () => {
    expect(
      getGroupAgreeProbDifference(
        {
          id: "1",
          text: "comment1",
          voteInfo: {
            "0": {
              agreeCount: 1,
              disagreeCount: 2,
              passCount: 0,
              totalCount: 3,
            },
            "1": {
              agreeCount: 3,
              disagreeCount: 1,
              passCount: 0,
              totalCount: 4,
            },
          },
        },
        "0"
      )
    ).toBeCloseTo(2 / 5 - 2 / 3);
  });
});
