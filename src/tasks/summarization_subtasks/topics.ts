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
import { getPrompt, commentTableMarkdown, ColumnDefinition } from "../../sensemaker_utils";
import { getMaxGroupAgreeProbDifference, getMinAgreeProb } from "../../stats/stats_util";
import { Comment, SummaryContent } from "../../types";
import { Model } from "../../models/model";
import { SummaryStats, TopicStats } from "../../stats/summary_stats";

const COMMON_INSTRUCTIONS =
  "Do not use the passive voice. Do not use ambiguous pronouns. Be clear. " +
  "Do not generate bullet points or special formatting. Do not yap.";
const GROUP_SPECIFIC_INSTRUCTIONS =
  `Participants in this conversation have been clustered into opinion groups. ` +
  `These opinion groups mostly approve of these comments. `;

function getCommonGroundInstructions(containsGroups: boolean): string {
  const groupSpecificText = containsGroups ? GROUP_SPECIFIC_INSTRUCTIONS : "";
  return (
    `Here are several comments sharing different opinions. Your job is to summarize these ` +
    `comments. Do not pretend that you hold any of these opinions. You are not a participant in ` +
    `this discussion. ${groupSpecificText}Write a concise summary of these ` +
    `comments that is at least one sentence and at most three sentences long. The summary should ` +
    `be substantiated, detailed and informative: include specific findings, requests, proposals, ` +
    `action items and examples, grounded in the comments. Refer to the people who made these ` +
    `comments as participants, not commenters. Do not talk about how strongly they approve of ` +
    `these comments. Use complete sentences. ${COMMON_INSTRUCTIONS}`
  );
}

function getCommonGroundSingleCommentInstructions(containsGroups: boolean): string {
  const groupSpecificText = containsGroups ? GROUP_SPECIFIC_INSTRUCTIONS : "";
  return (
    `Here is a comment presenting an opinion from a discussion. Your job is to rewrite this ` +
    `comment clearly without embellishment. Do not pretend that you hold this opinion. You are not` +
    ` a participant in this discussion. ${groupSpecificText}Refer to the people who ` +
    `made these comments as participants, not commenters. Do not talk about how strongly they ` +
    `approve of these comments. Write a complete sentence. ${COMMON_INSTRUCTIONS}`
  );
}

// TODO: Test whether conditionally including group specific text in this prompt improves
// performance.
const DIFFERENCES_OF_OPINION_INSTRUCTIONS =
  `Here are several comments which generated disagreement. Your job is summarize the ideas ` +
  `contained in the comments. Do not pretend that you hold any of these opinions. You are not a ` +
  `participant in this discussion. Write a concise summary of these comments that is at least ` +
  `one sentence and at most three sentences long. Refer to the people who made these comments as` +
  ` participants, not commenters.  Do not talk about how strongly they disagree on these ` +
  `comments. Use complete sentences. ${COMMON_INSTRUCTIONS}

Do not pretend that these comments were written by different participants. These comments may ` +
  `all be from the same participant, so do not say some participants prosed one things while other` +
  ` participants proposed another.  Do not say "Some participants proposed X while others Y".  ` +
  `Instead say "One statement proposed X while another Y"

Your output should begin in the form "There was low consensus". For each sentence use a unique ` +
  `phrase to indicate that there was low consensus on the topic.`;

function getDifferencesOfOpinionSingleCommentInstructions(containsGroups: boolean): string {
  const groupSpecificText = containsGroups
    ? `Participants in this conversation have been clustered ` +
      `into opinion groups. There were very different levels of agreement between the two opinion ` +
      `groups regarding this comment. `
    : "";
  return (
    `Here is a comment presenting an opinion from a discussion. Your job is to rewrite this ` +
    `comment clearly without embellishment. Do not pretend that you hold this opinion. You are ` +
    `not a participant in this discussion. ${groupSpecificText}Refer to the people who made these comments as participants, ` +
    `not commenters. Do not talk about how strongly they approve of these comments. Write a ` +
    `complete sentence. Do not use the passive voice. Do not use ambiguous pronouns. Be clear. Do ` +
    `not generate bullet points or special formatting. Do not yap.`
  );
}

/**
 * This RecursiveSummary subclass constructs a top level "Topics" summary section,
 * calling out to the separate TopicSummary and SubtopicSummary classes to generate
 * content for individual subsections corresponding to specific topics and subtopics.
 */
export class TopicsSummary extends RecursiveSummary<SummaryStats> {
  async getSummary(): Promise<SummaryContent> {
    // First construct the introductory description for the entire section
    const topicStats: TopicStats[] = this.input.getStatsByTopic();
    const nTopics: number = topicStats.length;
    const nSubtopics: number = topicStats
      .map((t) => t.subtopicStats?.length || 0)
      .reduce((n, m) => n + m, 0);
    const hasSubtopics: boolean = nSubtopics > 0;
    const subtopicsCountText: string = hasSubtopics ? `, as well as ${nSubtopics} subtopics` : "";
    const usesGroups = topicStats.some((t) => t.summaryStats.groupBasedSummarization);
    const overviewText: string =
      `From the statements submitted, ${nTopics} high level topics were identified` +
      `${subtopicsCountText}. Based on voting patterns` +
      `${usesGroups ? " between the opinion groups described above," : ""} both points of common ` +
      `ground as well as differences of opinion ${usesGroups ? "between the groups " : ""}` +
      `have been identified and are described below.\n`;

    // Now construct the individual Topic summaries
    const topicSummaries: Array<Promise<SummaryContent>> = topicStats.map((topicStat) =>
      new TopicSummary(topicStat, this.model, this.additionalContext).getSummary()
    );
    return {
      title: "## Topics",
      text: overviewText,
      subContents: await resolvePromisesInParallel(topicSummaries),
    };
  }
}

/**
 * This RecursiveSummary subclass generates summaries for individual topics.
 */
export class TopicSummary extends RecursiveSummary<SummaryStats> {
  // TopicSummary also needs to know about the topic, like name and subtopics
  topicStat: TopicStats;

  // This override is necessary to pass through a TopicStat object, rather than a SummaryStats object
  constructor(topicStat: TopicStats, model: Model, additionalContext?: string) {
    super(topicStat.summaryStats, model, additionalContext);
    this.topicStat = topicStat;
  }

  async getSummary(): Promise<SummaryContent> {
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
    return `### ${this.topicStat.name} (${this.topicStat.commentCount} statements)`;
  }

  /**
   * When subtopics are present, compiles the individual summaries for those subtopics
   * @returns a promise of the summary string
   */
  async getSubtopicsSummary(): Promise<SummaryContent> {
    const subtopicSummaries: Array<Promise<SummaryContent>> =
      this.topicStat.subtopicStats?.map((subtopicStat) =>
        new SubtopicSummary(subtopicStat, this.model, this.additionalContext).getSummary()
      ) || [];

    // This is just a stub for now, and may eventually be added on to include more naunced descriptions of e.g. where the highest
    // points of common ground and most significant differences of opinion were across the subtopics.
    const nSubtopics: number = this.topicStat.subtopicStats?.length || 0;
    const topicSummary =
      nSubtopics > 0
        ? `This topic included ${nSubtopics} subtopic${nSubtopics === 1 ? "" : "s"}.\n`
        : "";

    return {
      title: this.getSectionTitle(),
      text: topicSummary,
      subContents: await resolvePromisesInParallel(subtopicSummaries),
    };
  }

  /**
   * Summarizes the comments associated with the given topic
   * @returns a promise of the summary string
   */
  async getCommentSummary(): Promise<SummaryContent> {
    const result: SummaryContent = {
      title: this.getSectionTitle(),
      text: "",
      subContents: [
        await this.getCommonGroundSummary(),
        await this.getDifferencesOfOpinionSummary(),
      ],
    };

    if (process.env["DEBUG_MODE"] === "true") {
      // Based on the common ground and differences of opinion comments,
      const commonGroundComments = this.input.getCommonGroundComments();
      const differencesComments = this.input.getDifferenceOfOpinionComments();

      // Figure out what comments aren't currently being summarized
      const allSummarizedCommentIds = new Set([
        ...commonGroundComments.map((c) => c.id),
        ...differencesComments.map((c) => c.id),
      ]);
      const otherComments = this.topicStat.summaryStats.comments.filter(
        (comment) => !allSummarizedCommentIds.has(comment.id)
      );

      const otherCommentsTable = commentTableMarkdown(otherComments, [
        { columnName: "minAgreeProb", getValue: getMinAgreeProb } as ColumnDefinition,
        {
          columnName: "maxAgreeDiff",
          getValue: getMaxGroupAgreeProbDifference,
        } as ColumnDefinition,
      ]);

      const otherCommentsSummary = {
        title: `**Other statements** (${otherComments.length} statements`,
        text: otherCommentsTable,
      };
      result.subContents?.push(otherCommentsSummary);
    }

    return Promise.resolve(result);
  }

  /**
   * Summarizes the comments on which there was the strongest agreement.
   * @returns a short paragraph describing the similarities, including comment citations.
   */
  async getCommonGroundSummary(): Promise<SummaryContent> {
    const commonGroundComments = this.input.getCommonGroundComments();
    const nComments = commonGroundComments.length;
    let text = "";
    if (nComments === 0) {
      text = this.input.getCommonGroundNoCommentsMessage();
    } else {
      const summary = this.model.generateText(
        getPrompt(
          nComments === 1
            ? getCommonGroundSingleCommentInstructions(this.input.groupBasedSummarization)
            : getCommonGroundInstructions(this.input.groupBasedSummarization),
          commonGroundComments.map((comment: Comment): string => comment.text),
          this.additionalContext
        )
      );
      text = await summary;
    }
    return {
      title: this.input.groupBasedSummarization
        ? "Common ground between groups: "
        : "Common ground: ",
      text: text,
      citations: commonGroundComments.map((comment) => comment.id),
    };
  }

  /**
   * Summarizes the comments on which there was the strongest disagreement.
   * @returns a short paragraph describing the differences, including comment citations.
   */
  async getDifferencesOfOpinionSummary(): Promise<SummaryContent> {
    const topDisagreeCommentsAcrossGroups = this.input.getDifferenceOfOpinionComments();
    const nComments = topDisagreeCommentsAcrossGroups.length;
    let text = "";
    if (nComments === 0) {
      text = this.input.getDifferencesOfOpinionNoCommentsMessage();
    } else {
      const summary = this.model.generateText(
        getPrompt(
          nComments === 1
            ? getDifferencesOfOpinionSingleCommentInstructions(this.input.groupBasedSummarization)
            : DIFFERENCES_OF_OPINION_INSTRUCTIONS,
          topDisagreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
          this.additionalContext
        )
      );
      text = await summary;
    }
    return {
      title: "Differences of opinion: ",
      text: text,
      citations: topDisagreeCommentsAcrossGroups.map((comment) => comment.id),
    };
  }
}

/**
 * This TopicSummary subclass contains overrides for subtopics. At present, this is just an
 * override for the section title, but may evolve to different on other functionality.
 */
export class SubtopicSummary extends TopicSummary {
  override getSectionTitle(): string {
    return `#### ${this.topicStat.name} (${this.topicStat.commentCount} statements)`;
  }
}
