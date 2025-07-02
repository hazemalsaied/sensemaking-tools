import { Client } from 'pg';
import * as config from "../configs.json";

export async function persistJsonToDatabase(jsonContent: string, slug: string, tag?: string): Promise<void> {
    const client = new Client({
        host: config.database.host,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        port: config.database.port,
    });

    try {
        await client.connect();
        console.log('Connexion à la base de données PostgreSQL établie pour la persistance JSON');

        // Récupérer le maximum ID actuel de la table
        const maxIdResult = await client.query('SELECT COALESCE(MAX(id), 0) as max_id FROM sensemaking_json');
        const maxId = parseInt(maxIdResult.rows[0].max_id);
        const customId = maxId + 1;

        console.log(`ID maximum actuel: ${maxId}, nouvel ID généré: ${customId}`);

        // Insérer avec l'ID personnalisé généré automatiquement
        const insertQuery = `
            INSERT INTO sensemaking_json (id, slug, tag, json_data)
            VALUES ($1, $2, $3, $4)
        `;
        const queryParams = [customId, slug, tag, JSON.parse(jsonContent)];

        await client.query(insertQuery, queryParams);

        console.log(`Contenu JSON persisté avec succès dans la table sensemaking_json avec l'ID: ${customId}`);
    } catch (error) {
        console.error('Erreur lors de la persistance JSON en base de données:', error);
        throw error;
    } finally {
        await client.end();
    }
}