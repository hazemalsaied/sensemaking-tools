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

        // Requête pour insérer le JSON dans la table sensemaking_json
        const insertQuery = `
            INSERT INTO sensemaking_json (slug, tag, json_data)
            VALUES ($1, $2, $3)
        `;

        // Parse le JSON pour s'assurer qu'il est valide
        const jsonData = JSON.parse(jsonContent);

        await client.query(insertQuery, [slug, tag, jsonData]);

        console.log('Contenu JSON persisté avec succès dans la table sensemaking_json');
    } catch (error) {
        console.error('Erreur lors de la persistance JSON en base de données:', error);
        throw error;
    } finally {
        await client.end();
    }
}