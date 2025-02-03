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
import { Comment, VoteTally } from "../../types";
import { commentCitation, voteTallySummary } from "./citation_utils";

describe("Citation Utils Test", () => {
  describe("voteTallySummary", () => {
    it("should return an empty string if voteTalliesByGroup is undefined", () => {
      const comment: Comment = {
        id: "123",
        text: "test comment",
      };
      expect(voteTallySummary(comment)).toBe("");
    });

    it("should return a formatted string with vote tallies when voteTalliesByGroup is defined", () => {
      const comment: Comment = {
        id: "123",
        text: "test comment",
        voteTalliesByGroup: {
          group1: new VoteTally(10, 5),
          group2: new VoteTally(15, 2, 3),
        },
      };
      expect(voteTallySummary(comment)).toBe(
        "Votes: group1(Agree=10, Disagree=5, Pass=0) group2(Agree=15, Disagree=2, Pass=3)"
      );
    });
  });
});

describe("commentCitation", () => {
  it("should format a comment citation correctly without vote tallies", () => {
    const comment: Comment = {
      id: "123",
      text: "This is a test comment.",
    };
    expect(commentCitation(comment)).toBe(`[123](## "This is a test comment.")`);
  });

  it("should format a comment citation correctly with vote tallies", () => {
    const comment: Comment = {
      id: "123",
      text: "This is a test comment.",
      voteTalliesByGroup: {
        group1: {
          agreeCount: 10,
          disagreeCount: 5,
          passCount: 1,
          totalCount: 16,
        },
        group2: {
          agreeCount: 15,
          disagreeCount: 2,
          passCount: 3,
          totalCount: 20,
        },
      },
    };
    expect(commentCitation(comment)).toBe(
      `[123](## "This is a test comment.\nVotes: group1(Agree=10, Disagree=5, Pass=1) group2(Agree=15, Disagree=2, Pass=3)")`
    );
  });

  it("should handle comments with single quotes", () => {
    const comment: Comment = {
      id: "123",
      text: "This is a 'test' comment with 'single quotes'.",
    };
    expect(commentCitation(comment)).toBe(
      `[123](## "This is a 'test' comment with 'single quotes'.")`
    );
  });

  it("should handle comments with double quotes", () => {
    const comment: Comment = {
      id: "123",
      text: 'This is a "test" comment with "double quotes".',
    };
    expect(commentCitation(comment)).toBe(
      `[123](## "This is a \\"test\\" comment with \\"double quotes\\".")`
    );
  });

  it("should handle comments with newlines", () => {
    const comment: Comment = {
      id: "123",
      text: "This is a test comment\nwith newlines.",
    };
    expect(commentCitation(comment)).toBe(`[123](## "This is a test comment with newlines.")`);
  });
});
