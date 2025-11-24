import { Client } from 'pg';
import * as config from "../configs.json";

export async function persistJsonToDatabase(jsonContent: string, slug: string, tag?: string): Promise<void> {
    const client = new Client({
        host: config.export_db.host,
        user: config.export_db.user,
        password: config.export_db.password,
        database: config.export_db.database,
        port: config.export_db.port,
    });

    try {
        console.log('Connexion à la base de données PostgreSQL...');
        await client.connect();
        console.log('Connexion à la base de données PostgreSQL établie pour la persistance JSON');

        // Récupérer le maximum ID actuel de la table
        const maxIdResult = await client.query('SELECT COALESCE(MAX(id), 0) as max_id FROM sensemaking_front.sensemaking_json');
        const maxId = parseInt(maxIdResult.rows[0].max_id);
        const customId = maxId + 1;

        console.log(`ID maximum actuel: ${maxId}, nouvel ID généré: ${customId}`);

        // Valeurs par défaut pour les nouvelles colonnes
        const language = config.default_language || 'french';
        const active = true;
        const whiteUtm = 'facebook,twitter,snabchat,crm,mail';

        // Insérer avec l'ID personnalisé généré automatiquement et les nouvelles colonnes
        const insertQuery = `
            INSERT INTO sensemaking_front.sensemaking_json (id, slug, tag, json_data, language, active, white_utms)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        console.log(insertQuery);
        const queryParams = [customId, slug, tag, JSON.parse(jsonContent), language, active, whiteUtm];

        await client.query(insertQuery, queryParams);

        console.log(`Contenu JSON persisté avec succès dans la table sensemaking_front.sensemaking_json avec l'ID: ${customId}`);
        console.log(`Langue: ${language}, Actif: ${active}, White utms: ${whiteUtm}`);
    } catch (error) {
        console.error('Erreur lors de la persistance JSON en base de données:', error);
        throw error;
    } finally {
        await client.end();
    }
}