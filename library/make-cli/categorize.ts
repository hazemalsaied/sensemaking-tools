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

// Learns and assigns topics and subtopics to a CSV of comments.
//
// The input CSV must contain "comment_text" and "comment-id" fields. The output CSV will contain
// all input fields plus a new "topics" field which concatenates all topics and subtopics, e.g.
// "Transportation:PublicTransit;Transportation:Parking;Technology:Internet"
//
// Sample Usage:
// npx ts-node library/runner-cli/categorization_runner.ts \
//    --topicDepth 2 \
//    --outputFile ~/outputs/test.csv  \
//    --vertexProject "{CLOUD_PROJECT_ID}" \
//    --inputFile ~/input.csv \

import { VertexModel } from "../src/models/vertex_model";
import { Sensemaker } from "../src/sensemaker";
import { Comment, Topic } from "../src/types";
import { Command } from "commander";
import { parse } from "csv-parse";
import { createObjectCsvWriter } from "csv-writer";
import * as fs from "fs";
import * as path from "path";
import { concatTopics, parseTopicsString } from "./analysis_utils";
import * as config from "../configs.json";
import { displayTopicHierarchy, extractExistingTopicsFromCsv, CommentCsvRow } from "./categorization_utils";



async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option("-i, --inputFile <file>", "The input file name.")
    .option("-p, --processd <boolean>", "Contine the achieved categorization!", true);
  program.parse(process.argv);
  const options = program.opts();

  const csvRows = await readCsv(options.inputFile);
  let comments = convertCsvRowsToComments(csvRows);

  // Extract existing topics from CSV if available and not forcing rerun
  let topics: Topic[] | undefined;
  topics = extractExistingTopicsFromCsv(csvRows);

  // Afficher la hiérarchie des thèmes de manière élégante
  displayTopicHierarchy(topics || []);


  const language = config.default_language;
  console.log(`Analysis language:${language}`)
  // Learn topics and categorize comments.
  const sensemaker = new Sensemaker({
    defaultModel: new VertexModel(config.gcloud.project_id, config.gcloud.location),
  });
  const categorizedComments = await sensemaker.categorizeComments(
    comments,
    true,
    topics,
    "",
    2,
    language,
    'data/categorization_tmp'
  );

  const csvRowsWithTopics = setTopics(csvRows, categorizedComments);
  let timestamp = new Date().toISOString().slice(0, 10);
  let outputBasename = options.inputFile.replace(".csv", "_categorized_" + timestamp + ".csv");

  await writeCsv(csvRowsWithTopics, outputBasename);
}

async function readCsv(inputFilePath: string): Promise<CommentCsvRow[]> {
  if (!inputFilePath) {
    throw new Error("Input file path is missing!");
  }
  const filePath = path.resolve(inputFilePath);
  const fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });

  const parser = parse(fileContent, {
    delimiter: ",",
    columns: true,
  });

  return new Promise((resolve, reject) => {
    const allRows: CommentCsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(parser)
      .on("error", (error) => reject(error))
      .on("data", (row: CommentCsvRow) => {
        allRows.push(row);
      })
      .on("end", () => {
        // Renommer les colonnes françaises vers les noms anglais
        renameColumns(allRows);

        // Valider que toutes les colonnes requises existent
        validateRequiredColumns(allRows);

        resolve(allRows);
      });
  });
}

function convertCsvRowsToComments(csvRows: CommentCsvRow[]): Comment[] {
  const comments: Comment[] = [];
  for (const row of csvRows) {
    const comment: Comment = {
      text: row["comment_text"],
      id: row["comment-id"],
    };

    // If topics exist in the CSV, parse them and add to the comment
    if (row.topics && row.topics.trim()) {
      try {
        comment.topics = parseTopicsString(row.topics);
      } catch (error) {
        console.warn(`Failed to parse topics for comment ${row["comment-id"]}: ${error}`);
      }
    }

    comments.push(comment);
  }
  return comments;
}

function setTopics(csvRows: CommentCsvRow[], categorizedComments: Comment[]): CommentCsvRow[] {
  // Create a map from comment-id to csvRow
  const mapIdToCsvRow: { [commentId: string]: CommentCsvRow } = {};
  for (const csvRow of csvRows) {
    const commentId = csvRow["comment-id"];
    mapIdToCsvRow[commentId] = csvRow;
  }

  // For each comment in categorizedComments
  //   lookup corresponding original csv row
  //   add a "topics" field that concatenates all topics/subtopics
  const csvRowsWithTopics: CommentCsvRow[] = [];
  for (const comment of categorizedComments) {
    const csvRow = mapIdToCsvRow[comment.id];
    csvRow["topics"] = concatTopics(comment);
    csvRowsWithTopics.push(csvRow);
  }
  return csvRowsWithTopics;
}

async function writeCsv(csvRows: CommentCsvRow[], outputFile: string) {
  // Expect that all objects have the same keys, and make id match header title
  const header: { id: string; title: string }[] = [];
  for (const column of Object.keys(csvRows[0])) {
    header.push({ id: column, title: column });
  }
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: header,
  });
  csvWriter
    .writeRecords(csvRows)
    .then(() => console.log(`CSV file written successfully to ${outputFile}.`));
}




function validateRequiredColumns(csvRows: CommentCsvRow[]): void {
  if (csvRows.length === 0) {
    throw new Error("Le fichier CSV est vide!");
  }

  const requiredColumns = [
    "comment_text",
    "votes",
    "agree_rate",
    "disagree_rate",
    "pass_rate",
    "comment-id"
  ];

  const firstRow = csvRows[0];
  const existingColumns = Object.keys(firstRow);
  const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

  if (missingColumns.length > 0) {
    throw new Error(
      `Colonnes manquantes dans le CSV: ${missingColumns.join(", ")}\n` +
      `Colonnes trouvées: ${existingColumns.join(", ")}\n` +
      `Colonnes requises: ${requiredColumns.join(", ")}`
    );
  }

  // Créer la colonne group-Id si elle n'existe pas
  if (!existingColumns.includes("group-id")) {
    console.log("⚠️  Colonne 'group-id' manquante, création avec la valeur '1' pour tous les commentaires");
    for (const row of csvRows) {
      row["group-id"] = "1";
    }
  }

  console.log("✅ Toutes les colonnes requises sont présentes dans le CSV");
}

function renameColumns(csvRows: CommentCsvRow[]): void {
  if (csvRows.length === 0) return;

  const columnMappings = {
    "Proposition": "comment_text",
    "Id": "comment-id",
    "% pour": "agree_rate",
    "% contre": "disagree_rate",
    "% neutral": "pass_rate",
    "Nb de votes": "votes"
  };

  const firstRow = csvRows[0];
  const existingColumns = Object.keys(firstRow);

  for (const row of csvRows) {
    for (const [frenchName, englishName] of Object.entries(columnMappings)) {
      if (existingColumns.includes(frenchName) && !existingColumns.includes(englishName)) {
        // Renommer la colonne
        (row as any)[englishName] = (row as any)[frenchName];
        delete (row as any)[frenchName];
        console.log(`🔄 Colonne renommée: "${frenchName}" → "${englishName}"`);
      }
    }
  }
}


main();
