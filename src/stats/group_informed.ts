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

import { decimalToPercent } from "../sensemaker_utils";
import { Comment, CommentWithVoteInfo, GroupVoteTallies, isGroupVoteTalliesType } from "../types";
import {
  getGroupAgreeProbDifference,
  getGroupInformedConsensus,
  getGroupInformedDisagreeConsensus,
  getMaxGroupAgreeProbDifference,
  getMinAgreeProb,
  getMinDisagreeProb,
} from "./stats_util";
import { SummaryStats } from "./summary_stats";

// Stats basis for summary that uses groups and group informed consensus based algorithms.

/**
 * This child class of the SummaryStats class provides the same abstract purpose
 * (that is, serving as the interface to the RecursiveSummary abstraction),
 * but is specifically tailored to group based summarization.
 */
export class GroupedSummaryStats extends SummaryStats {
  /**
   * An override of the SummaryStats static factory method,
   * to allow for GroupedSummaryStats specific initialization.
   */
  static override create(comments: Comment[]): GroupedSummaryStats {
    return new GroupedSummaryStats(comments);
  }

  /**
   * Returns the top k comments according to the given metric.
   */
  override topK(
    sortBy: (comment: CommentWithVoteInfo) => number,
    k: number = this.maxSampleSize,
    filterFn: (comment: CommentWithVoteInfo) => boolean = () => true
  ): Comment[] {
    return this.filteredComments
      .filter(filterFn)
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, k);
  }

  /**
   * Gets the topK agreed upon comments across all groups.
   *
   * This is measured via the getGroupInformedConsensus metric, subject to the constraints of
   * this.minVoteCount and this.minAgreeProbCommonGround settings.
   * @param k dfaults to this.maxSampleSize
   * @returns the top agreed on comments
   */
  getCommonGroundComments(k: number = this.maxSampleSize) {
    return this.topK(
      (comment) => getGroupInformedConsensus(comment),
      k,
      // Before using Group Informed Consensus a minimum bar of agreement between groups is enforced
      (comment: CommentWithVoteInfo) => getMinAgreeProb(comment) >= this.minCommonGroundProb
    );
  }

  getCommonGroundNoCommentsMessage(): string {
    return (
      `No statements met the thresholds necessary to be considered as a point of common ` +
      `ground (at least ${this.minVoteCount} votes, and at least ` +
      `${decimalToPercent(this.minCommonGroundProb)} agreement across groups).`
    );
  }

  /**
   * Gets the topK disagreed upon comments across all groups.
   *
   * This is measured via the getGroupInformedDisagreeConsensus metric, subject to the constraints of
   * this.minVoteCount and this.minAgreeProbCommonGround settings.
   * @param k dfaults to this.maxSampleSize
   * @returns the top disagreed on comments
   */
  getCommonGroundDisagreeComments(k: number = this.maxSampleSize) {
    return this.topK(
      (comment) => getGroupInformedDisagreeConsensus(comment),
      k,
      // Before using Group Informed Consensus a minimum bar of agreement between groups is enforced
      (comment: CommentWithVoteInfo) => getMinDisagreeProb(comment) >= this.minCommonGroundProb
    );
  }

  /**
   * Sort through the comments with the highest getGroupAgreeDifference for the corresponding group,
   * subject to this.minVoteCount, not matching the common ground comment set by this.minAgreeProbCommonGround,
   * and this.minAgreeProbDifference
   * @param group The name of a single group
   * @param k dfaults to this.maxSampleSize
   * @returns The corresponding set of comments
   */
  getGroupRepresentativeComments(group: string, k: number = this.maxSampleSize): Comment[] {
    return this.topK(
      (comment: CommentWithVoteInfo) => getGroupAgreeProbDifference(comment, group),
      k,
      (comment: CommentWithVoteInfo) =>
        getMinAgreeProb(comment) < this.minCommonGroundProb &&
        getGroupAgreeProbDifference(comment, group) > this.minAgreeProbDifference
    );
  }

  /**
   * Returns the top K comments that best distinguish differences of opinion between groups.
   *
   * This is computed as the difference in how likely each group is to agree with a given comment
   * as compared with the rest of the participant body, as computed by the getGroupAgreeDifference method,
   * and subject to this.minVoteCount, this.minAgreeProbCommonGround and this.minAgreeProbDifference.
   *
   * @param k the number of comments to find, this is a maximum and is not guaranteed
   * @returns the top disagreed on comments
   */
  getDifferenceOfOpinionComments(k: number = this.maxSampleSize): Comment[] {
    return this.topK(
      // Get the maximum absolute group agree difference for any group.
      getMaxGroupAgreeProbDifference,
      k,
      (comment: CommentWithVoteInfo) =>
        // Some group must agree with the comment less than the minAgreeProbCommonGround
        // threshold, so that this comment doesn't also qualify as a common ground comment.
        getMinAgreeProb(comment) < this.minCommonGroundProb &&
        // Some group must disagree with the rest by a margin larger than the
        // getGroupAgreeProbDifference.
        getMaxGroupAgreeProbDifference(comment) < this.minAgreeProbDifference
    );
  }

  getDifferencesOfOpinionNoCommentsMessage(): string {
    return (
      `No statements met the thresholds necessary to be considered as a significant ` +
      `difference of opinion (at least ${this.minVoteCount} votes, and more than ` +
      `${decimalToPercent(this.minAgreeProbDifference)} difference in agreement rate between groups).`
    );
  }

  getStatsByGroup(): GroupStats[] {
    const groupNameToStats: { [key: string]: GroupStats } = {};
    for (const comment of this.comments) {
      // Check that the voteInfo contains group data and update the type.
      isGroupVoteTalliesType(comment.voteInfo);
      const voteInfo = comment.voteInfo as GroupVoteTallies;
      for (const groupName in voteInfo) {
        const commentVoteCount = voteInfo[groupName].totalCount;
        if (groupName in groupNameToStats) {
          groupNameToStats[groupName].voteCount += commentVoteCount;
        } else {
          groupNameToStats[groupName] = { name: groupName, voteCount: commentVoteCount };
        }
      }
    }
    return Object.values(groupNameToStats);
  }
}

/**
 * Represents statistics about a group.
 */
export interface GroupStats {
  name: string;
  voteCount: number;
}
