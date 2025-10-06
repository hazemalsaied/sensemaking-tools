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

export interface ProposalRow {
    id: number;
    content: string;
    score_v2_agree: number;
    score_v2_disagree: number;
    score_v2_neutral: number;
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
    slug: string
): Promise<ProposalRow[]> {
    try {
        const query = `
      SELECT id, content, score_v2_agree, score_v2_disagree, score_v2_neutral, 
             vote_avg, user_id, slug, status
      FROM proposals 
      WHERE status = 'Accepted' AND slug = $1
    `;

        const result = await client.query(query, [slug]);
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
            'author-id': proposal.user_id
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
        { id: 'author-id', title: 'author-id' }
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
export async function getProposalsForJigsaw(
    slug: string,
    outputDir?: string
): Promise<{ data: JigsawRow[], csvPath: string }> {
    const client = createDatabaseConnection(config.import_db);

    try {
        await client.connect();
        console.log('🔗 Connexion à la base de données établie');

        // Récupérer les propositions
        const proposals = await fetchProposalsFromDatabase(client, slug);
        console.log(`📊 ${proposals.length} propositions trouvées pour le slug: ${slug}`);

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


