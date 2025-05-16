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

// Autorating prep runner

// Command to run:
// npx ts-node evals/autorating/autorating-prep/run_prep.ts -s <path/to/summary.txt> -c <path/to/comments.csv> -o <path/to/output.csv>

import { Command } from "commander";
import { splitSummaryAndLinkComments } from "./summary_splitter";
import * as path from "path";

async function main() {
  const program = new Command();

  program
    .requiredOption(
      "-s, --summaryFile <file>",
      "Path to the summary file",
      "evals/autorating/autorating-prep/summary.txt"
    )
    .requiredOption(
      "-c, --commentsFile <file>",
      "Path to the comments CSV file",
      "evals/autorating/autorating-prep/comments.csv"
    )
    .option(
      "-o, --outputFile <file>",
      "Path to the output CSV file",
      "evals/autorating/autorating-prep/summary_statements.csv"
    );

  program.parse(process.argv);
  const options = program.opts();

  const summaryFilePath = path.resolve(options.summaryFile);
  const commentsFilePath = path.resolve(options.commentsFile);
  const outputFilePath = path.resolve(options.outputFile);

  splitSummaryAndLinkComments(summaryFilePath, commentsFilePath, outputFilePath);
}

main();
