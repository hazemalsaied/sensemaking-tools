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

import { getPrompt, executeConcurrently } from "../../sensemaker_utils";
import { GroupStats, GroupedSummaryStats } from "../../stats/group_informed";
import { RecursiveSummary } from "./recursive_summarization";
import { Comment, SummaryContent } from "../../types";
import {
  loadGroupComparisonSimilarPrompt,
  loadGroupComparisonDifferentPrompt,
  loadGroupDescriptionPrompt
} from "../utils/template_loader";

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
  private getGroupComparison(groupNames: string[]): (() => Promise<SummaryContent>)[] {
    const topAgreeCommentsAcrossGroups = this.input.getCommonGroundComments();
    const groupComparisonSimilarPrompt = loadGroupComparisonSimilarPrompt(groupNames.length);
    const groupComparisonSimilar = this.model.generateText(

      getPrompt(
        groupComparisonSimilarPrompt,
        topAgreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
        this.additionalContext
      )
    );

    const topDisagreeCommentsAcrossGroups = this.input.getDifferenceOfOpinionComments();
    const groupComparisonDifferent = this.model.generateText(
      getPrompt(
        loadGroupComparisonDifferentPrompt(),
        topDisagreeCommentsAcrossGroups.map((comment: Comment) => comment.text),
        this.additionalContext
      )
    );

    // Combine the descriptions and add the comments used for summarization as citations.
    return [
      () =>
        groupComparisonSimilar.then((result: string) => {
          return {
            // Hack to force these two sections to be on a new line.
            title: "\n",
            text: result,
            citations: topAgreeCommentsAcrossGroups.map((comment) => comment.id),
          };
        }),
      () =>
        groupComparisonDifferent.then((result: string) => {
          return {
            text: result,
            citations: topDisagreeCommentsAcrossGroups.map((comment) => comment.id),
          };
        }),
    ];
  }

  /**
   * Returns a short description of all groups and a comparison of them.
   * @param groupNames the names of the groups to describe and compare
   * @returns text containing the description of each group and a compare and contrast section
   */
  private async getGroupDescriptions(groupNames: string[]): Promise<SummaryContent[]> {
    const groupDescriptions: (() => Promise<SummaryContent>)[] = [];
    for (const groupName of groupNames) {
      const topCommentsForGroup = this.input.getGroupRepresentativeComments(groupName);
      groupDescriptions.push(() =>
        this.model
          .generateText(
            getPrompt(
              loadGroupDescriptionPrompt(groupName),
              topCommentsForGroup.map((comment: Comment) => comment.text),
              this.additionalContext
            )
          )
          .then((result: string) => {
            return {
              title: `__${groupName}__: `,
              text: result,
              citations: topCommentsForGroup.map((comment) => comment.id),
            };
          })
      );
    }

    // Join the individual group descriptions whenever they finish, and when that's done wait for
    // the group comparison to be created and combine them all together.
    console.log(
      `Generating group DESCRIPTION, SIMILARITY and DIFFERENCE comparison for ${groupNames.length} groups`
    );
    return executeConcurrently([...groupDescriptions, ...this.getGroupComparison(groupNames)]);
  }

  async getSummary(): Promise<SummaryContent> {
    const groupStats = this.input.getStatsByGroup();
    const groupCount = groupStats.length;
    const groupNamesWithQuotes = groupStats.map((stat: GroupStats) => {
      return `"${stat.name}"`;
    });
    const groupNames = groupStats.map((stat: GroupStats) => {
      return stat.name;
    });

    const content: SummaryContent = {
      title: "## Opinion Groups",
      text:
        `${groupCount} distinct groups (named here as ${formatStringList(groupNamesWithQuotes)}) ` +
        `emerged with differing viewpoints in relation to the submitted statements. The groups are ` +
        `based on people who tend to vote more similarly to each other than to those outside the group. ` +
        "However there are points of common ground where the groups voted similarly.\n\n",
      subContents: await this.getGroupDescriptions(groupNames),
    };

    return content;
  }
}
