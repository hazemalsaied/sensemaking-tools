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
import { OpenAIModel } from "../src/models/openai_model";
import { Sensemaker } from "../src/sensemaker";
import { Comment, Topic } from "../src/types";
import { Command } from "commander";
import { parse } from "csv-parse";
import { createObjectCsvWriter } from "csv-writer";
import * as fs from "fs";
import * as path from "path";
import { concatTopics, parseTopicsString, concatTopicScores } from "./summarization_utils";
import * as config from "../configs.json";
import { displayTopicHierarchy, extractExistingTopicsFromCsv, CommentCsvRow } from "./analyzation_utils";
import { getProposalsForJigsaw, JigsawRow, fetchPreviousAnalysis, extractTopicsFromPreviousAnalysis, extractCategorizedCommentsFromPreviousAnalysis, createDatabaseConnection } from "./import_utils";
 


async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option("-i, --inputFile <file>", "The input file name.")
    .option("-s, --slug <slug>", "The slug for database reading.")
    .option("-l, --level <number>", "The categorization level (depth of topics/subtopics)", "2")
    .option("--scores", "Calculate relevance scores for topics and subtopics", false)
    .option("--minTopics <number>", "Minimum number of topics to generate", "10")
    .option("--maxTopics <number>", "Maximum number of topics to generate", "17");
  program.parse(process.argv);
  const options = program.opts();

  let csvRows: CommentCsvRow[];

  // Choisir la source de données : CSV ou base de données
  let topics: Topic[] | undefined;
  let previousCategorizedComments: { [commentId: string]: Topic[] } = {};
  if (options.inputFile) {
    console.log(`📄 Lecture depuis le fichier CSV: ${options.inputFile}`);
    csvRows = await readCsv(options.inputFile);
    topics = extractExistingTopicsFromCsv(csvRows);
  } else if (options.slug) {
    console.log(`📊 Lecture depuis la base de données pour le slug: ${options.slug}`);
    const jigsawData = await getProposalsForJigsaw(options.slug);
    csvRows = convertJigsawToCsvRows(jigsawData.data);
    console.log(`✅ ${csvRows.length} propositions récupérées depuis la base de données`);
    // Vérifier s'il y a une analyse précédente dans la base de données d'export
    console.log(`🔍 Vérification des analyses précédentes pour le slug: ${options.slug}`);
    const exportClient = createDatabaseConnection(config.export_db);

    try {
      await exportClient.connect();
      const previousAnalysis = await fetchPreviousAnalysis(exportClient, options.slug);

      if (previousAnalysis) {
        // Extraire les topics de l'analyse précédente
        const previousTopics = extractTopicsFromPreviousAnalysis(previousAnalysis);
        if (previousTopics.length > 0) {
          topics = previousTopics;
          console.log(`📊 ${topics.length} topics récupérés de l'analyse précédente`);
        }

        // Extraire les commentaires déjà catégorisés
        previousCategorizedComments = extractCategorizedCommentsFromPreviousAnalysis(previousAnalysis);
        console.log(`📊 ${Object.keys(previousCategorizedComments).length} commentaires déjà catégorisés trouvés`);
      }
    } catch (error) {
      console.warn(`⚠️ Erreur lors de la récupération de l'analyse précédente: ${error}`);
    } finally {
      await exportClient.end();
    }
  } else {
    throw new Error("Où sont les données ?");
  }




  // Si pas d'analyse précédente, essayer d'extraire depuis le CSV
  if (!topics) {
    topics = extractExistingTopicsFromCsv(csvRows);
  }

  let comments = convertCsvRowsToComments(csvRows, previousCategorizedComments);

  // Afficher la hiérarchie des thèmes de manière élégante
  displayTopicHierarchy(topics || []);


  // Learn topics and categorize comments.
  let defaultModel;
  let generationProvider;

  if (config.provider === "openai") {
    defaultModel = new OpenAIModel(
      config.openai.api_key,
      config.openai.model,
      config.openai.max_tokens,
      config.openai.temperature,
      config.openai.parallelism
    );
    generationProvider = "OpenAI";
  } else if (config.provider === "vertex") {
    defaultModel = new VertexModel(
      config.gcloud.project_id,
      config.gcloud.location,
      config.gcloud.categorization_model
    );
    generationProvider = "VertexAI";
  } else {
    throw new Error(`Provider non supporté: ${config.provider}. Valeurs supportées: 'openai', 'vertex'`);
  }

  const sensemaker = new Sensemaker({
    defaultModel: defaultModel,
  });
  console.log("Generation provider: ", generationProvider);
  // Valider et convertir le niveau de catégorisation
  const categorizationLevel = parseInt(options.level);
  if (categorizationLevel < 1 || categorizationLevel > 3) {
    throw new Error("Le niveau de catégorisation doit être entre 1 et 3");
  }
  console.log(`Niveau de catégorisation: ${categorizationLevel}`);

  const minTopics = parseInt(options.minTopics || "10");
  const maxTopics = parseInt(options.maxTopics || "17");
  const categorizedComments = await sensemaker.categorizeComments(
    comments,
    true,
    topics,
    categorizationLevel as 1 | 2 | 3,
    minTopics,
    maxTopics
  );

  // Calculer les scores de pertinence pour les topics et subtopics (optionnel)
  let finalComments = categorizedComments;
  if (options.scores) {
    console.log("Calcul des scores de pertinence...");
    finalComments = await sensemaker.calculateRelevanceScores(
      categorizedComments
    );
  } else {
    console.log("Skipping relevance scores calculation (use --scores to enable)");
  }

  const csvRowsWithTopics = setTopics(csvRows, finalComments);
  let timestamp = new Date().toISOString().slice(0, 10);

  let outputBasename: string;
  const outputDir = `data/${options.slug}`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!options.inputFile) {
    outputBasename = `data/${options.slug}/${options.slug}_categorized_${timestamp}.csv`;
  }
  else {
    outputBasename = options.inputFile.replace(".csv", "_categorized_" + timestamp + ".csv");
  }

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

function convertJigsawToCsvRows(jigsawData: JigsawRow[]): CommentCsvRow[] {
  return jigsawData.map(jigsawRow => ({
    "comment_text": jigsawRow.comment_text,
    "comment-id": jigsawRow["comment-id"].toString(),
    "votes": jigsawRow.votes.toString(),
    "agree_rate": jigsawRow.agree_rate.toString(),
    "disagree_rate": jigsawRow.disagree_rate.toString(),
    "pass_rate": jigsawRow.pass_rate.toString(),
    "group-id": jigsawRow["group-id"].toString(),
    "author-id": jigsawRow["author-id"].toString(),
    "1-agree-count": jigsawRow["1-agree-count"].toString(),
    "1-disagree-count": jigsawRow["1-disagree-count"].toString(),
    "1-pass-count": jigsawRow["1-pass-count"].toString()
  }));
}

function convertCsvRowsToComments(csvRows: CommentCsvRow[], previousCategorizedComments?: { [commentId: string]: Topic[] }): Comment[] {
  const comments: Comment[] = [];
  for (const row of csvRows) {
    const comment: Comment = {
      text: row["comment_text"],
      id: row["comment-id"],
    };

    // Si des topics existent dans l'analyse précédente, les utiliser en priorité
    if (previousCategorizedComments && previousCategorizedComments[row["comment-id"]]) {
      comment.topics = previousCategorizedComments[row["comment-id"]];
      // console.log(`🔄 Topics récupérés de l'analyse précédente pour le commentaire ${row["comment-id"]}`);
    }
    // Sinon, si des topics existent dans le CSV, les parser
    else if (row.topics && row.topics.trim()) {
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
  //   add a "topic_scores" field that contains relevance scores
  const csvRowsWithTopics: CommentCsvRow[] = [];
  for (const comment of categorizedComments) {
    const csvRow = mapIdToCsvRow[comment.id];
    csvRow["topics"] = concatTopics(comment);
    // csvRow["topic_scores"] = concatTopicScores(comment);
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
