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
import { Comment, CommentWithVoteTallies } from "../types";
import { getTotalAgreeProbability, getTotalDisagreeProbability, getTotalPassProbability } from "./stats_util";
import { SummaryStats } from "./summary_stats";

// Stats basis for the summary that is based on majority vote algorithms. Does not use groups.

export class MajoritySummaryStats extends SummaryStats {
  minAgreeProb = 0.7;
  groupBasedSummarization = false;
  /**
   * An override of the SummaryStats static factory method,
   * to allow for MajoritySummaryStats specific initialization.
   */
  static override create(comments: Comment[]): MajoritySummaryStats {
    return new MajoritySummaryStats(comments);
  }

  /**
   * Returns the top k comments according to the given metric.
   */
  override topK(
    sortBy: (comment: CommentWithVoteTallies) => number,
    k: number = this.maxSampleSize,
    filterFn: (comment: CommentWithVoteTallies) => boolean = () => true
  ): Comment[] {
    return this.filteredComments
      .filter(filterFn)
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, k);
  }

  /**
   * Gets the topK agreed upon comments based on highest % of agree votes.
   *
   * @param k the number of comments to get
   * @returns the top agreed on comments
   */
  getCommonGroundComments(k: number = this.maxSampleSize) {
    return this.topK(
      (comment) => getTotalAgreeProbability(comment.voteTalliesByGroup),
      k,
      // Before getting the top agreed comments, enforce a minimum level of agreement
      (comment: CommentWithVoteTallies) =>
        getTotalAgreeProbability(comment.voteTalliesByGroup) >= this.minAgreeProb
    );
  }

  getCommonGroundErrorMessage(): string {
    return (
      `No statements met the thresholds necessary to be considered as a point of common ` +
      `ground (at least ${this.minVoteCount} votes, and at least ` +
      `${decimalToPercent(this.minAgreeProb)} agreement).`
    );
  }

  /**
   * Gets the topK agreed upon comments based on highest % of agree votes.
   *
   * @param k the number of comments to get
   * @returns the top differences of opinion comments
   */
  getDifferenceOfOpinionComments(k: number = this.maxSampleSize) {
    return this.topK(
      // Rank comments with the same agree and disagree rates the most highly and prefer when these
      // values are higher. So the best score would be when both the agree rate and the disagree
      // rate are 0.5.
      (comment) =>
        1 -
        Math.abs(
          getTotalAgreeProbability(comment.voteTalliesByGroup) -
            getTotalDisagreeProbability(comment.voteTalliesByGroup)
        ) -
        getTotalPassProbability(comment.voteTalliesByGroup),
      k,
      // Before getting the top differences comments, enforce a minimum level of difference of
      // opinion.
      (comment: CommentWithVoteTallies) =>
        getTotalAgreeProbability(comment.voteTalliesByGroup) <= this.minAgreeProb &&
        getTotalDisagreeProbability(comment.voteTalliesByGroup) <= this.minAgreeProb
    );
  }

  getDifferencesOfOpinionErrorMessage(): string {
    const threshold = decimalToPercent(this.minAgreeProbDifference);
    return (
      `No statements met the thresholds necessary to be considered as a significant ` +
      `difference of opinion (at least ${this.minVoteCount} votes, and less than ` +
      `${threshold} agreement rate and disagree rate).`
    );
  }
}
