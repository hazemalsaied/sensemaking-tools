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

// Summarizes the input file and outputs a HTML report.
//
// There are 3 outputs:
//  summary.md: the summary as a Markdown file
//  summary.html: the summary as a HTML file with hover over citations
//  summaryAndSource.csv: a CSV of each paragraph of the summary and the comments
//     associated with them.
//
// The input CSV is expected to have the following columns: comment-id, comment_text, and votes.
// Vote data should be included in one of two forms - for data without group information the
// columns should be: agrees, disagrees, and optionally passes. For data with group information
// the columns should be: {group name}-agree-count, {group name}-disagree-count, and optionally
// {group name}-pass-count for each group.
//
// Sample Usage:
//  npx ts-node ./library/runner-cli/runner.ts --outputBasename out \
// --vertexProject "{CLOUD_PROJECT_ID}" \
// --inputFile "data.csv"

import { Command } from "commander";
import { writeFileSync } from "fs";

import {
  getCommentsFromCsv,
  getSummary
} from "./analysis_utils";

import {
  flattenCommentsToSensemakingTable,
  flattenSubContentsToSensemakingTable,
  persistSensemakingToDatabase
} from "./export_utils";
import { SensemakingRow } from "./export_utils";

import * as config from "../configs.json";



async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option("-i, --inputFile <file>", "The input file name.")
    .option(
      "-a, --additionalContext <context>",
      "A short description of the conversation to add context."
    )
    .option("-t, --tag <tag>", "Tag to associate with the analysis.")
    .option("--slug <slug>", "slug for the analysis.")
    .option("--database", "Persister l'analyse dans la base de données PostgreSQL.", true);
  program.parse(process.argv);
  const options = program.opts();
  let timestamp = new Date().toISOString().slice(0, 10);
  const language = config.default_language;
  const isoformated_today = new Date().toISOString().slice(0, 10);

  if (!options.slug) {
    console.log("Aucun slug spécifié. Sortie du programme.");
    process.exit();
  }



  let outputBasename = options.inputFile.replace(".csv", "_");
  console.log(outputBasename);
  const comments = await getCommentsFromCsv(options.inputFile);

  const summary = await getSummary(
    config.gcloud.project_id,
    comments,
    undefined,
    options.additionalContext
  );

  const markdownContent = summary.getText("MARKDOWN");
  let markdownFilename = outputBasename + "overview_" + timestamp + ".md";
  writeFileSync(markdownFilename, markdownContent);
  console.log("markdown filename: " + markdownFilename);
  // writeSummaryToHtml(summary, options.outputBasename + "-" + timestamp + "-summary.html");
  // writeSummaryToGroundedCSV(summary, options.outputBasename + "-" + timestamp + "-summaryAndSource.csv");

  const jsonContent = JSON.stringify(summary, null, 2);
  const json_filename = outputBasename + "analysis_" + timestamp + ".json";
  writeFileSync(json_filename, jsonContent);
  console.log("json filename: " + json_filename);


  const sensemakingRows = flattenCommentsToSensemakingTable(summary.comments, options.slug, options.tag);


  // Traitement des subContents
  let subContentsRows: SensemakingRow[] = [];
  if (summary.contents.length > 0 && summary.contents[summary.contents.length - 1]?.subContents) {
    console.log("summary.contents.length: " + summary.contents.length);
    const topicSubContent = summary.contents[summary.contents.length - 1];
    if (topicSubContent.subContents) {
      subContentsRows = flattenSubContentsToSensemakingTable(topicSubContent.subContents, options.slug, options.tag);
    }
  }

  // Concaténer et persister toutes les rows dans PostgreSQL
  const allSensemakingRows = [...sensemakingRows, ...subContentsRows];

  if (allSensemakingRows.length > 0) {
    if (options.database) {
      console.log(`Persistance de ${allSensemakingRows.length} enregistrements dans la base de données PostgreSQL...`);
      await persistSensemakingToDatabase(allSensemakingRows);
      console.log('Persistance terminée avec succès');
    } else {
      console.log(`Persistance désactivée. ${allSensemakingRows.length} enregistrements prêts pour la persistance.`);
    }
  } else {
    console.log('Aucun enregistrement à persister');
  }
}

main();
