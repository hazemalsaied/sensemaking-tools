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

import { VertexModel } from "../../models/vertex_model";
import { GroupedSummaryStats } from "../../stats/group_informed";
import { CommentWithVoteTallies } from "../../types";
import { TopicsSummary, TopicSummary } from "./topics";

// Mock the model response. This mock needs to be set up to return response specific for each test.
let mockCommonGroundSummary: jest.SpyInstance;
let mockDifferencesSummary: jest.SpyInstance;

const TEST_COMMENTS: CommentWithVoteTallies[] = [
  {
    id: "1",
    text: "comment 1",
    voteTalliesByGroup: {
      "0": { agreeCount: 10, disagreeCount: 5, passCount: 0, totalCount: 15 },
      "1": { agreeCount: 5, disagreeCount: 10, passCount: 5, totalCount: 20 },
    },
    topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
  },
  {
    id: "2",
    text: "comment 2",
    voteTalliesByGroup: {
      "0": { agreeCount: 10, disagreeCount: 5, passCount: 0, totalCount: 15 },
      "1": { agreeCount: 5, disagreeCount: 10, passCount: 5, totalCount: 20 },
    },
    topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }],
  },
  {
    id: "3",
    text: "comment 3",
    voteTalliesByGroup: {
      "0": { agreeCount: 10, disagreeCount: 5, passCount: 0, totalCount: 15 },
      "1": { agreeCount: 5, disagreeCount: 10, passCount: 5, totalCount: 20 },
    },
    topics: [{ name: "Topic A", subtopics: [{ name: "Subtopic A.2" }] }],
  },
  {
    id: "4",
    text: "comment 4",
    voteTalliesByGroup: {
      "0": { agreeCount: 10, disagreeCount: 5, passCount: 0, totalCount: 15 },
      "1": { agreeCount: 5, disagreeCount: 10, passCount: 5, totalCount: 20 },
    },
    topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
  },
];

describe("TopicsSummaryTest", () => {
  beforeEach(() => {
    mockCommonGroundSummary = jest.spyOn(TopicSummary.prototype, "getCommonGroundSummary");
    mockDifferencesSummary = jest.spyOn(TopicSummary.prototype, "getDifferencesOfOpinionSummary");
  });

  afterEach(() => {
    mockCommonGroundSummary.mockRestore();
    mockDifferencesSummary.mockRestore();
  });
  it("should create a properly formatted topics summary", async () => {
    // Mock the LLM calls
    mockCommonGroundSummary.mockReturnValue(
      Promise.resolve({
        text: "Some points of common ground...",
        title: "Common ground between groups: ",
      })
    );
    mockDifferencesSummary.mockReturnValue(
      Promise.resolve({
        text: "Areas of disagreement between groups...",
        title: "Differences of opinion: ",
      })
    );

    expect(
      await new TopicsSummary(
        new GroupedSummaryStats(TEST_COMMENTS),
        new VertexModel("project123", "usa")
      ).getSummary()
    ).toEqual({
      title: "## Topics",
      text: "From the statements submitted, 2 high level topics were identified, as well as 3 subtopics. Based on voting patterns between the opinion groups described above, both points of common ground as well as differences of opinion between the groups have been identified and are described below.\n",
      subContents: [
        {
          title: "### Topic A (3 statements)",
          text: "This topic included 2 subtopics.\n",
          subContents: [
            {
              text: "",
              title: "#### Subtopic A.1 (2 statements)",
              subContents: [
                {
                  text: "Some points of common ground...",
                  title: "Common ground between groups: ",
                },
                {
                  text: "Areas of disagreement between groups...",
                  title: "Differences of opinion: ",
                },
              ],
            },
            {
              title: "#### Subtopic A.2 (1 statements)",
              text: "",
              subContents: [
                {
                  text: "Some points of common ground...",
                  title: "Common ground between groups: ",
                },
                {
                  text: "Areas of disagreement between groups...",
                  title: "Differences of opinion: ",
                },
              ],
            },
          ],
        },
        {
          title: "### Topic B (1 statements)",
          text: "This topic included 1 subtopic.\n",
          subContents: [
            {
              text: "",
              title: "#### Subtopic B.1 (1 statements)",
              subContents: [
                {
                  text: "Some points of common ground...",
                  title: "Common ground between groups: ",
                },
                {
                  text: "Areas of disagreement between groups...",
                  title: "Differences of opinion: ",
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
