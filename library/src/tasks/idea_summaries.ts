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

// Functions for generating summaries for ideas in the JSON structure.

import { Model } from "../models/model";
import {
    loadIdeaConsensusSummaryPrompt,
    loadIdeaControversySummaryPrompt,
} from "./utils/template_loader";

/**
 * Interface pour une proposition (commentaire) associée à une idée
 */
export interface IdeaComment {
    id: string;
    text: string;
}

/**
 * Interface pour les statistiques d'une idée
 */
export interface IdeaStats {
    consensus_proposals: number;
    controversy_proposals: number;
    top_3_mean_agree?: number;
    top_3_mean_disagree?: number;
    mean_agree?: number;
    mean_disagree?: number;
    top_3_mean_agree_like?: number;
    top_3_mean_agree_doable?: number;
    mean_agree_like?: number;
    mean_agree_doable?: number;
}

/**
 * Interface pour une idée dans le JSON
 */
export interface Idea {
    name: string;
    stats: IdeaStats;
    comments: IdeaComment[];
    summary?: string;
}

/**
 * Interface pour un topic avec ses idées
 */
export interface TopicWithIdeas {
    topic: string;
    ideas: Idea[];
}

/**
 * Interface pour la structure complète du JSON
 */
export interface IdeasData {
    generated_at?: string;
    topics?: any[];
    categorized_comments?: any[];
    summary?: any;
    ideas: TopicWithIdeas[];
}

/**
 * Génère un résumé pour une idée en utilisant le modèle LLM approprié
 * @param idea - L'idée pour laquelle générer le résumé
 * @param topicName - Le nom du thème auquel appartient l'idée
 * @param model - Le modèle LLM à utiliser
 * @param language - La langue de génération (par défaut: français)
 * @returns Le résumé généré
 */
export async function generateIdeaSummary(
    idea: Idea,
    topicName: string,
    model: Model,
    language: string = "français"
): Promise<string> {
    const totalProposals = idea.comments.length;
    const consensusProposals = idea.stats.consensus_proposals || 0;
    const controversyProposals = idea.stats.controversy_proposals || 0;

    // Formater les propositions pour le prompt
    const proposalsText = idea.comments
        .map((comment, index) => `${index + 1}. ${comment.text}`)
        .join("\n");

    // Déterminer si l'idée est consensuelle ou controversée
    // Une idée est consensuelle si elle a plus de propositions consensuelles que controversées
    const isConsensus = consensusProposals > controversyProposals;

    let prompt: string;
    if (isConsensus) {
        prompt = loadIdeaConsensusSummaryPrompt(
            topicName,
            idea.name,
            totalProposals,
            consensusProposals,
            controversyProposals,
            proposalsText,
            language
        );
    } else {
        prompt = loadIdeaControversySummaryPrompt(
            topicName,
            idea.name,
            totalProposals,
            consensusProposals,
            controversyProposals,
            proposalsText,
            language
        );
    }

    console.log(
        `Génération du résumé pour l'idée "${idea.name}" (${isConsensus ? "consensuelle" : "controversée"})`
    );

    // Le prompt contient déjà toutes les informations formatées, on peut l'utiliser directement
    const summary = await model.generateText(prompt);
    return summary.trim();
}

/**
 * Génère des résumés pour toutes les idées dans la structure JSON
 * @param ideasData - Les données JSON contenant les idées
 * @param model - Le modèle LLM à utiliser
 * @param language - La langue de génération (par défaut: français)
 * @returns Les données JSON avec les résumés ajoutés aux idées
 */
export async function generateAllIdeaSummaries(
    ideasData: IdeasData,
    model: Model,
    language: string = "français"
): Promise<IdeasData> {
    const updatedIdeasData = { ...ideasData };

    // Parcourir tous les topics et leurs idées
    for (const topicWithIdeas of updatedIdeasData.ideas) {
        for (const idea of topicWithIdeas.ideas) {
            try {
                // Générer le résumé pour cette idée en passant le nom du thème
                const summary = await generateIdeaSummary(
                    idea,
                    topicWithIdeas.topic,
                    model,
                    language
                );
                idea.summary = summary;
                console.log(
                    `✓ Résumé généré pour "${idea.name}" (${topicWithIdeas.topic})`
                );
            } catch (error) {
                console.error(
                    `✗ Erreur lors de la génération du résumé pour "${idea.name}":`,
                    error
                );
                // Continuer avec les autres idées même en cas d'erreur
                idea.summary = "";
            }
        }
    }

    return updatedIdeasData;
}

