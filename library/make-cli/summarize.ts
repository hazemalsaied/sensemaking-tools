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
import { writeFileSync, readFileSync, createReadStream } from "fs";
import { parse } from "csv-parse";
import * as path from "path";

import {
  getCommentsFromCsv,
  getSummary
} from "./summarization_utils";

import {
  persistJsonToDatabase
} from "./export_utils";

import {
  extractTopicsFromComments,
  generateTopicStatistics,
  extractOverviewFromSummary,
  generateTopicAnalysis,
  generateIdeasStructure,
  ExtendedCsvRow
} from "./json_utils";

import { Sensemaker } from "../src/sensemaker";
import { VertexModel } from "../src/models/vertex_model";
import { generateAllIdeaSummaries, IdeasData } from "../src/tasks/idea_summaries";

import * as config from "../configs.json";

// Fonction pour vérifier si la colonne topic_scores existe dans le CSV
function hasTopicScoresColumn(inputFilePath: string): boolean {
  const header = readFileSync(inputFilePath, { encoding: "utf-8" }).split("\n")[0];
  const columns = header.split(",").map(col => col.trim());
  return columns.includes("topic_scores");
}

/**
 * Lit le CSV et extrait les données nécessaires pour calculer les statistiques des idées
 * @param inputFilePath Chemin vers le fichier CSV
 * @returns Promise résolue avec un tableau de ExtendedCsvRow
 */
async function readCsvForStats(inputFilePath: string): Promise<ExtendedCsvRow[]> {
  const filePath = path.resolve(inputFilePath);
  const fileContent = readFileSync(filePath, { encoding: "utf-8" });

  const parser = parse(fileContent, {
    delimiter: ",",
    columns: true,
  });

  return new Promise((resolve, reject) => {
    const data: ExtendedCsvRow[] = [];
    createReadStream(filePath)
      .pipe(parser)
      .on("error", reject)
      .on("data", (row: any) => {
        // Extraire uniquement les champs nécessaires
        const extendedRow: ExtendedCsvRow = {
          "comment-id": row["comment-id"]?.toString() || "",
          zone_name: row.zone_name,
          score_v2_agree: row.score_v2_agree,
          score_v2_disagree: row.score_v2_disagree,
          score_v2_agree_like: row.score_v2_agree_like,
          score_v2_agree_doable: row.score_v2_agree_doable,
          score_v2_top: row.score_v2_top,
          score_v2_controversy: row.score_v2_controversy
        };
        data.push(extendedRow);
      })
      .on("end", () => resolve(data));
  });
}

async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option("-i, --inputFile <file>", "The input file name.")
    .option("-t, --tag <tag>", "Tag to associate with the analysis.")
    .option("-s, --slug <slug>", "slug for the analysis.")
    .option("-d, --database <database>", "Persister le json dans PostgreSQL.", false);
  program.parse(process.argv);
  const options = program.opts();
  let timestamp = new Date().toISOString().slice(0, 10);

  if (!options.slug) {
    console.log("Aucun slug spécifié. Sortie du programme.");
    process.exit();
  }
  console.log("Slug: ", options.slug);

  let outputBasename = options.inputFile.replace(".csv", "_");
  console.log(outputBasename);
  const comments = await getCommentsFromCsv(options.inputFile);

  const summary = await getSummary(
    config.gcloud.project_id,
    comments,
    undefined,
    ""
  );

  // Vérifier si la colonne topic_scores existe dans le CSV
  // const hasTopicScores = hasTopicScoresColumn(options.inputFile);
  let commentsWithScores = comments;

  // Lire les données CSV pour calculer les statistiques des idées
  let csvDataForStats: ExtendedCsvRow[] = [];
  try {
    csvDataForStats = await readCsvForStats(options.inputFile);
    console.log(`📊 ${csvDataForStats.length} lignes CSV chargées pour les statistiques des idées`);
  } catch (error) {
    console.warn(`⚠️ Impossible de charger les données CSV pour les statistiques: ${error}`);
    console.warn(`Les statistiques des idées seront définies à 0`);
  }

  const statsByCommentId = new Map<string, ExtendedCsvRow>();
  for (const row of csvDataForStats) {
    if (row["comment-id"]) {
      statsByCommentId.set(row["comment-id"], row);
    }
  }

  // Créer le JSON selon le schéma défini
  const reportData: IdeasData = {
    generated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    topics: extractTopicsFromComments(commentsWithScores),
    categorized_comments: commentsWithScores.map(comment => {
      const stats = statsByCommentId.get(comment.id);
      return {
        id: comment.id,
        text: comment.text,
        zone_name: stats?.zone_name || null,
        score_v2_agree: stats?.score_v2_agree ?? null,
        score_v2_disagree: stats?.score_v2_disagree ?? null,
        score_v2_agree_like: stats?.score_v2_agree_like ?? null,
        score_v2_agree_doable: stats?.score_v2_agree_doable ?? null,
        topics: comment.topics ? comment.topics.map(topic => ({
          name: topic.name,
          relevanceScore: (topic as any).relevanceScore || 0.5,
          subtopics: ('subtopics' in topic && topic.subtopics) ? topic.subtopics.map(subtopic => ({
            name: subtopic.name,
            relevanceScore: (subtopic as any).relevanceScore || 0.5,
          })) : []
        })) : []
      };
    }),
    summary: {
      overview: extractOverviewFromSummary(summary),
      topic_analysis: generateTopicAnalysis(summary, commentsWithScores)
    },
    ideas: generateIdeasStructure(commentsWithScores, csvDataForStats)
  };

  // Générer les résumés pour toutes les idées
  console.log("✨ Génération des résumés pour toutes les idées...");
  const model = new VertexModel(
    config.gcloud.project_id,
    "us-central1",
    config.gcloud.summarization_model
  );
  const reportDataWithSummaries = await generateAllIdeaSummaries(
    reportData,
    model,
    config.default_language
  );
  console.log("✓ Résumés générés pour toutes les idées");

  const jsonContent = JSON.stringify(reportDataWithSummaries, null, 2);
  const json_filename = outputBasename + "analysis_" + timestamp + ".json";
  writeFileSync(json_filename, jsonContent);
  console.log("json filename: " + json_filename);

  // Persister le contenu JSON dans la base de données
  if (options.database) {
    console.log('Persistance du contenu JSON dans la base de données PostgreSQL...');
    await persistJsonToDatabase(jsonContent, options.slug, options.tag);
    console.log('Persistance JSON terminée avec succès');
  } else {
    console.log('Persistance JSON désactivée');
  }

}

main();
