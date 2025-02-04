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

import { getPrompt } from "../../sensemaker_utils";
import { GroupStats, GroupedSummaryStats } from "../../stats_util";
import { RecursiveSummary, resolvePromisesInParallel } from "./recursive_summarization";
import { Comment } from "../../types";
import { commentCitationHtml, getCommentCitations } from "../utils/citation_utils";

/**
 * Format a list of strings to be a human readable list ending with "and"
 * @param items the strings to concatenate
 * @returns a string with the format "<item>, <item>, and <item>"
 */
function formatStringList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  const lastItem = items.pop(); // Remove the last item
  return `${items.join(", ")} and ${lastItem}`;
}

/**
 * A summary section that describes the groups in the data and the similarities/differences between
 * them.
 */
export class GroupsSummary extends RecursiveSummary<GroupedSummaryStats> {
  /**
   * Describes what makes the groups similar and different.
   * @returns a two sentence description of similarities and differences.
   */
  private async getGroupComparison(groupNames: string[]): Promise<string> {
    const topAgreeCommentsAcrossGroups = this.input.getCommonGroundComments();
    const groupComparisonSimilar = this.model.generateText(
      getPrompt(
        `Write one sentence describing the views of the ${groupNames.length} different opinion ` +
          "groups that had high inter group agreement on this subset of comments. Frame it in " +
          "terms of what the groups largely agree on.",
        topAgreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
        this.additionalContext
      )
    );

    const topDisagreeCommentsAcrossGroups = this.input.getDifferencesBetweenGroupsComments();
    const groupComparisonDifferent = this.model.generateText(
      getPrompt(
        "The following are comments that different groups had different opinions on. Write one sentence describing " +
          "what groups had different opinions on. Frame it in terms of what differs between the " +
          "groups. Do not suggest the groups agree on these issues. Include every comment in the summary.",
        topDisagreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
        this.additionalContext
      )
    );

    // Combine the descriptions and add the comments used for summarization as citations.
    return Promise.resolve(groupComparisonSimilar)
      .then((result: string) => {
        return result + getCommentCitations(topAgreeCommentsAcrossGroups);
      })
      .then(async (similarResult: string) => {
        const differentResult = await Promise.resolve(groupComparisonDifferent);
        return (
          similarResult +
          " " +
          differentResult +
          getCommentCitations(topDisagreeCommentsAcrossGroups)
        );
      });
  }

  /**
   * Returns a short description of all groups and a comparison of them.
   * @param groupNames the names of the groups to describe and compare
   * @returns text containing the description of each group and a compare and contrast section
   */
  private async getGroupDescriptions(groupNames: string[]): Promise<string> {
    const groupDescriptions = [];
    for (const groupName of groupNames) {
      const topCommentsForGroup = this.input.getGroupRepresentativeComments(groupName);
      groupDescriptions.push(
        this.model
          .generateText(
            getPrompt(
              `Write a two sentence summary of ${groupName}. Focus on the groups' expressed` +
                ` views and opinions as reflected in the comments and votes, without speculating ` +
                `about demographics. Avoid politically charged language (e.g., "conservative," ` +
                `"liberal", or "progressive"). Instead, describe the group based on their ` +
                `demonstrated preferences within the conversation.`,
              topCommentsForGroup.map((comment: Comment) => comment.text),
              this.additionalContext
            )
          )
          .then((result: string) => {
            return `__${groupName}__: ` + result + getCommentCitations(topCommentsForGroup) + "\n";
          })
      );
    }

    // Join the individual group descriptions whenever they finish, and when that's done wait for
    // the group comparison to be created and combine them all together.
    return resolvePromisesInParallel([
      ...groupDescriptions,
      this.getGroupComparison(groupNames),
    ]).then((results: string[]) => {
      return results.join("\n");
    });
  }

  /**
   * Summarize each comment as a separate bullet point.
   * @param comments the comments to summarize.
   * @returns the HTML elements for a bullet point list of summaries, includes citations.
   */
  private async getBulletPointSummary(comments: Comment[]): Promise<string> {
    return await resolvePromisesInParallel(
      comments.map(async (comment: Comment) => {
        return (
          "<li>" +
          (await this.model.generateText(
            getPrompt(
              "Write a bullet point length summary of the following comment. Do not format it like a bullet point.",
              [comment.text]
            )
          )) +
          commentCitationHtml(comment) +
          `</li>\n`
        );
      })
    ).then((results: string[]) => {
      return results.join(" ");
    });
  }

  async getSummary() {
    const groupStats = this.input.getStatsByGroup();
    const groupCount = groupStats.length;
    const groupNamesWithQuotes = groupStats.map((stat: GroupStats) => {
      return `"${stat.name}"`;
    });
    const groupNames = groupStats.map((stat: GroupStats) => {
      return stat.name;
    });

    const groupSectionIntro =
      `## Opinion Groups\n\n` +
      `${groupCount} distinct groups (named here as ${formatStringList(groupNamesWithQuotes)}) ` +
      `emerged with differing viewpoints in relation to the submitted comments. The groups are ` +
      `based on people who tend to vote more similarly to each other than to those outside the group. ` +
      "However there are points of common ground where the groups voted similarly.\n\n";
    const groupDescriptions = this.getGroupDescriptions(groupNames);

    const descriptionResult = await groupDescriptions;
    return groupSectionIntro + descriptionResult;
  }
}
