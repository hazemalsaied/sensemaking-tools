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
import { Comment } from "../../types";
import { IntroSummary } from "./intro";

const TEST_COMMENTS: Comment[] = [
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
    topics: [{ name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] }],
  },
];

describe("IntroTest", () => {
  it("should create an intro section", async () => {
    const temp = new GroupedSummaryStats(TEST_COMMENTS);
    console.log(temp);
    expect(
      await new IntroSummary(
        new GroupedSummaryStats(TEST_COMMENTS),
        new VertexModel("project123", "usa")
      ).getSummary()
    ).toEqual(`## Introduction

This report summarizes the results of public input, encompassing __4 statements__. All voters were anonymous. The public input collected covered a wide range of topics and subtopics including:
 * __Topic A (3 statements)__
     * Subtopic A.1 (2), Subtopic A.2 (1)
 * __Topic B (1 statements)__
     * Subtopic B.1 (1)\n`);
  });
});
