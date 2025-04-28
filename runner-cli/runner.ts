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
import { writeFileSync } from "fs";
import {
  getCommentsFromCsv,
  getSummary,
  writeSummaryToGroundedCSV,
  writeSummaryToHtml,
} from "./runner_utils";

async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option(
      "-o, --outputBasename <file>",
      "The output basename, this will be prepended to the output file names."
    )
    .option("-i, --inputFile <file>", "The input file name.")
    .option(
      "-a, --additionalContext <context>",
      "A short description of the conversation to add context."
    )
    .option("-v, --vertexProject <project>", "The Vertex Project name.");
  program.parse(process.argv);
  const options = program.opts();

  const comments = await getCommentsFromCsv(options.inputFile);

  const summary = await getSummary(
    options.vertexProject,
    comments,
    undefined,
    options.additionalContext
  );

  const markdownContent = summary.getText("MARKDOWN");
  writeFileSync(options.outputBasename + "-summary.md", markdownContent);
  writeSummaryToHtml(summary, options.outputBasename + "-summary.html");
  writeSummaryToGroundedCSV(summary, options.outputBasename + "-summaryAndSource.csv");

  const jsonContent = JSON.stringify(summary, null, 2);
  writeFileSync(options.outputBasename + "-summary.json", jsonContent);
}

main();
