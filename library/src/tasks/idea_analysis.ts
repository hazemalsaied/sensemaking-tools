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

import { Comment } from "../types";
import { Sensemaker } from "../sensemaker";
import { TSchema, Type } from "@sinclair/typebox";
import { getPrompt } from "../sensemaker_utils";
import { loadIdeaGenerationPrompt, loadCommentCategorizationPrompt } from "./utils/template_loader";

// Schéma pour la réponse de génération d'idées (Phase 1)
const IdeaResponseSchema = Type.Object({
    ideas: Type.Array(Type.String(), {
        description: "Liste des idées abstraites générées à partir des commentaires"
    })
});

type IdeaResponse = {
    ideas: string[];
};

// Schéma pour la catégorisation des commentaires (Phase 2)
const CommentCategorizationSchema = Type.Object({
    commentCategorizations: Type.Array(Type.Object({
        commentId: Type.String(),
        ideas: Type.Array(Type.String())
    }), {
        description: "Catégorisation des commentaires selon les idées identifiées"
    })
});

type CommentCategorizationResponse = {
    commentCategorizations: {
        commentId: string;
        ideas: string[];
    }[];
};

/**
 * Phase 1: Génère des idées abstraites pour un thème donné à partir de ses commentaires.
 * 
 * @param comments Les commentaires du thème
 * @param topicName Le nom du thème
 * @param sensemaker L'instance Sensemaker pour la génération
 * @param maxIdeas Le nombre maximum d'idées à générer
 * @returns Une liste d'idées abstraites générées
 */
export async function generateIdeasForTopic(
    comments: Comment[],
    topicName: string,
    sensemaker: Sensemaker,
    maxIdeas: number = 5
): Promise<string[]> {
    if (comments.length === 0) {
        return [];
    }

    // Préparer les commentaires pour l'analyse
    const commentTexts = comments.map(comment => comment.text);
    const aggregatedText = commentTexts.join('\n\n');

    // Charger le prompt pour la génération d'idées (phase 1)
    const prompt = loadIdeaGenerationPrompt(topicName, aggregatedText, maxIdeas);

    try {
        // Générer les idées avec le modèle
        const model = sensemaker.getModel('defaultModel');
        const response = await model.generateData(
            prompt,
            IdeaResponseSchema as TSchema
        ) as IdeaResponse;

        return response.ideas || [];
    } catch (error) {
        console.error(`Erreur lors de la génération d'idées pour ${topicName}:`, error);
        return [];
    }
}

/**
 * Phase 2: Catégorise les commentaires par lots selon les idées générées.
 * 
 * @param comments Les commentaires à catégoriser
 * @param ideas Les idées abstraites générées en phase 1
 * @param topicName Le nom du thème
 * @param sensemaker L'instance Sensemaker pour la génération
 * @returns Un objet mappant chaque commentaire à ses idées associées
 */
export async function categorizeCommentsByIdeas(
    comments: Comment[],
    ideas: string[],
    topicName: string,
    sensemaker: Sensemaker
): Promise<{ [commentId: string]: string[] }> {
    if (comments.length === 0 || ideas.length === 0) {
        return {};
    }

    // Traiter les commentaires par lots
    const model = sensemaker.getModel('defaultModel');
    const batchSize = model.categorizationBatchSize;
    const commentCategorizations: { [commentId: string]: string[] } = {};

    for (let i = 0; i < comments.length; i += batchSize) {
        const batch = comments.slice(i, i + batchSize);
        console.log(`📝 Catégorisation du lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(comments.length / batchSize)} (${batch.length} commentaires)`);

        // Préparer les commentaires du lot pour l'analyse
        const batchComments = batch.map(comment => ({
            id: comment.id,
            text: comment.text
        }));

        // Charger le prompt pour la catégorisation des commentaires de ce lot
        const prompt = loadCommentCategorizationPrompt(topicName, ideas, batchComments);

        try {
            const response = await model.generateData(
                prompt,
                CommentCategorizationSchema as TSchema
            ) as CommentCategorizationResponse;

            // Traiter les catégorisations du lot
            for (const categorization of response.commentCategorizations || []) {
                commentCategorizations[categorization.commentId] = categorization.ideas;
            }
        } catch (error) {
            console.error(`Erreur lors de la catégorisation du lot pour ${topicName}:`, error);
        }
    }

    return commentCategorizations;
}


