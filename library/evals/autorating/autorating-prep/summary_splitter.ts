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

// A tool that splits a summary into separate statements for autorating.

import * as fs from "fs";
import { parse } from "csv-parse/sync";

/**
 * Takes a summary file where statements are linked to comment IDs (in brackets),
 * and a CSV file containing comment IDs and their text. Then generates a new CSV file
 * where each row represents a statement and its associated comments.
 *
 * @param summaryFilePath Path to the summary text file.
 * @param commentsFilePath Path to the comments CSV file with columns "comment-id" and "comment_text".
 * @param outputFilePath Path to the output CSV file that will have columns "summary" for the statement, and "comments" for the comment texts associated with that statement.
 */
export function splitSummaryAndLinkComments(
  summaryFilePath: string,
  commentsFilePath: string,
  outputFilePath: string
) {
  const summaryText = fs.readFileSync(summaryFilePath, "utf-8");
  const commentsFileContent = fs.readFileSync(commentsFilePath, "utf-8");

  const commentData = parse(commentsFileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const statementsWithComments: { summary: string; comments: string }[] = [];

  // Statement format we look for:
  // Common ground between groups: Participants suggest... [1, 2, 3]
  // Differences of opinion: Participants diverged... [4, 5]
  const statementRegex = /(Common ground between groups|Differences of opinion): (.*) \[(.*?)]/g;
  let match;

  while ((match = statementRegex.exec(summaryText)) !== null) {
    const statement = match[2].trim();
    const commentIds = match[3].split(",").map(Number);

    let commentsForStatement = "";
    for (const commentId of commentIds) {
      const commentRow = commentData.find(
        (row: { [col: string]: string }) => parseInt(row["comment-id"]) === commentId
      );

      if (commentRow) {
        // make comments look like a bulleted list: "*        More cafes"
        commentsForStatement += `*        ${commentRow["comment_text"]}\n`;
      } else {
        console.warn(`Comment with ID ${commentId} not found.`);
      }
    }
    statementsWithComments.push({
      summary: statement,
      comments: commentsForStatement.trim(),
    });
  }

  const csvOutput =
    "summary,comments\n" +
    statementsWithComments
      .map((item) => `"${item.summary.replace(/"/g, '""')}","${item.comments.replace(/"/g, '""')}"`)
      .join("\n");

  fs.writeFileSync(outputFilePath, csvOutput);
  console.log(`Summary statements saved to ${outputFilePath}`);
}
