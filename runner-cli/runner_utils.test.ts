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

import { parseTopicsString } from "./runner_utils";

// write a test for the parseTopicsString function
describe("parseTopicsString", () => {
  it("should parse a single topic string", () => {
    const topicsString = "Topic A:Subtopic A.1";
    const expectedTopics = [{ name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] }];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });

  it("should parse multiple topic strings", () => {
    const topicsString = "Topic A:Subtopic A.1;Topic B:Subtopic B.1;Topic C";
    const expectedTopics = [
      { name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] },
      { name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] },
      { name: "Topic C" },
    ];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });

  it("should handle topic strings with only topic names", () => {
    const topicsString = "Topic A;Topic B;Topic C";
    const expectedTopics = [{ name: "Topic A" }, { name: "Topic B" }, { name: "Topic C" }];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });

  it("should handle topic strings with only topic names, including : separators", () => {
    const topicsString = "Topic A:;Topic B:;Topic C:";
    const expectedTopics = [{ name: "Topic A" }, { name: "Topic B" }, { name: "Topic C" }];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });

  it("should handle topic strings with only subtopic names", () => {
    const topicsString = "Topic A:Subtopic A.1;Topic B:Subtopic B.1";
    const expectedTopics = [
      { name: "Topic A", subtopics: [{ name: "Subtopic A.1" }] },
      { name: "Topic B", subtopics: [{ name: "Subtopic B.1" }] },
    ];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });

  it("should handle topic strings with multiple subtopics", () => {
    const topicsString =
      "Topic A:Subtopic A.1;Topic A:Subtopic A.2;Topic B:Subtopic B.1;Topic B:Subtopic B.2";
    const expectedTopics = [
      { name: "Topic A", subtopics: [{ name: "Subtopic A.1" }, { name: "Subtopic A.2" }] },
      { name: "Topic B", subtopics: [{ name: "Subtopic B.1" }, { name: "Subtopic B.2" }] },
    ];
    expect(parseTopicsString(topicsString)).toEqual(expectedTopics);
  });
});
