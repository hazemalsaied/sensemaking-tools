import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface pour les données de remplacement dans un template
 */
export interface TemplateData {
    [key: string]: string | number | boolean;
}

/**
 * Charge un template depuis un fichier et remplace les placeholders
 * @param templatePath - Chemin vers le fichier template
 * @param data - Données pour remplacer les placeholders
 * @returns Le contenu du template avec les placeholders remplacés
 */
export function loadAndFillTemplate(templatePath: string, data: TemplateData): string {
    try {
        // Construire le chemin absolu vers le template
        const absolutePath = path.resolve(__dirname, '..', '..', '..', 'templates', templatePath);

        // Lire le contenu du fichier template
        const templateContent = fs.readFileSync(absolutePath, 'utf-8');

        // Remplacer tous les placeholders {{key}} par les valeurs correspondantes
        let filledTemplate = templateContent;

        for (const [key, value] of Object.entries(data)) {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            filledTemplate = filledTemplate.replace(placeholder, String(value));
        }

        return filledTemplate;
    } catch (error) {
        console.error(`Erreur lors du chargement du template ${templatePath}:`, error);
        throw new Error(`Impossible de charger le template: ${templatePath}`);
    }
}

/**
 * Charge un template de prompt pour les topics principaux
 * @param language - Langue des commentaires
 * @returns Le prompt rempli
 */
export function loadLearnTopicsPrompt(language: string = "french"): string {
    return loadAndFillTemplate('topics_modeling_prompt.txt', {
        language: language
    });
}

/**
 * Charge un template de prompt pour les subtopics
 * @param parentTopic - Le topic parent
 * @param otherTopics - Autres topics à éviter
 * @param language - Langue des commentaires
 * @returns Le prompt rempli
 */
export function loadSubtopicsPrompt(
    parentTopic: { name: string },
    otherTopics?: { name: string }[],
    language: string = "french"
): string {
    const otherTopicNames = otherTopics?.map((topic) => topic.name).join(", ") ?? "";

    return loadAndFillTemplate('subtopics_modeling_prompt.txt', {
        parentTopicName: parentTopic.name,
        otherTopicNames: otherTopicNames,
        language: language
    });
}

/**
 * Charge un template de prompt pour la catégorisation des commentaires
 * @param topics - Les topics disponibles pour la catégorisation
 * @returns Le prompt rempli
 */
export function loadCategorizationPrompt(topics: any[]): string {
    return loadAndFillTemplate('categorization_prompt.txt', {
        topics: JSON.stringify(topics)
    });
}