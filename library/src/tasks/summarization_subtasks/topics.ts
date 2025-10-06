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

import { RecursiveSummary } from "./recursive_summarization";
import { getMaxGroupAgreeProbDifference, getMinAgreeProb } from "../../stats/stats_util";
import {
  getPrompt,
  getAbstractPrompt,
  commentTableMarkdown,
  ColumnDefinition,
  executeConcurrently,
} from "../../sensemaker_utils";
import { Comment, SummaryContent, isCommentType } from "../../types";
import { Model } from "../../models/model";
import { SummaryStats, TopicStats } from "../../stats/summary_stats";
import { RelativeContext } from "./relative_context";
import {
  loadTopicsThemesPrompt,
  loadTopicsCommonGroundPrompt,
  loadTopicsCommonGroundSinglePrompt,
  loadTopicsDifferencesOpinionPrompt,
  loadTopicsDifferencesOpinionSinglePrompt,
  loadTopicsRecursiveSummaryPrompt,
} from "../utils/template_loader";

/**
 * This RecursiveSummary subclass constructs a top level "Topics" summary section,
 * calling out to the separate TopicSummary and SubtopicSummary classes to generate
 * content for individual subsections corresponding to specific topics and subtopics.
 */
export class AllTopicsSummary extends RecursiveSummary<SummaryStats> {
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
    const relativeContext = new RelativeContext(topicStats);
    const topicSummaries: (() => Promise<SummaryContent>)[] = topicStats.map(
      (topicStat) =>
        // Create a callback function for each summary and add it to the list, preparing them for parallel execution.
        () =>
          new TopicSummary(
            topicStat,
            this.model,
            relativeContext,
            this.additionalContext
          ).getSummary()
    );
    return {
      title: "## Topics",
      text: overviewText,
      subContents: await executeConcurrently(topicSummaries),
    };
  }
}

/**
 * This RecursiveSummary subclass generates summaries for individual topics.
 */
export class TopicSummary extends RecursiveSummary<SummaryStats> {
  // TopicSummary also needs to know about the topic, like name and subtopics
  topicStat: TopicStats;
  relativeContext: RelativeContext;

  // This override is necessary to pass through a TopicStat object, rather than a SummaryStats object
  constructor(
    topicStat: TopicStats,
    model: Model,
    relativeContext: RelativeContext,
    additionalContext?: string
  ) {
    super(topicStat.summaryStats, model, additionalContext);
    this.topicStat = topicStat;
    this.relativeContext = relativeContext;
  }

  async getSummary(): Promise<SummaryContent> {
    const nSubtopics: number = this.topicStat.subtopicStats?.length || 0;
    if (nSubtopics == 0) {
      return this.getCommentSummary();
    } else {
      return this.getAllSubTopicSummaries();
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
  async getAllSubTopicSummaries(): Promise<SummaryContent> {
    // Create subtopic summaries for all subtopics with > 1 statement.
    const subtopicSummaries: (() => Promise<SummaryContent>)[] = (
      this.topicStat.subtopicStats || []
    )
      .filter((subtopicStat) => subtopicStat.commentCount > 1)
      .map(
        // Create a callback function for each summary and add it to the list, preparing them for parallel execution.
        (subtopicStat) => () =>
          new SubtopicSummary(
            subtopicStat,
            this.model,
            this.relativeContext,
            this.additionalContext
          ).getSummary()
      );

    const subtopicSummaryContents = await executeConcurrently(subtopicSummaries);

    const nSubtopics: number = subtopicSummaries.length;
    let topicSummary = "";
    if (nSubtopics > 0) {
      topicSummary =
        `This topic included ${nSubtopics} subtopic${nSubtopics === 1 ? "" : "s"}, comprising a ` +
        `total of ${this.topicStat.commentCount} statement${this.topicStat.commentCount === 1 ? "" : "s"}.`;
      const subtopicSummaryPrompt = getAbstractPrompt(
        loadTopicsRecursiveSummaryPrompt(this.topicStat.name),
        subtopicSummaryContents,
        (summary: SummaryContent) =>
          `<subtopicSummary>\n` +
          `    <title>${summary.title}</title>\n` +
          `    <text>\n${summary.subContents?.map((s) => s.title + s.text).join("\n\n")}\n` +
          `    </text>\n  </subtopicSummary>`,
        this.additionalContext
      );
      console.log(`Generating TOPIC SUMMARY for: "${this.topicStat.name}"`);
      subtopicSummaryContents.unshift({
        type: "TopicSummary",
        text: await this.model.generateText(subtopicSummaryPrompt),
      });
    }

    return {
      title: this.getSectionTitle(),
      text: topicSummary,
      subContents: subtopicSummaryContents,
    };
  }

  /**
   * Summarizes the comments associated with the given topic
   * @returns a promise of the summary string
   */
  async getCommentSummary(): Promise<SummaryContent> {
    const relativeAgreement = this.relativeContext.getRelativeAgreement(
      this.topicStat.summaryStats
    );
    const agreementDescription = `This subtopic had ${relativeAgreement} compared to the other subtopics.`;
    const subContents = [await this.getThemesSummary()];
    // check env variable to decide whether to compute common ground and difference of opinion summaries
    if (process.env["SKIP_COMMON_GROUND_AND_DIFFERENCES_OF_OPINION"] !== "true") {
      // const commonGroundSummary = await this.getCommonGroundSummary(this.topicStat.name);
      // const differencesOfOpinionSummary = await this.getDifferencesOfOpinionSummary(
      //   commonGroundSummary,
      //   this.topicStat.name
      // );
      // subContents.push(commonGroundSummary, differencesOfOpinionSummary);
    }

    if (process.env["DEBUG_MODE"] === "true") {
      // Based on the common ground and differences of opinion comments,
      // TODO: Should also include common ground disagree comments (aka what everyone agrees they
      // don't like)
      // const commonGroundComments = this.input.getCommonGroundAgreeComments();
      // const differencesComments = this.input.getDifferenceOfOpinionComments();

      // Figure out what comments aren't currently being summarized
      // const allSummarizedCommentIds = new Set([
      //   // ...commonGroundComments.map((c) => c.id),
      //   // ...differencesComments.map((c) => c.id),
      // ]);
      // const otherComments = this.topicStat.summaryStats.comments.filter(
      //   // (comment) => !allSummarizedCommentIds.has(comment.id)
      // );

      // const otherCommentsTable = commentTableMarkdown(otherComments, [
      //   { columnName: "minAgreeProb", getValue: getMinAgreeProb } as ColumnDefinition,
      //   {
      //     columnName: "maxAgreeDiff",
      //     getValue: getMaxGroupAgreeProbDifference,
      //   } as ColumnDefinition,
      // ]);

      // const otherCommentsSummary = {
      //   title: `**Other statements** (${otherComments.length} statements`,
      //   text: otherCommentsTable,
      // };
      // subContents.push(otherCommentsSummary);
    }

    return {
      title: this.getSectionTitle(),
      text: agreementDescription,
      subContents: subContents,
    };
  }

  /**
   * Summarizes the themes that recur across all comments
   * @returns a single sentence describing the themes, without citations.
   */
  async getThemesSummary(): Promise<SummaryContent> {
    const allComments = this.input.comments;
    // TODO: add some edge case handling in case there is only 1 comment, etc
    console.log(`Generating PROMINENT THEMES for subtopic: "${this.topicStat.name}"`);
    const text = await this.model.generateText(
      getPrompt(
        loadTopicsThemesPrompt(this.topicStat.name),
        allComments.map((comment: Comment): string => comment.text),
        this.additionalContext
      )
    );
    return {
      title: "Prominent themes were: ",
      text: text,
    };
  }

  /**
   * Summarizes the comments on which there was the strongest agreement.
   * @returns a short paragraph describing the similarities, including comment citations.
   */
  async getCommonGroundSummary(topic: string): Promise<SummaryContent> {
    // TODO: Should also include common ground disagree comments (aka what everyone agrees they
    // don't like)
    const commonGroundComments = this.input.getCommonGroundAgreeComments();
    const nComments = commonGroundComments.length;
    let text = "";
    if (nComments === 0) {
      text = this.input.getCommonGroundNoCommentsMessage();
    } else {
      console.log(`Generating COMMON GROUND for "${topic}"`);
      const summary = this.model.generateText(
        getPrompt(
          nComments === 1
            ? loadTopicsCommonGroundSinglePrompt(this.input.groupBasedSummarization)
            : loadTopicsCommonGroundPrompt(this.input.groupBasedSummarization),
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
  async getDifferencesOfOpinionSummary(
    commonGroundSummary: SummaryContent,
    topic: string
  ): Promise<SummaryContent> {
    const topDisagreeCommentsAcrossGroups = this.input.getDifferenceOfOpinionComments();
    const nComments = topDisagreeCommentsAcrossGroups.length;
    let text = "";
    if (nComments === 0) {
      text = this.input.getDifferencesOfOpinionNoCommentsMessage();
    } else {
      const prompt = getAbstractPrompt(
        nComments === 1
          ? loadTopicsDifferencesOpinionSinglePrompt(this.input.groupBasedSummarization)
          : loadTopicsDifferencesOpinionPrompt(),
        [commonGroundSummary].concat(topDisagreeCommentsAcrossGroups),
        formatDifferenceOfOpinionData,
        this.additionalContext
      );
      console.log(`Generating DIFFERENCES OF OPINION for "${topic}"`);
      const summary = this.model.generateText(prompt);
      text = await summary;
    }
    const resp = {
      title: "Differences of opinion: ",
      text: text,
      citations: topDisagreeCommentsAcrossGroups.map((comment) => comment.id),
    };

    // Since common ground is part of the summary, include its citations for evaluation
    if (commonGroundSummary.citations) {
      resp.citations = resp.citations.concat(commonGroundSummary.citations);
    }
    return resp;
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

function formatDifferenceOfOpinionData(datum: SummaryContent | Comment) {
  // Warning: `Comment` and `SummaryContent` types are very similar, and comments actually pass
  // the `isSummaryContent` typecheck function. We are checking for isCommentType
  // first because comments _must_ have `id` fields, so the code below works.
  // However, if for some reason `SummaryContent` ended up getting an `id` field, this would no
  // longer work. There does not seem to be a simple way around this though because of the
  // differences between types and interfaces in typescript.
  // TODO: Add some testing of this in case there's ever a regression, or write with a more
  // custom prompt construction function.
  if (isCommentType(datum)) {
    return `<comment>${datum.text}</comment>`;
  } else {
    return (
      `<commonGroundSummary>\n` +
      `    <text>\n${datum.text}` +
      `    </text>\n  </commonGroundSummary>`
    );
  }
}
