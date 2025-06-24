import { Client } from 'pg';
import * as config from "../configs.json";

export type SensemakingRow = {
    id: string;
    source_text: string;
    generated_text: string;
    generation_type: string;
    slug: string;
    tag?: string;
    creation_date?: string;
};

export function flattenCommentsToSensemakingTable(comments: any[], slug: string, tag: string): SensemakingRow[] {
    const rows: SensemakingRow[] = [];
    const now = new Date().toISOString();

    function processTopic(
        comment: any,
        topic: any,
        parentType: string = "topic"
    ) {
        // Ligne pour le topic ou subtopic
        rows.push({
            id: comment.id,
            source_text: comment.text,
            generated_text: topic.name,
            generation_type: parentType,
            slug: slug,
            tag: tag,
            creation_date: now,
        });
        // Parcours récursif des subtopics
        if (topic.subtopics && topic.subtopics.length > 0) {
            for (const sub of topic.subtopics) {
                processTopic(comment, sub, "subtopic");
            }
        }
    }

    for (const comment of comments) {
        if (comment.topics) {
            for (const topic of comment.topics) {
                processTopic(comment, topic, "topic");
            }
        }
    }
    return rows;
}

export function flattenSubContentsToSensemakingTable(subContents: any[], slug: string, tag: string): SensemakingRow[] {
    const rows: SensemakingRow[] = [];
    const now = new Date().toISOString();

    // Premier niveau : itère sur les éléments de subContents
    for (const firstLevel of subContents) {
        // Premier niveau : title comme source, text comme generation, "topic summary" comme generation_type
        rows.push({
            id: ``,
            source_text: firstLevel.title,
            generated_text: firstLevel.text,
            generation_type: "topic summary",
            slug: slug,
            tag: tag,
            creation_date: now,
        });

        // Deuxième niveau : subContents de chaque élément du premier niveau
        if (firstLevel.subContents && firstLevel.subContents.length > 0) {
            for (const secondLevel of firstLevel.subContents) {
                // Deuxième niveau : title comme source, text comme generation, "subtopic summary" comme generation_type
                rows.push({
                    id: ``,
                    source_text: secondLevel.title,
                    generated_text: secondLevel.text,
                    generation_type: "subtopic summary",
                    slug: slug,
                    tag: tag,
                    creation_date: now,
                });

                // Troisième niveau : subContents de chaque élément du deuxième niveau
                if (secondLevel.subContents && secondLevel.subContents.length > 0) {
                    for (const thirdLevel of secondLevel.subContents) {
                        // Troisième niveau : title du parent + title de l'élément comme source, text + citations comme generation, "subtopic analysis" comme generation_type
                        const sourceText = `${secondLevel.title} - ${thirdLevel.title}`;
                        let generatedText = thirdLevel.text;

                        // Ajouter les citations si elles existent
                        if (thirdLevel.citations && thirdLevel.citations.length > 0) {
                            generatedText += `\n\nCitations: ${thirdLevel.citations.join(', ')}`;
                        }

                        rows.push({
                            id: ``,
                            source_text: sourceText,
                            generated_text: generatedText,
                            generation_type: "subtopic analysis",
                            slug: slug,
                            tag: tag,
                            creation_date: now,
                        });
                    }
                }
            }
        }
    }

    return rows;
}

export async function persistSensemakingToDatabase(allRows: SensemakingRow[]): Promise<void> {
    const client = new Client({
        host: config.database.host,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        port: config.database.port,
    });

    try {
        await client.connect();
        console.log('Connexion à la base de données PostgreSQL établie');

        // Requête unique pour toutes les lignes - l'ID sera géré automatiquement par PostgreSQL
        const insertQuery = `
      INSERT INTO sensemaking (source_text, generated_text, generation_type, slug, tag, creation_date)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

        // Traitement en batch de toutes les lignes
        if (allRows.length > 0) {
            console.log(`Insertion de ${allRows.length} enregistrements...`);
            const batchSize = 100;

            for (let i = 0; i < allRows.length; i += batchSize) {
                const batch = allRows.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(row =>
                        client.query(insertQuery, [
                            row.source_text,
                            row.generated_text,
                            row.generation_type,
                            row.slug,
                            row.tag,
                            row.creation_date
                        ])
                    )
                );

                console.log(`Lot ${Math.floor(i / batchSize) + 1} inséré (${batch.length} enregistrements)`);
            }

            console.log(`Total de ${allRows.length} enregistrements persistés dans la base de données`);
        } else {
            console.log('Aucun enregistrement à persister');
        }
    } catch (error) {
        console.error('Erreur lors de la persistance en base de données:', error);
        throw error;
    } finally {
        await client.end();
    }
}