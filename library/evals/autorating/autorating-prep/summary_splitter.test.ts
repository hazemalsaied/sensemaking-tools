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

import { splitSummaryAndLinkComments } from "./summary_splitter";
import * as fs from "fs";
import { parse } from "csv-parse/sync";

describe("splitSummaryAndLinkComments", () => {
  const testSummaryFile = "test_summary.txt";
  const testCommentsFile = "test_comments.csv";
  const testOutputFile = "test_output.csv";

  beforeEach(() => {
    // Create dummy input files before each test
    const summaryContent = `Common ground between groups: Statement 1 [1, 2]\nDifferences of opinion: Statement 2 [3]`;
    fs.writeFileSync(testSummaryFile, summaryContent);

    const commentsContent = `"comment-id","comment_text"\n1,"Comment for statement 1"\n2,"Another comment for statement 1"\n3,"Comment for statement 2"`;
    fs.writeFileSync(testCommentsFile, commentsContent);
  });

  afterEach(() => {
    // Clean up test files after each test
    fs.unlinkSync(testSummaryFile);
    fs.unlinkSync(testCommentsFile);
    if (fs.existsSync(testOutputFile)) {
      // Only remove if the file was created
      fs.unlinkSync(testOutputFile);
    }
  });

  it("should correctly split summary and link comments", () => {
    splitSummaryAndLinkComments(testSummaryFile, testCommentsFile, testOutputFile);

    expect(fs.existsSync(testOutputFile)).toBe(true);
    const outputContent = fs.readFileSync(testOutputFile, "utf-8");
    const parsedOutput = parse(outputContent, { columns: true, skip_empty_lines: true });

    expect(parsedOutput.length).toBe(2);
    expect(parsedOutput[0].summary).toBe("Statement 1");
    expect(parsedOutput[0].comments).toBe(
      "*        Comment for statement 1\n*        Another comment for statement 1"
    );
    expect(parsedOutput[1].summary).toBe("Statement 2");
    expect(parsedOutput[1].comments).toBe("*        Comment for statement 2");
  });

  it("should handle missing comment IDs gracefully", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn");

    const summaryContentWithMissingId = `Common ground between groups: Statement 3 [1, 4]`; // Comment ID 4 doesn't exist
    fs.writeFileSync(testSummaryFile, summaryContentWithMissingId);

    splitSummaryAndLinkComments(testSummaryFile, testCommentsFile, testOutputFile);

    expect(consoleWarnSpy).toHaveBeenCalledWith("Comment with ID 4 not found.");
    consoleWarnSpy.mockRestore();

    const outputContent = fs.readFileSync(testOutputFile, "utf-8");
    const parsedOutput = parse(outputContent, { columns: true, skip_empty_lines: true });
    expect(parsedOutput[0].comments).toBe("*        Comment for statement 1"); // Only finds comment ID 1
  });
});
