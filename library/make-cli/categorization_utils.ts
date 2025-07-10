import { Topic } from "../src/types";
import { parseTopicsString } from "./analysis_utils";


export type CommentCsvRow = {
    "comment-id": string;
    comment_text: string;
    topics?: string;
    "group-id"?: string;
};



export function displayTopicHierarchy(topics: Topic[]): void {
    if (!topics || topics.length === 0) {
        console.log("Aucun thème trouvé.");
        return;
    }

    console.log("\nHIÉRARCHIE DES THÈMES EXTRITS");
    console.log("=".repeat(50));

    topics.forEach((topic, index) => {
        // Affichage du thème principal
        console.log(`\n📂 ${index + 1}. ${topic.name}`);

        // Affichage des sous-thèmes s'ils existent
        if ("subtopics" in topic && topic.subtopics && topic.subtopics.length > 0) {
            topic.subtopics.forEach((subtopic: any, subIndex: number) => {
                console.log(`   ├── 📄 ${subtopic.name}`);

                // Affichage des sous-sous-thèmes s'ils existent
                if ("subtopics" in subtopic && subtopic.subtopics && Array.isArray(subtopic.subtopics) && subtopic.subtopics.length > 0) {
                    (subtopic.subtopics as any[]).forEach((subsubtopic: any, subSubIndex: number) => {
                        const isLast = subSubIndex === (subtopic.subtopics as any[]).length - 1;
                        const prefix = isLast ? "   │   └──" : "   │   ├──";
                        console.log(`${prefix}  ${subsubtopic.name}`);
                    });
                }
            });
        }
    });

    console.log("\n" + "=".repeat(50));
    console.log(`Total: ${topics.length} thème(s) principal(aux)`);

    // Compter le nombre total de sous-thèmes
    const totalSubtopics = topics.reduce((count, topic) => {
        if ("subtopics" in topic && topic.subtopics) {
            return count + topic.subtopics.length;
        }
        return count;
    }, 0);

    if (totalSubtopics > 0) {
        console.log(`Total: ${totalSubtopics} sous-thème(s)`);
    }
}

export function extractExistingTopicsFromCsv(csvRows: CommentCsvRow[]): Topic[] | undefined {
    const allTopicsStrings: string[] = [];

    // Collect all non-empty topics strings from the CSV
    for (const row of csvRows) {
        if (row.topics && row.topics.trim()) {
            allTopicsStrings.push(row.topics);
        }
    }

    if (allTopicsStrings.length === 0) {
        return undefined;
    }

    // Parse all topics strings and extract unique topics
    const topicMap = new Map<string, Topic>();

    for (const topicsString of allTopicsStrings) {
        try {
            const parsedTopics = parseTopicsString(topicsString);
            for (const topic of parsedTopics) {
                if (!topicMap.has(topic.name)) {
                    topicMap.set(topic.name, topic);
                } else {
                    // Merge subtopics if they exist
                    const existingTopic = topicMap.get(topic.name)!;
                    if ("subtopics" in topic && topic.subtopics) {
                        if ("subtopics" in existingTopic) {
                            // Merge subtopics
                            const existingSubtopics = existingTopic.subtopics || [];
                            const newSubtopics = topic.subtopics || [];
                            const mergedSubtopics = [...existingSubtopics];

                            for (const newSubtopic of newSubtopics) {
                                if (!mergedSubtopics.some(existing => existing.name === newSubtopic.name)) {
                                    mergedSubtopics.push(newSubtopic);
                                }
                            }

                            // Create a new NestedTopic with merged subtopics
                            topicMap.set(topic.name, {
                                name: existingTopic.name,
                                subtopics: mergedSubtopics
                            });
                        } else {
                            // Convert existing FlatTopic to NestedTopic
                            topicMap.set(topic.name, {
                                name: existingTopic.name,
                                subtopics: topic.subtopics
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to parse topics string: ${topicsString}, error: ${error}`);
        }
    }

    const extractedTopics = Array.from(topicMap.values());
    console.log(`Extracted ${extractedTopics.length} existing topics from CSV`);
    return extractedTopics.length > 0 ? extractedTopics : undefined;
}
