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
  GroupedSummaryStats,
  getAgreeProbability,
  getGroupInformedConsensus,
  getGroupAgreeProbDifference,
  getDisagreeProbability,
  getGroupInformedDisagreeConsensus,
  getMinDisagreeProb,
  getMinAgreeProb,
} from "./stats_util";
import { Comment } from "./types";

const TEST_COMMENTS = [
  {
    id: "1",
    text: "comment1",
    voteTalliesByGroup: {
      "0": {
        agreeCount: 20,
        disagreeCount: 10,
        passCount: 0,
        totalCount: 30,
      },
      "1": {
        agreeCount: 5,
        disagreeCount: 10,
        passCount: 5,
        totalCount: 20,
      },
    },
  },
  {
    id: "2",
    text: "comment2",
    voteTalliesByGroup: {
      "0": {
        agreeCount: 2,
        disagreeCount: 5,
        passCount: 3,
        totalCount: 10,
      },
      "1": {
        agreeCount: 5,
        disagreeCount: 3,
        passCount: 2,
        totalCount: 10,
      },
    },
  },
];

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

describe("StatsUtilTest", () => {
  it("should get the total number of votes from multiple comments", () => {
    const summaryStats = new GroupedSummaryStats(TEST_COMMENTS);
    expect(summaryStats.voteCount).toEqual(70);
  });

  it("SummaryStats should get the total number of comments", () => {
    const summaryStats = new GroupedSummaryStats(TEST_COMMENTS);
    expect(summaryStats.commentCount).toEqual(2);
  });

  it("should count comments by topic", () => {
    const comments: Comment[] = [
      {
        id: "1",
        text: "comment 1",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
      },
      {
        id: "2",
        text: "comment 2",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
      },
      {
        id: "3",
        text: "comment 3",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.2" }] }],
      },
    ];

    const statsByTopic = new GroupedSummaryStats(comments).getStatsByTopic();
    expect(statsByTopic[0].commentCount).toEqual(3);
    expect(statsByTopic[0]?.subtopicStats?.map((subtopic) => subtopic.commentCount)).toEqual([
      2, 1,
    ]);
  });

  it("should sort topics by comment count and put 'Other' topics and subtopics last", () => {
    const comments: Comment[] = [
      {
        id: "1",
        text: "comment 1",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
      },
      {
        id: "2",
        text: "comment 2",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
      },
      {
        id: "3",
        text: "comment 3",
        topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.2" }] }],
      },

      {
        id: "4",
        text: "comment 4",
        topics: [{ name: "Other", subtopics: [{ name: "Subtopic Other.1" }] }],
      },
      {
        id: "5",
        text: "comment 5",
        topics: [{ name: "Other", subtopics: [{ name: "Subtopic Other.1" }] }],
      },
      { id: "6", text: "comment 6", topics: [{ name: "Other", subtopics: [{ name: "Other" }] }] },
      { id: "7", text: "comment 7", topics: [{ name: "Other", subtopics: [{ name: "Other" }] }] },
      { id: "8", text: "comment 8", topics: [{ name: "Other", subtopics: [{ name: "Other" }] }] },

      {
        id: "9",
        text: "comment 9",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
      },
      {
        id: "10",
        text: "comment 10",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
      },
      {
        id: "11",
        text: "comment 11",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
      },
      {
        id: "12",
        text: "comment 12",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
      },
      {
        id: "13",
        text: "comment 13",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.2" }] }],
      },
      {
        id: "14",
        text: "comment 14",
        topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.2" }] }],
      },
    ];

    const statsByTopic = new GroupedSummaryStats(comments).getStatsByTopic();
    expect(statsByTopic.map((topic) => topic.name)).toEqual(["Topic B", "Topic A", "Other"]);
  });

  it("should get the representative comments for a given group", () => {
    const representativeComments = new GroupedSummaryStats(
      TEST_COMMENTS
    ).getGroupRepresentativeComments("0");
    expect(representativeComments.length).toEqual(1);
    expect(representativeComments[0].id).toEqual("1");
  });

  it("should return empty array if there are no comments with vote tallies", () => {
    const commentsWithoutVotes: Comment[] = [
      { id: "1", text: "comment1" },
      { id: "2", text: "comment2" },
    ];
    expect(
      new GroupedSummaryStats(commentsWithoutVotes).getGroupRepresentativeComments("0")
    ).toEqual([]);
  });
});
