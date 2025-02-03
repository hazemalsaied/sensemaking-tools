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

// Run the summarizer based on CSV data as output from the processing scripts in the `bin`
// directory, and as documented in `runner_utils.ts`.

import { Command } from "commander";
import * as fs from "fs";
import { marked } from "marked";
import {
  getCommentsFromCsv,
  getSummary,
  getTopicsFromComments,
  getTopicsAndSubtopics,
} from "./runner_utils";
import { type Topic } from "../src/types";

async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option("-o, --outputFile <file>", "The output file name.")
    .option("-i, --inputFile <file>", "The input file name.")
    .option(
      "-a, --additionalContext <context>",
      "A short description of the conversation to add context."
    )
    .option("-v, --vertexProject <project>", "The Vertex Project name.");
  program.parse(process.argv);
  const options = program.opts();

  const comments = await getCommentsFromCsv(options.inputFile);
  // check if any comments have topics before using getTopicsFromComments, otherwise, learn topics using runner_utils function
  let topics: Topic[];
  if (comments.length > 0 && comments.some((comment) => comment.topics)) {
    console.log("Comments already have topics. Skipping topic learning.");
    topics = getTopicsFromComments(comments);
  } else {
    console.log("Learning topics from comments.");
    topics = await getTopicsAndSubtopics(options.vertexProject, comments);
  }

  const summary = await getSummary(
    options.vertexProject,
    comments,
    topics,
    options.additionalContext
  );
  const markdownContent = summary.getText("MARKDOWN");
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Summary</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
    </style>
    ${
      // When in DEBUG_MODE, we need to add the DataTables and jQuery libraries, and hook
      // into our table elements to add support for features like sorting and search.
      process.env.DEBUG_MODE === "true"
        ? `
    <script src="https://code.jquery.com/jquery-3.7.1.js"></script>
    <script src="https://cdn.datatables.net/2.2.1/js/dataTables.js"></script>
    <link rel="stylesheet" href="https://cdn.datatables.net/2.2.1/css/dataTables.dataTables.css" />
    <script>$(document).ready( function () {$('table').DataTable();} )</script>
    `
        : ""
    }
</head>
<body>
    ${marked(markdownContent)}
</body>
</html>`;

  const outputPath = `${options.outputFile}.html`;
  fs.writeFileSync(outputPath, htmlContent);
  console.log(`Written summary to ${outputPath}`);
}

main();
