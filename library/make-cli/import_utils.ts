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

// Module pour récupérer les propositions depuis la base de données et les transformer
// au format Jigsaw pour l'analyse de sensemaking.

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import * as config from '../configs.json';
import { Topic } from '../src/types';

export interface ProposalRow {
    id: number;
    content: string;
    zone_name: string;
    score_v2_agree: number;
    score_v2_disagree: number;
    score_v2_agree_like: number;
    score_v2_agree_doable: number;
    score_v2_neutral: number;
    score_v2_top: number;
    score_v2_controversy: number;
    vote_avg: number;
    user_id: number;
    slug: string;
    status: string;
}

export interface JigsawRow {
    comment_text: string;
    votes: number;
    agree_rate: number;
    disagree_rate: number;
    pass_rate: number;
    '1-agree-count': number;
    '1-disagree-count': number;
    '1-pass-count': number;
    'group-id': number;
    'comment-id': number;
    'author-id': number;
    zone_name: string;
    score_v2_agree: number;
    score_v2_disagree: number;
    score_v2_agree_like: number;
    score_v2_agree_doable: number;
    score_v2_top: number;
    score_v2_controversy: number;
}

export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
}

/**
 * Établit une connexion à la base de données PostgreSQL
 */
export function createDatabaseConnection(config: DatabaseConfig): Client {
    const client = new Client({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port,
    });

    return client;
}

/**
 * Récupère les propositions acceptées pour un slug donné depuis la base de données
 */
export async function fetchProposalsFromDatabase(
    client: Client,
    slug: string,
    limit?: number
): Promise<ProposalRow[]> {
    try {
        let query = `
      SELECT id, content, zone_name, score_v2_agree, score_v2_disagree, score_v2_agree_like, score_v2_agree_doable, score_v2_neutral, score_v2_top, score_v2_controversy, vote_avg, user_id, slug, status
      FROM proposals 
      WHERE status = 'Accepted' AND slug = $1
      ORDER BY date_created
    `;
        const params: (string | number)[] = [slug];
        if (limit && limit > 0) {
            params.push(limit);
            query += ` LIMIT $${params.length}`;
        }

        const result = await client.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Erreur lors de la récupération des propositions:', error);
        throw error;
    }
}

/**
 * Transforme les propositions de la base de données au format Jigsaw
 */
export function transformProposalsToJigsaw(proposals: ProposalRow[]): JigsawRow[] {
    return proposals.map(proposal => {
        // Calculer les comptes basés sur les taux et le nombre de votes
        const agreeCount = Math.round(proposal.score_v2_agree * proposal.vote_avg);
        const disagreeCount = Math.round(proposal.score_v2_disagree * proposal.vote_avg);
        const passCount = Math.round(proposal.score_v2_neutral * proposal.vote_avg);

        return {
            comment_text: proposal.content,
            votes: Math.round(proposal.vote_avg),
            agree_rate: Math.round(proposal.score_v2_agree * 100 * 10) / 10, // Arrondi à 1 décimale
            disagree_rate: Math.round(proposal.score_v2_disagree * 100 * 10) / 10,
            pass_rate: Math.round(proposal.score_v2_neutral * 100 * 10) / 10,
            '1-agree-count': agreeCount,
            '1-disagree-count': disagreeCount,
            '1-pass-count': passCount,
            'group-id': 1,
            'comment-id': proposal.id,
            'author-id': proposal.user_id,
            zone_name: proposal.zone_name,
            score_v2_agree: proposal.score_v2_agree,
            score_v2_disagree: proposal.score_v2_disagree,
            score_v2_agree_like: proposal.score_v2_agree_like,
            score_v2_agree_doable: proposal.score_v2_agree_doable,
            score_v2_top: proposal.score_v2_top,
            score_v2_controversy: proposal.score_v2_controversy
        };
    });
}

/**
 * Sauvegarde les données au format CSV dans le dossier data/{slug}/
 */
export async function saveJigsawDataToCsv(
    jigsawData: JigsawRow[],
    slug: string,
    outputDir?: string
): Promise<string> {
    const baseDir = outputDir || path.join(__dirname, '..', 'data', slug);

    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${slug}_${timestamp}.csv`;
    const filepath = path.join(baseDir, filename);

    // Définir les en-têtes CSV
    const header = [
        { id: 'comment_text', title: 'comment_text' },
        { id: 'votes', title: 'votes' },
        { id: 'agree_rate', title: 'agree_rate' },
        { id: 'disagree_rate', title: 'disagree_rate' },
        { id: 'pass_rate', title: 'pass_rate' },
        { id: '1-agree-count', title: '1-agree-count' },
        { id: '1-disagree-count', title: '1-disagree-count' },
        { id: '1-pass-count', title: '1-pass-count' },
        { id: 'group-id', title: 'group-id' },
        { id: 'comment-id', title: 'comment-id' },
        { id: 'author-id', title: 'author-id' },
        { id: 'zone_name', title: 'zone_name' },
        { id: 'score_v2_agree', title: 'score_v2_agree' },
        { id: 'score_v2_disagree', title: 'score_v2_disagree' },
        { id: 'score_v2_agree_like', title: 'score_v2_agree_like' },
        { id: 'score_v2_agree_doable', title: 'score_v2_agree_doable' },
        { id: 'score_v2_top', title: 'score_v2_top' },
        { id: 'score_v2_controversy', title: 'score_v2_controversy' }
    ];

    const csvWriter = createObjectCsvWriter({
        path: filepath,
        header: header
    });

    await csvWriter.writeRecords(jigsawData);
    console.log(`✅ Fichier CSV sauvegardé: ${filepath}`);

    return filepath;
}

/**
 * Fonction principale pour récupérer les propositions et les transformer au format Jigsaw
 */
/**
 * Récupère les analyses précédentes depuis la table sensemaking_front.sensemaking_json
 */
export async function fetchPreviousAnalysis(
    client: Client,
    slug: string
): Promise<any | null> {
    try {
        const query = `
            SELECT json_data, creation_date 
            FROM sensemaking_front.sensemaking_json
            WHERE slug = $1 
            ORDER BY creation_date DESC 
            LIMIT 1
        `;

        const result = await client.query(query, [slug]);

        if (result.rows.length === 0) {
            console.log(`📋 Aucune analyse précédente trouvée pour le slug: ${slug}`);
            return null;
        }

        console.log(`📋 Analyse précédente trouvée pour le slug: ${slug} (${result.rows[0].creation_date})`);
        return result.rows[0].json_data;
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'analyse précédente:', error);
        throw error;
    }
}

/**
 * Extrait les topics et subtopics d'une analyse précédente
 */
export function extractTopicsFromPreviousAnalysis(previousAnalysis: any): Topic[] {
    if (!previousAnalysis || !previousAnalysis.topics) {
        return [];
    }

    const topics: Topic[] = [];

    for (const topicData of previousAnalysis.topics) {
        const topic: Topic = {
            name: topicData.name,
            subtopics: topicData.subtopics ? topicData.subtopics.map((sub: any) => ({
                name: sub.name
            })) : []
        };
        topics.push(topic);
    }

    console.log(`📊 ${topics.length} topics extraits de l'analyse précédente`);
    return topics;
}

/**
 * Extrait les commentaires avec leurs topics d'une analyse précédente
 */
export function extractCategorizedCommentsFromPreviousAnalysis(previousAnalysis: any): { [commentId: string]: Topic[] } {
    if (!previousAnalysis || !previousAnalysis.categorized_comments) {
        return {};
    }

    const categorizedComments: { [commentId: string]: Topic[] } = {};

    for (const comment of previousAnalysis.categorized_comments) {
        if (comment.topics && comment.topics.length > 0) {
            const topics: Topic[] = comment.topics.map((topicData: any) => ({
                name: topicData.name,
                subtopics: topicData.subtopics ? topicData.subtopics.map((sub: any) => ({
                    name: sub.name
                })) : []
            }));
            categorizedComments[comment.id] = topics;
        }
    }

    console.log(`📊 ${Object.keys(categorizedComments).length} commentaires avec topics extraits de l'analyse précédente`);
    return categorizedComments;
}

export async function getProposalsForJigsaw(
    slug: string,
    outputDir?: string,
    limit?: number
): Promise<{ data: JigsawRow[], csvPath: string }> {
    const client = createDatabaseConnection(config.import_db);

    try {
        await client.connect();
        console.log('🔗 Connexion à la base de données établie');

        // Récupérer les propositions
        const proposals = await fetchProposalsFromDatabase(client, slug, limit);
        console.log(`📊 ${proposals.length} propositions trouvées pour le slug: ${slug}${limit ? ` (limité à ${limit})` : ""}`);

        if (proposals.length === 0) {
            throw new Error(`Aucune proposition trouvée pour le slug: ${slug}`);
        }

        // Transformer au format Jigsaw
        const jigsawData = transformProposalsToJigsaw(proposals);
        console.log('🔄 Données transformées au format Jigsaw');

        // Sauvegarder en CSV
        const csvPath = await saveJigsawDataToCsv(jigsawData, slug, outputDir);

        return {
            data: jigsawData,
            csvPath: csvPath
        };

    } catch (error) {
        console.error('❌ Erreur lors du traitement des propositions:', error);
        throw error;
    } finally {
        await client.end();
        console.log('🔌 Connexion à la base de données fermée');
    }
}


