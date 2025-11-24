import { Comment, VoteTally, GroupVoteTallies, Summary, SummaryContent } from "../src/types";

// Interface pour les données CSV étendues avec les champs nécessaires pour les statistiques
export interface ExtendedCsvRow {
    "comment-id": string;
    zone_name?: string;
    score_v2_agree?: number | string;
    score_v2_disagree?: number | string;
    score_v2_agree_like?: number | string;
    score_v2_agree_doable?: number | string;
    score_v2_top?: number | string;
    score_v2_controversy?: number | string;
}



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

/**
 * Calcule les statistiques pour une idée donnée à partir des commentaires associés
 * @param commentIds Les IDs des commentaires associés à l'idée
 * @param csvDataMap Map des données CSV indexées par comment-id
 * @returns Objet contenant les statistiques calculées
 */
function calculateIdeaStatistics(
    commentIds: string[],
    csvDataMap: Map<string, ExtendedCsvRow>
): {
    consensus_proposals: number;
    controversy_proposals: number;
    top_3_mean_agree: number;
    top_3_mean_disagree: number;
    mean_agree: number;
    mean_disagree: number;
    top_3_mean_agree_like: number;
    top_3_mean_agree_doable: number;
    mean_agree_like: number;
    mean_agree_doable: number;
} {
    // Filtrer les propositions (commentaires) qui ont les données nécessaires
    const proposals = commentIds
        .map(id => csvDataMap.get(id))
        .filter((row): row is ExtendedCsvRow => row !== undefined);

    // Compter les propositions de consensus et de controverse
    const consensus_proposals = proposals.filter(
        p => p.zone_name === 'consensus'
    ).length;
    const controversy_proposals = proposals.filter(
        p => p.zone_name === 'controversy'
    ).length;

    // Fonction helper pour convertir en nombre
    const toNumber = (value: number | string | undefined): number => {
        if (value === undefined || value === null || value === '') return 0;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return value;
    };

    // Trier les propositions par score_v2_top (descendant) pour mean_agree
    const proposalsSortedByTop = [...proposals].sort((a, b) => {
        const scoreA = toNumber(a.score_v2_top);
        const scoreB = toNumber(b.score_v2_top);
        return scoreB - scoreA;
    });

    // Trier les propositions par score_v2_controversy (descendant) pour mean_disagree
    const proposalsSortedByControversy = [...proposals].sort((a, b) => {
        const scoreA = toNumber(a.score_v2_controversy);
        const scoreB = toNumber(b.score_v2_controversy);
        return scoreB - scoreA;
    });

    // Calculer top_3_mean_agree (moyenne des top 3 triés par score_v2_top)
    const top3ByTop = proposalsSortedByTop.slice(0, 3);
    const top3AgreeScores = top3ByTop.map(p => toNumber(p.score_v2_agree)).filter(s => s > 0);
    const top_3_mean_agree = top3AgreeScores.length > 0
        ? top3AgreeScores.reduce((sum, score) => sum + score, 0) / top3AgreeScores.length
        : 0;

    // Calculer top_3_mean_disagree (moyenne des top 3 triés par score_v2_controversy)
    const top3ByControversy = proposalsSortedByControversy.slice(0, 3);
    const top3DisagreeScores = top3ByControversy.map(p => toNumber(p.score_v2_disagree)).filter(s => s > 0);
    const top_3_mean_disagree = top3DisagreeScores.length > 0
        ? top3DisagreeScores.reduce((sum, score) => sum + score, 0) / top3DisagreeScores.length
        : 0;

    // Calculer mean_agree (moyenne de tous triés par score_v2_top)
    const allAgreeScores = proposalsSortedByTop.map(p => toNumber(p.score_v2_agree)).filter(s => s > 0);
    const mean_agree = allAgreeScores.length > 0
        ? allAgreeScores.reduce((sum, score) => sum + score, 0) / allAgreeScores.length
        : 0;

    // Calculer mean_disagree (moyenne de tous triés par score_v2_controversy)
    const allDisagreeScores = proposalsSortedByControversy.map(p => toNumber(p.score_v2_disagree)).filter(s => s > 0);
    const mean_disagree = allDisagreeScores.length > 0
        ? allDisagreeScores.reduce((sum, score) => sum + score, 0) / allDisagreeScores.length
        : 0;

    // Calculer top_3_mean_agree_like (moyenne des top 3 triés par score_v2_top)
    const top3AgreeLikeScores = top3ByTop.map(p => toNumber(p.score_v2_agree_like)).filter(s => s > 0);
    const top_3_mean_agree_like = top3AgreeLikeScores.length > 0
        ? top3AgreeLikeScores.reduce((sum, score) => sum + score, 0) / top3AgreeLikeScores.length
        : 0;

    // Calculer top_3_mean_agree_doable (moyenne des top 3 triés par score_v2_top)
    const top3AgreeDoableScores = top3ByTop.map(p => toNumber(p.score_v2_agree_doable)).filter(s => s > 0);
    const top_3_mean_agree_doable = top3AgreeDoableScores.length > 0
        ? top3AgreeDoableScores.reduce((sum, score) => sum + score, 0) / top3AgreeDoableScores.length
        : 0;

    // Calculer mean_agree_like (moyenne de tous triés par score_v2_top)
    const allAgreeLikeScores = proposalsSortedByTop.map(p => toNumber(p.score_v2_agree_like)).filter(s => s > 0);
    const mean_agree_like = allAgreeLikeScores.length > 0
        ? allAgreeLikeScores.reduce((sum, score) => sum + score, 0) / allAgreeLikeScores.length
        : 0;

    // Calculer mean_agree_doable (moyenne de tous triés par score_v2_top)
    const allAgreeDoableScores = proposalsSortedByTop.map(p => toNumber(p.score_v2_agree_doable)).filter(s => s > 0);
    const mean_agree_doable = allAgreeDoableScores.length > 0
        ? allAgreeDoableScores.reduce((sum, score) => sum + score, 0) / allAgreeDoableScores.length
        : 0;

    return {
        consensus_proposals,
        controversy_proposals,
        top_3_mean_agree: Math.round(top_3_mean_agree * 100) / 100, // Arrondir à 2 décimales
        top_3_mean_disagree: Math.round(top_3_mean_disagree * 100) / 100,
        mean_agree: Math.round(mean_agree * 100) / 100,
        mean_disagree: Math.round(mean_disagree * 100) / 100,
        top_3_mean_agree_like: Math.round(top_3_mean_agree_like * 100) / 100,
        top_3_mean_agree_doable: Math.round(top_3_mean_agree_doable * 100) / 100,
        mean_agree_like: Math.round(mean_agree_like * 100) / 100,
        mean_agree_doable: Math.round(mean_agree_doable * 100) / 100
    };
}

/**
 * Génère la structure des idées organisées par topic.
 * Structure: topic -> idées -> commentaires associés
 * Le topic d'une idée est déterminé par le topic qui apparaît le plus souvent
 * parmi les commentaires associés à cette idée.
 * @param comments Les commentaires avec leurs idées et topics
 * @param csvData Les données CSV optionnelles avec zone_name et scores pour calculer les statistiques
 * @returns Structure JSON des idées organisées par topic
 */
export function generateIdeasStructure(
    comments: (Comment & { idea?: string })[],
    csvData?: ExtendedCsvRow[]
): any[] {
    // D'abord, grouper les commentaires par idée
    // Structure: Map<ideaName, Comment[]>
    const ideaToCommentsMap = new Map<string, (Comment & { idea?: string })[]>();

    // Parcourir tous les commentaires et les grouper par idée
    comments.forEach(comment => {
        // Ignorer les commentaires sans idée
        if (!comment.idea || comment.idea.trim() === '') {
            return;
        }

        // Séparer les idées par point-virgule et traiter chacune individuellement
        const ideas = comment.idea.split(';').map(idea => idea.trim()).filter(idea => idea !== '');

        ideas.forEach(ideaName => {
            if (!ideaToCommentsMap.has(ideaName)) {
                ideaToCommentsMap.set(ideaName, []);
            }
            ideaToCommentsMap.get(ideaName)!.push(comment);
        });
    });

    // Pour chaque idée, déterminer le topic le plus fréquent
    // Structure finale: Map<topicName, Map<ideaName, Comment[]>>
    const topicToIdeasMap = new Map<string, Map<string, (Comment & { idea?: string })[]>>();

    ideaToCommentsMap.forEach((commentList, ideaName) => {
        // Compter les occurrences de chaque topic parmi les commentaires de cette idée
        const topicCounts = new Map<string, number>();

        commentList.forEach(comment => {
            // Parcourir tous les topics du commentaire
            comment.topics?.forEach(topic => {
                const topicName = topic.name;
                topicCounts.set(topicName, (topicCounts.get(topicName) || 0) + 1);
            });
        });

        // Trouver le topic le plus fréquent
        let mostFrequentTopic = '';
        let maxCount = 0;
        topicCounts.forEach((count, topicName) => {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentTopic = topicName;
            }
        });

        // Si aucun topic n'a été trouvé, ignorer cette idée
        if (!mostFrequentTopic) {
            return;
        }

        // Ajouter l'idée au topic le plus fréquent
        if (!topicToIdeasMap.has(mostFrequentTopic)) {
            topicToIdeasMap.set(mostFrequentTopic, new Map());
        }

        const ideasMap = topicToIdeasMap.get(mostFrequentTopic)!;
        ideasMap.set(ideaName, commentList);
    });

    // Créer un map des données CSV indexées par comment-id si disponibles
    const csvDataMap = new Map<string, ExtendedCsvRow>();
    if (csvData) {
        csvData.forEach(row => {
            csvDataMap.set(row["comment-id"], row);
        });
    }

    // Convertir en structure JSON
    const result: any[] = [];
    topicToIdeasMap.forEach((ideasMap, topicName) => {
        const ideas: any[] = [];
        ideasMap.forEach((commentList, ideaName) => {
            const commentIds = commentList.map(comment => comment.id);

            // Calculer les statistiques si les données CSV sont disponibles
            const stats = csvData && csvData.length > 0
                ? calculateIdeaStatistics(commentIds, csvDataMap)
                : {
                    consensus_proposals: 0,
                    controversy_proposals: 0,
                    top_3_mean_agree: 0,
                    top_3_mean_disagree: 0,
                    mean_agree: 0,
                    mean_disagree: 0,
                    top_3_mean_agree_like: 0,
                    top_3_mean_agree_doable: 0,
                    mean_agree_like: 0,
                    mean_agree_doable: 0
                };

            ideas.push({
                name: ideaName,
                stats: stats,
                comments: commentList.map(comment => {
                    const csvRow = csvDataMap.get(comment.id);
                    return {
                        id: comment.id,
                        text: comment.text,
                        zone_name: csvRow?.zone_name || null
                    };
                })
            });
        });

        if (ideas.length > 0) {
            result.push({
                topic: topicName,
                ideas: ideas
            });
        }
    });

    return result;
}
