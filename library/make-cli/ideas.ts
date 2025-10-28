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

// Génère des idées abstraites pour chaque thème à partir de commentaires catégorisés.
//
// Le fichier CSV d'entrée doit contenir les champs "comment_text", "comment-id" et "topics".
// Le fichier CSV de sortie contiendra tous les champs d'entrée plus un nouveau champ "ideas" 
// qui contient les idées associées à chaque commentaire.
//
// Le processus se déroule en 3 phases:
// 1. Génération d'idées abstraites à partir des commentaires du thème
// 2. Catégorisation des commentaires par lots selon les idées générées
// 3. Filtrage des idées peu représentatives (moins de X propositions)
//
// Exemple d'utilisation:
// npx ts-node make-cli/ideas.ts \
//    --inputFile ~/input.csv \
//    --minComments 10 \
//    --minProposals 3

import { VertexModel } from "../src/models/vertex_model";
import { OpenAIModel } from "../src/models/openai_model";
import { Sensemaker } from "../src/sensemaker";
import { Comment, Topic } from "../src/types";
import { Command } from "commander";
import { parse } from "csv-parse";
import { createObjectCsvWriter } from "csv-writer";
import * as fs from "fs";
import * as path from "path";
import { generateIdeasForTopic, categorizeCommentsByIdeas } from "../src/tasks/idea_analysis";
import * as config from "../configs.json";
import { CommentCsvRow } from "./analyzation_utils";

interface IdeaCsvRow extends CommentCsvRow {
    ideas?: string;
}

interface TopicWithComments {
    topicName: string;
    comments: Comment[];
}

async function main(): Promise<void> {
    // Parse command line arguments.
    const program = new Command();
    program
        .option("-i, --inputFile <file>", "Le fichier CSV d'entrée contenant les commentaires catégorisés.")
        .option("--minComments <number>", "Nombre minimum de commentaires par thème pour générer des idées", "10")
        .option("--maxIdeas <number>", "Nombre maximum d'idées à générer par thème", "5")
        .option("--minProposals <number>", "Nombre minimum de propositions par idée pour la conserver", "7");
    program.parse(process.argv);
    const options = program.opts();

    if (!options.inputFile) {
        throw new Error("Le fichier d'entrée est requis (--inputFile)");
    }

  
    console.log(`📄 Lecture du fichier CSV: ${options.inputFile}`);
    const csvRows = await readCsv(options.inputFile);
    console.log(`✅ ${csvRows.length} commentaires chargés`);

    // Convertir les lignes CSV en commentaires
    const comments = convertCsvRowsToComments(csvRows);
    console.log(`📊 ${comments.length} commentaires convertis`);

    // Grouper les commentaires par thème
    const topicsWithComments = groupCommentsByTopic(comments);
    console.log(`🔍 ${topicsWithComments.length} thèmes trouvés`);

    // Filtrer les thèmes avec suffisamment de commentaires
    const minComments = parseInt(options.minComments);
    const validTopics = topicsWithComments.filter(
        topic => topic.comments.length >= minComments
    );
    console.log(`✅ ${validTopics.length} thèmes avec au moins ${minComments} commentaires`);

    if (validTopics.length === 0) {
        console.log("⚠️ Aucun thème ne contient suffisamment de commentaires pour générer des idées");
        return;
    }

    // Initialiser le modèle
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
    console.log(`🤖 Provider de génération: ${generationProvider}`);

    // Générer les idées pour chaque thème (Phase 1 + Phase 2)
    const maxIdeas = parseInt(options.maxIdeas);
    const minProposals = parseInt(options.minProposals);
    const commentsWithIdeas = new Map<string, string[]>();

    for (let i = 0; i < validTopics.length; i++) {
        const topic = validTopics[i];
        console.log(`\n💡 Phase 1: Génération d'idées pour le thème ${i + 1}/${validTopics.length}: ${topic.topicName}`);
        console.log(`📝 ${topic.comments.length} commentaires à analyser`);

        try {
            // Phase 1: Générer les idées abstraites
            const ideas = await generateIdeasForTopic(
                topic.comments,
                topic.topicName,
                sensemaker,
                maxIdeas
            );

            console.log(`✅ ${ideas.length} idées générées: ${ideas.join(', ')}`);

            if (ideas.length > 0) {
                // Phase 2: Catégoriser les commentaires par lots selon les idées
                console.log(`\n🔄 Phase 2: Catégorisation des commentaires selon les idées...`);
                const commentCategorizations = await categorizeCommentsByIdeas(
                    topic.comments,
                    ideas,
                    topic.topicName,
                    sensemaker
                );

                // Phase 3: Filtrer les idées peu représentatives
                console.log(`\n🔍 Phase 3: Filtrage des idées avec moins de ${minProposals} propositions...`);
                const filteredIdeas = filterIdeasByProposalCount(commentCategorizations, ideas, minProposals);

                if (filteredIdeas.length < ideas.length) {
                    console.log(`🗑️ ${ideas.length - filteredIdeas.length} idées supprimées (trop peu de propositions)`);
                    console.log(`✅ ${filteredIdeas.length} idées conservées: ${filteredIdeas.join(', ')}`);
                }

                // Associer les idées filtrées aux commentaires
                for (const comment of topic.comments) {
                    const commentIdeas = commentCategorizations[comment.id] || [];
                    const filteredCommentIdeas = commentIdeas.filter(idea => filteredIdeas.includes(idea));

                    if (filteredCommentIdeas.length > 0) {
                        if (!commentsWithIdeas.has(comment.id)) {
                            commentsWithIdeas.set(comment.id, []);
                        }
                        commentsWithIdeas.get(comment.id)!.push(...filteredCommentIdeas);
                    }
                }

                console.log(`✅ Traitement terminé pour ${topic.topicName}`);
            }
        } catch (error) {
            console.error(`❌ Erreur lors de la génération d'idées pour ${topic.topicName}:`, error);
        }
    }

    // Créer les lignes CSV avec les idées
    const csvRowsWithIdeas = addIdeasToCsvRows(csvRows, commentsWithIdeas);

    // Écrire le fichier de sortie
    let outputFile = options.inputFile.replace(".csv", "_with_ideas.csv");
    await writeCsv(csvRowsWithIdeas, outputFile);
    console.log(`\n🎉 Fichier CSV généré avec succès: ${outputFile}`);
}

async function readCsv(inputFilePath: string): Promise<CommentCsvRow[]> {
    if (!inputFilePath) {
        throw new Error("Le chemin du fichier d'entrée est manquant!");
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

        // Parser les topics si présents
        if (row.topics && row.topics.trim()) {
            try {
                comment.topics = parseTopicsString(row.topics);
            } catch (error) {
                console.warn(`Échec du parsing des topics pour le commentaire ${row["comment-id"]}: ${error}`);
            }
        }

        comments.push(comment);
    }
    return comments;
}

function parseTopicsString(topicsString: string): Topic[] {
    // Format attendu: "Transportation:PublicTransit;Transportation:Parking;Technology:Internet"
    const topicPairs = topicsString.split(';');
    const topics: Topic[] = [];

    for (const pair of topicPairs) {
        if (pair.trim()) {
            const [topicName, subtopicName] = pair.split(':');
            if (topicName && subtopicName) {
                // Chercher si le topic existe déjà
                let existingTopic = topics.find(t => t.name === topicName);
                if (!existingTopic) {
                    existingTopic = { name: topicName, subtopics: [] };
                    topics.push(existingTopic);
                }

                // Ajouter le subtopic
                if ("subtopics" in existingTopic) {
                    existingTopic.subtopics.push({ name: subtopicName });
                }
            }
        }
    }

    return topics;
}

function groupCommentsByTopic(comments: Comment[]): TopicWithComments[] {
    const topicMap = new Map<string, TopicWithComments>();

    for (const comment of comments) {
        if (!comment.topics) continue;

        for (const topic of comment.topics) {
            const key = topic.name;

            if (!topicMap.has(key)) {
                topicMap.set(key, {
                    topicName: topic.name,
                    comments: []
                });
            }

            topicMap.get(key)!.comments.push(comment);
        }
    }

    return Array.from(topicMap.values());
}

/**
 * Filtre les idées qui sont associées à moins de minProposals propositions
 * @param commentCategorizations Les catégorisations des commentaires
 * @param ideas Les idées à filtrer
 * @param minProposals Le nombre minimum de propositions par idée
 * @returns Les idées qui respectent le seuil minimum
 */
function filterIdeasByProposalCount(
    commentCategorizations: { [commentId: string]: string[] },
    ideas: string[],
    minProposals: number
): string[] {
    // Compter le nombre de propositions par idée
    const ideaCounts: { [idea: string]: number } = {};

    for (const idea of ideas) {
        ideaCounts[idea] = 0;
    }

    for (const commentId in commentCategorizations) {
        const commentIdeas = commentCategorizations[commentId];
        for (const idea of commentIdeas) {
            if (ideaCounts.hasOwnProperty(idea)) {
                ideaCounts[idea]++;
            }
        }
    }

    // Filtrer les idées qui respectent le seuil minimum
    const filteredIdeas = ideas.filter(idea => ideaCounts[idea] >= minProposals);

    // Afficher les statistiques de filtrage
    console.log(`📊 Statistiques de filtrage:`);
    for (const idea of ideas) {
        const count = ideaCounts[idea];
        const status = count >= minProposals ? '✅' : '❌';
        console.log(`  ${status} "${idea}": ${count} propositions`);
    }

    return filteredIdeas;
}

function addIdeasToCsvRows(csvRows: CommentCsvRow[], commentsWithIdeas: Map<string, string[]>): IdeaCsvRow[] {
    return csvRows.map(row => {
        const ideas = commentsWithIdeas.get(row["comment-id"]) || [];
        return {
            ...row,
            ideas: ideas.join('; ')
        };
    });
}

async function writeCsv(csvRows: IdeaCsvRow[], outputFile: string) {
    // Créer les en-têtes
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
        .then(() => console.log(`Fichier CSV écrit avec succès: ${outputFile}`));
}

main().catch(console.error);
