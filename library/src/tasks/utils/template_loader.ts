import * as fs from 'fs';
import * as path from 'path';
import * as config from '../../../configs.json';

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
 * @returns Le prompt rempli
 */
export function loadLearnTopicsPrompt(): string {
    return loadAndFillTemplate('topics_modeling_prompt.txt', {
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour les subtopics
 * @param parentTopic - Le topic parent
 * @param otherTopics - Autres topics à éviter
 * @returns Le prompt rempli
 */
export function loadSubtopicsPrompt(
    parentTopic: { name: string },
    otherTopics?: { name: string }[]
): string {
    const otherTopicNames = otherTopics?.map((topic) => topic.name).join(", ") ?? "";

    return loadAndFillTemplate('subtopics_modeling_prompt.txt', {
        parentTopicName: parentTopic.name,
        otherTopicNames: otherTopicNames,
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la catégorisation des commentaires
 * @param topics - Les topics disponibles pour la catégorisation
 * @returns Le prompt rempli
 */
export function loadCategorizationPrompt(topics: any[], fewShots: string): string {
    return loadAndFillTemplate('categorization_prompt.txt', {
        topics: JSON.stringify(topics),
        few_shots: fewShots
    });
}

/**
 * Charge un template de prompt pour la comparaison des similarités entre groupes
 * @param groupCount - Le nombre de groupes à comparer
 * @returns Le prompt rempli
 */
export function loadGroupComparisonSimilarPrompt(groupCount: number): string {
    return loadAndFillTemplate('group_comparison_similar_prompt.txt', {
        groupCount: groupCount
    });
}

/**
 * Charge un template de prompt pour la comparaison des différences entre groupes
 * @returns Le prompt rempli
 */
export function loadGroupComparisonDifferentPrompt(): string {
    return loadAndFillTemplate('group_comparison_different_prompt.txt', {});
}

/**
 * Charge un template de prompt pour la description d'un groupe
 * @param groupName - Le nom du groupe à décrire
 * @returns Le prompt rempli
 */
export function loadGroupDescriptionPrompt(groupName: string): string {
    return loadAndFillTemplate('group_description_prompt.txt', {
        groupName: groupName
    });
}

/**
 * Charge un template de prompt pour la génération d'overview en une seule fois
 * @param topicNames - Les noms des topics avec leurs pourcentages
 * @returns Le prompt rempli
 */
export function loadOverviewOneShotPrompt(topicNames: string[]): string {
    return loadAndFillTemplate('overview_one_shot_prompt.txt', {
        topicNames: topicNames.map((s) => "* " + s).join("\n"),
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération d'overview par topic
 * @param topicName - Le nom du topic à traiter
 * @returns Le prompt rempli
 */
export function loadOverviewPerTopicPrompt(topicName: string): string {
    return loadAndFillTemplate('overview_per_topic_prompt.txt', {
        topicName: topicName,
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération des thèmes des subtopics
 * @param subtopicName - Le nom du subtopic à analyser
 * @returns Le prompt rempli
 */
export function loadTopSubtopicsPrompt(subtopicName: string): string {
    return loadAndFillTemplate('top_subtopics_prompt.txt', {
        subtopicName: subtopicName,
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération des thèmes des topics
 * @param topicName - Le nom du topic à analyser
 * @returns Le prompt rempli
 */
export function loadTopicsThemesPrompt(topicName: string): string {
    return loadAndFillTemplate('topics_themes_prompt.txt', {
        topicName: topicName
    });
}

/**
 * Charge un template de prompt pour la génération du terrain d'entente
 * @param containsGroups - Si les groupes sont présents
 * @returns Le prompt rempli
 */
export function loadTopicsCommonGroundPrompt(containsGroups: boolean): string {
    const groupSpecificText = containsGroups
        ? "Participants in this conversation have been clustered into opinion groups. These opinion groups mostly approve of these comments. "
        : "";

    return loadAndFillTemplate('topics_common_ground_prompt.txt', {
        groupSpecificText: groupSpecificText,
        commonInstructions: "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap. Do not forget that it is mandatory to use the same language as the comments language in your response",
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération du terrain d'entente (commentaire unique)
 * @param containsGroups - Si les groupes sont présents
 * @returns Le prompt rempli
 */
export function loadTopicsCommonGroundSinglePrompt(containsGroups: boolean): string {
    const groupSpecificText = containsGroups
        ? "Participants in this conversation have been clustered into opinion groups. These opinion groups mostly approve of these comments. "
        : "";

    return loadAndFillTemplate('topics_common_ground_single_prompt.txt', {
        groupSpecificText: groupSpecificText,
        commonInstructions: "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap. Do not forget that it is mandatory to use the same language as the comments language in your response",
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération des différences d'opinion
 * @returns Le prompt rempli
 */
export function loadTopicsDifferencesOpinionPrompt(): string {
    return loadAndFillTemplate('topics_differences_opinion_prompt.txt', {
        commonInstructions: "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap. Do not forget that it is mandatory to use the same language as the comments language in your response",
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération des différences d'opinion (commentaire unique)
 * @param containsGroups - Si les groupes sont présents
 * @returns Le prompt rempli
 */
export function loadTopicsDifferencesOpinionSinglePrompt(containsGroups: boolean): string {
    const groupSpecificText = containsGroups
        ? "Participants in this conversation have been clustered into opinion groups. There were very different levels of agreement between the two opinion groups regarding this comment. "
        : "";

    return loadAndFillTemplate('topics_differences_opinion_single_prompt.txt', {
        groupSpecificText: groupSpecificText,
        commonInstructions: "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap. Do not forget that it is mandatory to use the same language as the comments language in your response",
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour la génération du résumé récursif des topics
 * @param topicName - Le nom du topic
 * @returns Le prompt rempli
 */
export function loadTopicsRecursiveSummaryPrompt(topicName: string): string {
    return loadAndFillTemplate('topics_recursive_summary_prompt.txt', {
        topicName: topicName,
        commonInstructions: "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap. Do not forget that it is mandatory to use the same language as the comments language in your response",
        language: config.default_language
    });
}

/**
 * Charge un template de prompt pour le scoring de pertinence des topics et subtopics
 * @returns Le prompt rempli
 */
export function loadRelevanceScoringPrompt(): string {
    return loadAndFillTemplate('relevance_scoring_prompt.txt', {
    });
}