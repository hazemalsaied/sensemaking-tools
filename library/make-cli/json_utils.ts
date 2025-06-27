import { Comment, VoteTally, GroupVoteTallies, Summary, SummaryContent } from "../src/types";



// Fonctions utilitaires pour générer le JSON selon le schéma

export function extractTopicsFromComments(comments: Comment[]): any[] {
    const topicMap = new Map<string, Set<string>>();

    comments.forEach(comment => {
        comment.topics?.forEach(topic => {
            if (!topicMap.has(topic.name)) {
                topicMap.set(topic.name, new Set());
            }
            if ('subtopics' in topic && topic.subtopics) {
                topic.subtopics.forEach(subtopic => {
                    topicMap.get(topic.name)!.add(subtopic.name);
                });
            }
        });
    });

    return Array.from(topicMap.entries()).map(([topicName, subtopics]) => ({
        name: topicName,
        description: "",
        subtopics: Array.from(subtopics).map(subtopicName => ({
            name: subtopicName,
            description: ""
        }))
    }));
}

export function generateTopicStatistics(comments: Comment[]): Record<string, any> {
    const topicStats: Record<string, any> = {};

    // Grouper les commentaires par topic
    const topicGroups = new Map<string, Comment[]>();
    const subtopicGroups = new Map<string, Comment[]>();

    comments.forEach(comment => {
        comment.topics?.forEach(topic => {
            // Grouper par topic principal
            if (!topicGroups.has(topic.name)) {
                topicGroups.set(topic.name, []);
            }
            topicGroups.get(topic.name)!.push(comment);

            // Grouper par sous-topic
            if ('subtopics' in topic && topic.subtopics) {
                topic.subtopics.forEach(subtopic => {
                    if (!subtopicGroups.has(subtopic.name)) {
                        subtopicGroups.set(subtopic.name, []);
                    }
                    subtopicGroups.get(subtopic.name)!.push(comment);
                });
            }
        });
    });

    // Calculer les statistiques pour chaque topic principal
    topicGroups.forEach((groupComments, topicName) => {
        let totalVotes = 0;
        let agreeVotes = 0;
        let disagreeVotes = 0;
        let passVotes = 0;

        groupComments.forEach(comment => {
            if (comment.voteInfo) {
                if ('agreeCount' in comment.voteInfo) {
                    // VoteTally format
                    const votes = comment.voteInfo as VoteTally;
                    totalVotes += votes.getTotalCount(true);
                    agreeVotes += votes.agreeCount;
                    disagreeVotes += votes.disagreeCount;
                    passVotes += votes.passCount || 0;
                } else {
                    // GroupVoteTallies format
                    const groupVotes = comment.voteInfo as GroupVoteTallies;
                    Object.values(groupVotes).forEach(votes => {
                        totalVotes += votes.getTotalCount(true);
                        agreeVotes += votes.agreeCount;
                        disagreeVotes += votes.disagreeCount;
                        passVotes += votes.passCount || 0;
                    });
                }
            }
        });

        topicStats[topicName] = {
            total_votes: totalVotes,
            agree_votes: agreeVotes,
            disagree_votes: disagreeVotes,
            pass_votes: passVotes,
            agreement_rate: totalVotes > 0 ? `${((agreeVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            disagreement_rate: totalVotes > 0 ? `${((disagreeVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            neutral_rate: totalVotes > 0 ? `${((passVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            comment_count: groupComments.length
        };
    });

    // Calculer les statistiques pour chaque sous-topic
    subtopicGroups.forEach((groupComments, subtopicName) => {
        let totalVotes = 0;
        let agreeVotes = 0;
        let disagreeVotes = 0;
        let passVotes = 0;

        groupComments.forEach(comment => {
            if (comment.voteInfo) {
                if ('agreeCount' in comment.voteInfo) {
                    // VoteTally format
                    const votes = comment.voteInfo as VoteTally;
                    totalVotes += votes.getTotalCount(true);
                    agreeVotes += votes.agreeCount;
                    disagreeVotes += votes.disagreeCount;
                    passVotes += votes.passCount || 0;
                } else {
                    // GroupVoteTallies format
                    const groupVotes = comment.voteInfo as GroupVoteTallies;
                    Object.values(groupVotes).forEach(votes => {
                        totalVotes += votes.getTotalCount(true);
                        agreeVotes += votes.agreeCount;
                        disagreeVotes += votes.disagreeCount;
                        passVotes += votes.passCount || 0;
                    });
                }
            }
        });

        topicStats[subtopicName] = {
            total_votes: totalVotes,
            agree_votes: agreeVotes,
            disagree_votes: disagreeVotes,
            pass_votes: passVotes,
            agreement_rate: totalVotes > 0 ? `${((agreeVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            disagreement_rate: totalVotes > 0 ? `${((disagreeVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            neutral_rate: totalVotes > 0 ? `${((passVotes / totalVotes) * 100).toFixed(1)}%` : "0.0%",
            comment_count: groupComments.length
        };
    });

    return topicStats;
}

export function generateTopicAnalysis(summary: Summary, comments: Comment[]): any[] {
    const topicAnalysis: any[] = [];

    // Créer un map des topics avec leurs sous-topics
    const topicToSubtopics = new Map<string, Set<string>>();

    comments.forEach(comment => {
        comment.topics?.forEach(topic => {
            if (!topicToSubtopics.has(topic.name)) {
                topicToSubtopics.set(topic.name, new Set());
            }
            if ('subtopics' in topic && topic.subtopics) {
                topic.subtopics.forEach(subtopic => {
                    topicToSubtopics.get(topic.name)!.add(subtopic.name);
                });
            }
        });
    });

    // Générer l'analyse pour chaque topic principal avec ses sous-topics
    topicToSubtopics.forEach((subtopics, topicName) => {
        const topicComments = comments.filter(comment =>
            comment.topics?.some(topic => topic.name === topicName)
        );

        // Calculer les patterns de vote pour le topic principal
        const stats = generateTopicStatistics([...topicComments])[topicName];

        // Créer l'analyse du topic principal
        const topicAnalysisItem = {
            topic: topicName,
            insights: null, // À remplir par l'analyse LLM si nécessaire
            agreement: null, // À remplir par l'analyse LLM si nécessaire
            disagreement: null, // À remplir par l'analyse LLM si nécessaire
            voting_patterns: {
                average_agreement: stats ? stats.agreement_rate : "0.0%",
                controversy_score: stats ? stats.disagreement_rate : "0.0%",
                key_observations: []
            }
        };

        topicAnalysis.push(topicAnalysisItem);

        // Ajouter les analyses des sous-topics sous le topic parent
        subtopics.forEach(subtopicName => {
            const subtopicComments = comments.filter(comment =>
                comment.topics?.some(topic =>
                    'subtopics' in topic && topic.subtopics?.some(subtopic => subtopic.name === subtopicName)
                )
            );

            // Calculer les patterns de vote pour le sous-topic
            const subtopicStats = generateTopicStatistics([...subtopicComments])[subtopicName];

            // Extraire les résumés du summary pour ce sous-topic
            const subtopicSummary = extractSubtopicSummaryFromContents(summary.contents, subtopicName);

            topicAnalysis.push({
                topic: subtopicName,
                insights: subtopicSummary.insights,
                agreement: subtopicSummary.agreement,
                disagreement: subtopicSummary.disagreement,
                voting_patterns: {
                    average_agreement: subtopicStats ? subtopicStats.agreement_rate : "0.0%",
                    controversy_score: subtopicStats ? subtopicStats.disagreement_rate : "0.0%",
                    key_observations: []
                }
            });
        });
    });

    return topicAnalysis;
}

export function extractSubtopicSummaryFromContents(contents: SummaryContent[], subtopicName: string): {
    insights: string | null;
    agreement: string | null;
    disagreement: string | null;
} {
    let insights: string | null = null;
    let agreement: string | null = null;
    let disagreement: string | null = null;

    // Parcourir récursivement les contenus pour trouver le sous-topic
    function searchInContents(contents: SummaryContent[]) {
        for (const content of contents) {
            // Vérifier si ce contenu correspond au sous-topic
            if (content.title && content.title.includes(subtopicName)) {
                // Chercher les sous-contenus pour extraire les informations
                if (content.subContents) {
                    for (const subContent of content.subContents) {
                        if (subContent.title?.includes("Prominent themes")) {
                            insights = subContent.text;
                        } else if (subContent.title?.includes("Common ground")) {
                            agreement = subContent.text;
                        } else if (subContent.title?.includes("Differences of opinion")) {
                            disagreement = subContent.text;
                        }
                    }
                }
                break;
            }

            // Rechercher récursivement dans les sous-contenus
            if (content.subContents) {
                searchInContents(content.subContents);
            }
        }
    }

    searchInContents(contents);

    return { insights, agreement, disagreement };
}

export function extractOverviewFromSummary(summary: Summary): string {
    // Chercher le contenu avec le type "overview" ou le premier contenu sans type spécifique
    const overviewContent = summary.contents.find(content =>
        content.type === "overview" || content.type === "Overview" || !content.type
    );

    if (overviewContent) {
        return overviewContent.text;
    }

    // Si aucun overview spécifique n'est trouvé, prendre le premier contenu
    if (summary.contents.length > 0) {
        return summary.contents[0].text;
    }

    return "";
}
