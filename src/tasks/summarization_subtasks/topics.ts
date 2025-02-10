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

// Functions for different ways to summarize Comment and Vote data.

import { RecursiveSummary, resolvePromisesInParallel } from "./recursive_summarization";
import {
  getPrompt,
  decimalToPercent,
  commentTableMarkdown,
  ColumnDefinition,
} from "../../sensemaker_utils";
import {
  TopicStats,
  GroupedSummaryStats,
  getMaxGroupAgreeProbDifference,
  getMinAgreeProb,
} from "../../stats_util";
import { Comment } from "../../types";
import { getCommentCitations } from "../utils/citation_utils";
import { Model } from "../../models/model";

const commonGroundInstructions = `Here are several comments sharing different opinions. Your job is to summarize these comments. Do not pretend that you hold any of these opinions. You are not a participant in this discussion. Participants in this conversation have been clustered into opinion groups. These opinion groups mostly approve of these comments. Write a concise summary of these comments that is at least one sentence and at most three sentences long. The summary should be substantiated, detailed and informative: include specific findings, requests, proposals, action items and examples, grounded in the comments. Refer to the people who made these comments as participants, not commenters. Do not talk about how strongly they approve of these comments. Use complete sentences. Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap.`;

const commonGroundSingleCommentInstructions = `Here is a comment presenting an opinion from a discussion. Your job is to rewrite this comment clearly without embellishment. Do not pretend that you hold this opinion. You are not a participant in this discussion. Participants in this conversation have been clustered into opinion groups. These opinion groups mostly approve of this comment. Refer to the people who made these comments as participants, not commenters. Do not talk about how strongly they approve of these comments. Write a complete sentence. Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap.`;

const differencesOfOpinionInstructions = `Here are several comments which generated disagreement. Your job is summarize the ideas contained in the comments. Do not pretend that you hold any of these opinions. You are not a participant in this discussion. Write a concise summary of these comments that is at least one sentence and at most three sentences long. Refer to the people who made these comments as participants, not commenters.  Do not talk about how strongly they disagree on these comments. Use complete sentences. Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. The summary should not imply that these views were agreed on by all participants. Your output should begin in the form "There was low consensus". Do not pretend that these comments were written by different people.  For each sentence use a unique phrase to indicate that there was low consensus on the topic, and do not present each comment as an alternative idea. Do not yap.`;

const differencesOfOpinionSingleCommentInstructions = `Here is a comment presenting an opinion from a discussion. Your job is to rewrite this comment clearly without embellishment. Do not pretend that you hold this opinion. You are not a participant in this discussion. Participants in this conversation have been clustered into opinion groups. There were very different levels of agreement between the two opinion groups regarding this comment. Refer to the people who made these comments as participants, not commenters. Do not talk about how strongly they approve of these comments. Write a complete sentence. Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do not generate bullet points or special formatting. Do not yap.`;

/**
 * This RecursiveSummary subclass constructs a top level "Topics" summary section,
 * calling out to the separate TopicSummary and SubtopicSummary classes to generate
 * content for individual subsections corresponding to specific topics and subtopics.
 */
export class TopicsSummary extends RecursiveSummary<GroupedSummaryStats> {
  async getSummary() {
    // First construct the introductory description for the entire section
    const topicStats: TopicStats[] = this.input.getStatsByTopic();
    const nTopics: number = topicStats.length;
    const nSubtopics: number = topicStats
      .map((t) => t.subtopicStats?.length || 0)
      .reduce((n, m) => n + m, 0);
    const hasSubtopics: boolean = nSubtopics > 0;
    const subtopicsCountText: string = hasSubtopics ? `, as well as ${nSubtopics} subtopics` : "";
    const overviewText: string =
      `From the comments submitted, ${nTopics} high level topics were identified${subtopicsCountText}. ` +
      `Based on voting patterns between the opinion groups described above, both points of common ground as well as differences of opinion between the groups have been identified and are described below.`;

    // Now construct the individual Topic summaries
    const topicSummaries: Array<Promise<string>> = topicStats.map((topicStat) =>
      new TopicSummary(topicStat, this.model, this.additionalContext).getSummary()
    );
    const topicSummaryText: string = await resolvePromisesInParallel(topicSummaries).then(
      (summaries) => summaries.join("\n")
    );

    return Promise.resolve(
      `## Topics

${overviewText}

${topicSummaryText}
`
    );
  }
}

/**
 * This RecursiveSummary subclass generates summaries for individual topics.
 */
export class TopicSummary extends RecursiveSummary<GroupedSummaryStats> {
  // TopicSummary also needs to know about the topic, like name and subtopics
  topicStat: TopicStats;

  // This override is necessary to pass through a TopicStat object, rather than a SummaryStats object
  constructor(topicStat: TopicStats, model: Model, additionalContext?: string) {
    const commentStats = new GroupedSummaryStats(topicStat.comments);
    super(commentStats, model, additionalContext);
    this.topicStat = topicStat;
  }

  async getSummary() {
    const nSubtopics: number = this.topicStat.subtopicStats?.length || 0;
    if (nSubtopics == 0) {
      return this.getCommentSummary();
    } else {
      return this.getSubtopicsSummary();
    }
  }

  /**
   * Returns the section title for this topics summary section of the final report
   */
  getSectionTitle(): string {
    return `### ${this.topicStat.name} (${this.topicStat.commentCount} comments)`;
  }

  /**
   * When subtopics are present, compiles the individual summaries for those subtopics
   * @returns a promise of the summary string
   */
  async getSubtopicsSummary(): Promise<string> {
    const subtopicSummaries: Array<Promise<string>> =
      this.topicStat.subtopicStats?.map((subtopicStat) =>
        new SubtopicSummary(subtopicStat, this.model, this.additionalContext).getSummary()
      ) || [];
    const subtopicsSummaryText: string = await resolvePromisesInParallel(subtopicSummaries).then(
      (summaries) => summaries.join("\n")
    );
    // This is just a stub for now, and may eventually be added on to include more naunced descriptions of e.g. where the highest
    // points of common ground and most significant differences of opinion were across the subtopics.
    const nSubtopics: number = this.topicStat.subtopicStats?.length || 0;
    const topicSummary =
      nSubtopics > 0
        ? `This topic included ${nSubtopics} subtopic${nSubtopics === 1 ? "" : "s"}.`
        : "";

    return Promise.resolve(
      `${this.getSectionTitle()}

${topicSummary}

${subtopicsSummaryText}
`
    );
  }

  /**
   * Summarizes the comments associated with the given topic
   * @returns a promise of the summary string
   */
  async getCommentSummary(): Promise<string> {
    // Generate the primary common ground and differences of opinion summaries
    const commonGroundSummary = await this.getCommonGroundSummary();
    const differencesSummary = await this.getDifferencesOfOpinionSummary();

    let result = `${this.getSectionTitle()}

Common ground between groups: ${commonGroundSummary}

Differences of opinion: ${differencesSummary}
`;

    if (process.env["DEBUG_MODE"] === "true") {
      // Based on the common ground and differences of opinion comments,
      const commonGroundComments = this.input.getCommonGroundComments();
      const differencesComments = this.input.getDifferencesBetweenGroupsComments();

      // Figure out what comments aren't currently being summarized
      const allSummarizedCommentIds = new Set([
        ...commonGroundComments.map((c) => c.id),
        ...differencesComments.map((c) => c.id),
      ]);
      const otherComments = this.topicStat.comments.filter(
        (comment) => !allSummarizedCommentIds.has(comment.id)
      );

      const otherCommentsTable = commentTableMarkdown(otherComments, [
        { columnName: "minAgreeProb", getValue: getMinAgreeProb } as ColumnDefinition,
        {
          columnName: "maxAgreeDiff",
          getValue: getMaxGroupAgreeProbDifference,
        } as ColumnDefinition,
      ]);

      const otherCommentsSummary = `
**Other comments** (${otherComments.length} comments)

${otherCommentsTable}
`;
      result += otherCommentsSummary;
    }

    return Promise.resolve(result);
  }

  /**
   * Summarizes the comments on which there was the strongest agreement between groups.
   * @returns a short paragraph describing the similarities between groups, including comment citations.
   */
  async getCommonGroundSummary(): Promise<string> {
    const commonGroundComments = this.input.getCommonGroundComments();
    const nComments = commonGroundComments.length;
    if (nComments === 0) {
      return `No comments met the thresholds necessary to be considered as a point of common ground (at least ${this.input.minVoteCount} votes, and at least ${decimalToPercent(this.input.minCommonGroundProb)} agreement across groups).`;
    } else {
      const summary = this.model.generateText(
        getPrompt(
          nComments === 1 ? commonGroundSingleCommentInstructions : commonGroundInstructions,
          commonGroundComments.map((comment: Comment): string => comment.text),
          this.additionalContext
        )
      );
      return (await summary) + getCommentCitations(commonGroundComments);
    }
  }

  /**
   * Summarizes the comments on which there was the strongest disagreement between groups.
   * @returns a short paragraph describing the differences between groups, including comment citations.
   */
  async getDifferencesOfOpinionSummary(): Promise<string> {
    const topDisagreeCommentsAcrossGroups = this.input.getDifferencesBetweenGroupsComments();
    const nComments = topDisagreeCommentsAcrossGroups.length;
    if (nComments === 0) {
      return `No comments met the thresholds necessary to be considered as a significant difference of opinion (at least ${this.input.minVoteCount} votes, and more than ${decimalToPercent(this.input.minAgreeProbDifference)} difference in agreement rate between groups).`;
    } else {
      const summary = this.model.generateText(
        getPrompt(
          nComments === 1
            ? differencesOfOpinionSingleCommentInstructions
            : differencesOfOpinionInstructions,
          topDisagreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
          this.additionalContext
        )
      );
      return (await summary) + getCommentCitations(topDisagreeCommentsAcrossGroups);
    }
  }
}

/**
 * This TopicSummary subclass contains overrides for subtopics. At present, this is just an
 * override for the section title, but may evolve to different on other functionality.
 */
export class SubtopicSummary extends TopicSummary {
  override getSectionTitle(): string {
    return `#### ${this.topicStat.name} (${this.topicStat.commentCount} comments)`;
  }
}
