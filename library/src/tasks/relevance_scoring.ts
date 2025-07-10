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

import { Comment, Topic, CommentRecordWithScores, TopicWithRelevance } from "../types";
import { Model } from "../models/model";
import { TSchema, Type } from "@sinclair/typebox";
import { getPrompt, executeConcurrently } from "../sensemaker_utils";
import { MAX_RETRIES, RETRY_DELAY_MS } from "../models/model_util";
import { loadRelevanceScoringPrompt } from "./utils/template_loader";

/**
 * Calcule les scores de pertinence pour les topics et subtopics d'un ensemble de commentaires.
 * @param comments Les commentaires déjà catégorisés avec leurs topics
 * @param model Le modèle LLM à utiliser pour le scoring
 * @param additionalContext Contexte additionnel pour le modèle
 * @returns Les commentaires avec leurs scores de pertinence ajoutés
 */
export async function calculateRelevanceScores(
    comments: Comment[],
    model: Model,
    additionalContext?: string
): Promise<Comment[]> {
    console.log("Calcul des scores de pertinence pour", comments.length, "commentaires...");

    // Filtrer les commentaires qui ont des topics
    const categorizedComments = comments.filter(comment => comment.topics && comment.topics.length > 0);

    if (categorizedComments.length === 0) {
        console.log("Aucun commentaire catégorisé trouvé pour le calcul des scores de pertinence");
        return comments;
    }

    // Créer des lots de commentaires pour le traitement parallèle
    const batchesToScore: (() => Promise<CommentRecordWithScores[]>)[] = [];
    for (let i = 0; i < categorizedComments.length; i += model.categorizationBatchSize) {
        const batch = categorizedComments.slice(i, i + model.categorizationBatchSize);
        batchesToScore.push(() =>
            scoreRelevanceWithRetry(model, batch, additionalContext)
        );
    }

    // Traiter les lots en parallèle
    const totalBatches = Math.ceil(categorizedComments.length / model.categorizationBatchSize);
    console.log(
        `Calcul des scores de pertinence pour ${categorizedComments.length} commentaires en lots (${totalBatches} lots de ${model.categorizationBatchSize} commentaires)`
    );

    const scoredBatches: CommentRecordWithScores[][] = await executeConcurrently(batchesToScore);

    // Aplatir les résultats
    const scoredComments: CommentRecordWithScores[] = [];
    scoredBatches.forEach((batch) => scoredComments.push(...batch));

    // Fusionner les scores avec les commentaires originaux
    return mergeRelevanceScores(comments, scoredComments);
}

/**
 * Calcule les scores de pertinence avec retry en cas d'échec.
 * @param model Le modèle LLM à utiliser
 * @param inputComments Les commentaires à scorer
 * @param additionalContext Contexte additionnel
 * @returns Les commentaires avec leurs scores de pertinence
 */
export async function scoreRelevanceWithRetry(
    model: Model,
    inputComments: Comment[],
    additionalContext?: string
): Promise<CommentRecordWithScores[]> {
    let uncategorized: Comment[] = [...inputComments];
    let scored: CommentRecordWithScores[] = [];

    for (let attempts = 1; attempts <= MAX_RETRIES; attempts++) {
        // Préparer les commentaires pour le modèle
        const commentsForModel: string[] = uncategorized.map((comment) =>
            JSON.stringify({
                id: comment.id,
                text: comment.text,
                topics: comment.topics
            })
        );

        const outputSchema: TSchema = Type.Array(Type.Union([
            Type.Object({
                id: Type.String(),
                topics: Type.Array(Type.Union([
                    Type.Object({
                        name: Type.String(),
                        relevanceScore: Type.Number({ minimum: 0, maximum: 100 })
                    }),
                    Type.Object({
                        name: Type.String(),
                        relevanceScore: Type.Number({ minimum: 0, maximum: 100 }),
                        subtopics: Type.Array(Type.Object({
                            name: Type.String(),
                            relevanceScore: Type.Number({ minimum: 0, maximum: 100 })
                        }))
                    })
                ]))
            })
        ]));

        const instructions = relevanceScoringPrompt();
        let prompt = getPrompt(instructions, commentsForModel, additionalContext);

        const newScored: CommentRecordWithScores[] = (await model.generateData(
            prompt,
            outputSchema
        )) as CommentRecordWithScores[];

        const processedComments = processScoredComments(
            newScored,
            inputComments,
            uncategorized
        );
        scored = scored.concat(processedComments.scoredComments);
        uncategorized = processedComments.uncategorizedComments;

        if (uncategorized.length === 0) {
            break; // Tous les commentaires ont été traités avec succès
        }

        if (attempts < MAX_RETRIES) {
            console.warn(
                `Attendu que tous les ${commentsForModel.length} commentaires soient scorés, mais ${uncategorized.length} ne sont pas correctement traités. Nouvelle tentative dans ${RETRY_DELAY_MS / 1000} secondes...`
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
            // Assigner des scores par défaut aux commentaires non traités
            scored = scored.concat(assignDefaultScores(uncategorized));
        }
    }

    return scored;
}

/**
 * Traite les commentaires scorés, valide les résultats et met à jour les tableaux.
 * @param scoredComments Les commentaires nouvellement scorés
 * @param inputComments Les commentaires d'entrée originaux
 * @param uncategorized Les commentaires non traités
 * @returns Les commentaires scorés avec succès et les commentaires non traités
 */
function processScoredComments(
    scoredComments: CommentRecordWithScores[],
    inputComments: Comment[],
    uncategorized: Comment[]
): {
    scoredComments: CommentRecordWithScores[];
    uncategorizedComments: Comment[];
} {
    // Valider les commentaires scorés
    const { validScoredComments, invalidScoredComments } = validateScoredComments(
        scoredComments,
        inputComments
    );

    // Trouver les commentaires manquants dans la réponse du modèle
    const missingComments: Comment[] = findMissingScoredComments(scoredComments, uncategorized);

    // Combiner tous les commentaires invalides pour retry
    return {
        scoredComments: validScoredComments,
        uncategorizedComments: [...missingComments, ...invalidScoredComments],
    };
}

/**
 * Valide les commentaires scorés.
 * @param scoredComments Les commentaires scorés à valider
 * @param inputComments Les commentaires d'entrée originaux
 * @returns Les commentaires valides et invalides
 */
function validateScoredComments(
    scoredComments: CommentRecordWithScores[],
    inputComments: Comment[]
): {
    validScoredComments: CommentRecordWithScores[];
    invalidScoredComments: Comment[];
} {
    const validScoredComments: CommentRecordWithScores[] = [];
    const invalidScoredComments: Comment[] = [];
    const inputCommentIds = new Set<string>(inputComments.map((comment) => comment.id));

    scoredComments.forEach((scoredComment) => {
        if (!inputCommentIds.has(scoredComment.id)) {
            console.warn(`Commentaire extra dans la réponse du modèle: ${JSON.stringify(scoredComment)}`);
            return;
        }

        if (!isValidScoredComment(scoredComment)) {
            console.warn(`Commentaire avec scores invalides: ${JSON.stringify(scoredComment)}`);
            const originalComment = inputComments.find(c => c.id === scoredComment.id);
            if (originalComment) {
                invalidScoredComments.push(originalComment);
            }
            return;
        }

        validScoredComments.push(scoredComment);
    });

    return { validScoredComments, invalidScoredComments };
}

/**
 * Vérifie si un commentaire scoré est valide.
 * @param scoredComment Le commentaire scoré à vérifier
 * @returns True si le commentaire est valide, false sinon
 */
function isValidScoredComment(scoredComment: CommentRecordWithScores): boolean {
    if (!scoredComment.topics || scoredComment.topics.length === 0) {
        return false;
    }

    return scoredComment.topics.every((topic) => {
        if (typeof topic.relevanceScore !== 'number' ||
            topic.relevanceScore < 0 ||
            topic.relevanceScore > 100) {
            return false;
        }

        if ('subtopics' in topic && topic.subtopics && Array.isArray(topic.subtopics)) {
            return topic.subtopics.every((subtopic: any) =>
                typeof subtopic.relevanceScore === 'number' &&
                subtopic.relevanceScore >= 0 &&
                subtopic.relevanceScore <= 100
            );
        }

        return true;
    });
}

/**
 * Trouve les commentaires manquants dans la réponse du modèle.
 * @param scoredComments Les commentaires scorés reçus du modèle
 * @param uncategorized Les commentaires non traités
 * @returns Les commentaires manquants
 */
function findMissingScoredComments(
    scoredComments: CommentRecordWithScores[],
    uncategorized: Comment[]
): Comment[] {
    const scoredCommentIds: string[] = scoredComments.map((comment) => comment.id);
    const missingComments = uncategorized.filter(
        (comment) => !scoredCommentIds.includes(comment.id)
    );

    if (missingComments.length > 0) {
        console.warn(`Commentaires manquants dans la réponse du modèle: ${JSON.stringify(missingComments)}`);
    }
    return missingComments;
}

/**
 * Assigne des scores par défaut aux commentaires qui ont échoué.
 * @param uncategorized Les commentaires non traités
 * @returns Les commentaires avec des scores par défaut
 */
function assignDefaultScores(uncategorized: Comment[]): CommentRecordWithScores[] {
    console.warn(
        `Échec du scoring de ${uncategorized.length} commentaires après le nombre maximum de tentatives. Attribution de scores par défaut.`
    );

    return uncategorized.map((comment): CommentRecordWithScores => {
        const topicsWithScores = comment.topics?.map(topic => {
            if ('subtopics' in topic && topic.subtopics) {
                return {
                    name: topic.name,
                    relevanceScore: 50, // Score par défaut
                    subtopics: topic.subtopics.map(subtopic => ({
                        name: subtopic.name,
                        relevanceScore: 50 // Score par défaut 
                    }))
                };
            } else {
                return {
                    name: topic.name,
                    relevanceScore: 50 // Score par défaut
                };
            }
        }) || [];

        return {
            id: comment.id,
            topics: topicsWithScores
        };
    });
}

/**
 * Fusionne les scores de pertinence avec les commentaires originaux.
 * @param originalComments Les commentaires originaux
 * @param scoredComments Les commentaires avec scores
 * @returns Les commentaires originaux avec les scores ajoutés
 */
function mergeRelevanceScores(
    originalComments: Comment[],
    scoredComments: CommentRecordWithScores[]
): Comment[] {
    const scoredMap = new Map(scoredComments.map(comment => [comment.id, comment]));

    return originalComments.map(comment => {
        const scored = scoredMap.get(comment.id);
        if (scored && comment.topics) {
            // Fusionner les scores avec les topics existants
            const topicsWithScores = comment.topics.map(topic => {
                const scoredTopic = scored.topics.find(st => st.name === topic.name);
                if (scoredTopic) {
                    if ('subtopics' in topic && topic.subtopics && 'subtopics' in scoredTopic) {
                        return {
                            name: topic.name,
                            relevanceScore: scoredTopic.relevanceScore,
                            subtopics: topic.subtopics.map(subtopic => {
                                const scoredSubtopic = Array.isArray(scoredTopic.subtopics) ?
                                    scoredTopic.subtopics.find((sst: any) => sst.name === subtopic.name) : undefined;
                                return {
                                    name: subtopic.name,
                                    relevanceScore: scoredSubtopic?.relevanceScore || 50
                                };
                            })
                        };
                    } else {
                        return {
                            name: topic.name,
                            relevanceScore: scoredTopic.relevanceScore
                        };
                    }
                }
                return topic; // Garder le topic original si pas de score trouvé
            });

            return {
                ...comment,
                topics: topicsWithScores
            };
        }
        return comment;
    });
}

/**
 * Génère le prompt pour le scoring de pertinence.
 * @returns Le prompt pour le modèle LLM
 */
export function relevanceScoringPrompt(): string {
    return loadRelevanceScoringPrompt();
} 