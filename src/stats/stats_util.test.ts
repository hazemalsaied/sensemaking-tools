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
  getAgreeProbability,
  getGroupInformedConsensus,
  getGroupAgreeProbDifference,
  getDisagreeProbability,
  getGroupInformedDisagreeConsensus,
  getMinDisagreeProb,
  getMinAgreeProb,
} from "./stats_util";

describe("stats utility functions", () => {
  it("should get the agree probability for a given vote tally", () => {
    expect(
      getAgreeProbability({ agreeCount: 10, disagreeCount: 5, passCount: 5, totalCount: 20 })
    ).toBeCloseTo((10 + 1) / (20 + 2));
  });

  it("should handle vote tallies with zero counts", () => {
    expect(getAgreeProbability({ agreeCount: 0, disagreeCount: 0, totalCount: 0 })).toBeCloseTo(
      0.5
    );
    expect(getAgreeProbability({ agreeCount: 0, disagreeCount: 5, totalCount: 5 })).toBeCloseTo(
      1 / 7
    );
    expect(getAgreeProbability({ agreeCount: 5, disagreeCount: 0, totalCount: 5 })).toBeCloseTo(
      6 / 7
    );
  });

  it("should get the group informed consensus for a given comment", () => {
    expect(
      getGroupInformedConsensus({
        id: "1",
        text: "comment1",
        voteTalliesByGroup: {
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
        voteTalliesByGroup: {
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
      getDisagreeProbability({ agreeCount: 10, disagreeCount: 5, passCount: 5, totalCount: 20 })
    ).toBeCloseTo((5 + 1) / (20 + 2));
  });

  it("should handle vote tallies with zero counts", () => {
    expect(getDisagreeProbability({ agreeCount: 0, disagreeCount: 0, totalCount: 0 })).toBeCloseTo(
      0.5
    );
    expect(getDisagreeProbability({ agreeCount: 0, disagreeCount: 5, totalCount: 5 })).toBeCloseTo(
      6 / 7
    );
    expect(getDisagreeProbability({ agreeCount: 5, disagreeCount: 0, totalCount: 5 })).toBeCloseTo(
      1 / 7
    );
  });

  it("should get the group informed consensus for a given comment", () => {
    expect(
      getGroupInformedDisagreeConsensus({
        id: "1",
        text: "comment1",
        voteTalliesByGroup: {
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
        voteTalliesByGroup: {
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
          voteTalliesByGroup: {
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
