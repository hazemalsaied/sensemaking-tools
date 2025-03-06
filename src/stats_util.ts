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

// Utils to get statistical information from a conversation

import { Comment, CommentWithVoteTallies, isCommentWithVoteTalliesType, VoteTally } from "./types";
import { groupCommentsBySubtopic } from "./sensemaker_utils";

/**
 * Compute the MAP probability estimate of an aggree vote for a given vote tally entry.
 */
export function getAgreeProbability(voteTally: VoteTally): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (voteTally.agreeCount + 1) / (totalCount + 2);
}

/**
 * Computes group informed (agree) consensus for a comment's vote tallies,
 * computed as the product of the aggree probabilities across groups.
 */
export function getGroupInformedConsensus(comment: CommentWithVoteTallies): number {
  return Object.values(comment.voteTalliesByGroup).reduce(
    (product, voteTally) => product * getAgreeProbability(voteTally),
    1
  );
}

/**
 * A function which returns the minimum aggree probability across groups
 */
export function getMinAgreeProb(comment: CommentWithVoteTallies): number {
  return Math.min(...Object.values(comment.voteTalliesByGroup).map(getAgreeProbability));
}

/**
 * Compute the MAP probability estimate of a disaggree vote for a given vote tally entry.
 */
export function getDisagreeProbability(voteTally: VoteTally): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (voteTally.disagreeCount + 1) / (totalCount + 2);
}

/**
 * Computes group informed (disagree) consensus for a comment's vote tallies
 * computed as the product of disaggree probabilities across groups.
 */
export function getGroupInformedDisagreeConsensus(comment: CommentWithVoteTallies): number {
  return Object.values(comment.voteTalliesByGroup).reduce(
    (product, voteTally) => product * getDisagreeProbability(voteTally),
    1
  );
}

/**
 * A function which returns the minimum disagree probability across groups
 */
export function getMinDisagreeProb(comment: CommentWithVoteTallies): number {
  return Math.min(...Object.values(comment.voteTalliesByGroup).map(getDisagreeProbability));
}

/**
 * Computes the difference between the MAP probability estimate of agreeing within
 * a given group as compared with the rest of the conversation.
 * @param comment A comment with vote tally data, broken down by opinion group
 * @returns the numeric difference in estimated agree probabilities
 */
export function getGroupAgreeProbDifference(
  comment: CommentWithVoteTallies,
  group: string
): number {
  const groupAgreeProb = getAgreeProbability(comment.voteTalliesByGroup[group]);
  // compute the vote tally for the remainder of the conversation by reducing over and adding up all other group vote tallies
  const otherGroupsVoteTally = Object.entries(comment.voteTalliesByGroup)
    .filter(([g]) => g !== group)
    // build up the new VoteTally object as a reduction of the vote counts for the remaining groups
    .map(([_, voteTally]) => voteTally) // eslint-disable-line @typescript-eslint/no-unused-vars
    .reduce(
      (acc: VoteTally, voteTally: VoteTally): VoteTally => {
        return {
          agreeCount: acc.agreeCount + voteTally.agreeCount,
          disagreeCount: acc.disagreeCount + voteTally.disagreeCount,
          passCount: (acc.passCount || 0) + (voteTally.passCount || 0),
          totalCount: acc.totalCount + voteTally.totalCount,
        };
      },
      { agreeCount: 0, disagreeCount: 0, passCount: 0, totalCount: 0 }
    );
  const otherGroupsAgreeProb = getAgreeProbability(otherGroupsVoteTally);
  return groupAgreeProb - otherGroupsAgreeProb;
}

/**
 * Computes the maximal absolute value of `getGroupAgreeProbDifference` across
 * opinion groups present in comment.groupVoteTallies.
 * @param comment A Comment with vote tally data, broken down by opinion group
 * @returns the maximal difference in estimated agree probabilities
 */
export function getMaxGroupAgreeProbDifference(comment: CommentWithVoteTallies) {
  const groupNames = Object.keys(comment.voteTalliesByGroup);
  return Math.max(
    ...groupNames.map((name: string) => {
      return Math.abs(getGroupAgreeProbDifference(comment, name));
    })
  );
}

/**
 * Computes the total vote count across opinion groups. Note that this
 * consequently doesn't include any votes for participants not represented
 * in the opinion groups.
 * @param comment A Comment with vote tally data, broken down by opinion group
 * @returns the total number of votes
 */
export function getCommentVoteCount(comment: Comment): number {
  let count = 0;
  for (const groupName in comment.voteTalliesByGroup) {
    const groupCount = comment.voteTalliesByGroup[groupName].totalCount;
    if (groupCount > 0) {
      count += groupCount;
    }
  }
  return count;
}

/**
 * This class is the input interface for the RecursiveSummary abstraction, and
 * therefore the vessel through which all data is ultimately communicated to
 * the individual summarization routines.
 */
export abstract class SummaryStats {
  comments: Comment[];
  minCommonGroundProb = 0.6;
  minAgreeProbDifference = 0.3;
  maxSampleSize = 5;
  public minVoteCount = 20;

  constructor(comments: Comment[]) {
    this.comments = comments;
  }

  /**
   * A static factory method that creates a new instance of SummaryStats
   * or a subclass. This is meant to be overriden by subclasses.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static create(comments: Comment[]): SummaryStats {
    throw new Error("Cannot instantiate abstract class SummaryStats");
  }

  /**
   * Based on how the implementing class defines it, get the top agreed on comments.
   * @param k the number of comments to return
   */
  abstract getCommonGroundComments(k?: number): Comment[];

  /**
   * Based on how the implementing class defines it, get the top disagreed on comments.
   * @param k the number of comments to return.
   */
  abstract getDifferenceOfOpinionComments(k?: number): Comment[];

  // The total number of votes across the entire set of input comments
  get voteCount(): number {
    return this.comments.reduce((sum: number, comment: Comment) => {
      return sum + getCommentVoteCount(comment);
    }, 0);
  }

  // The total number of comments in the set of input comments
  get commentCount(): number {
    return this.comments.length;
  }

  get containsSubtopics(): boolean {
    for (const comment of this.comments) {
      if (comment.topics) {
        for (const topic of comment.topics) {
          // Check if the topic matches the 'NestedTopic' type
          if ("subtopics" in topic && Array.isArray(topic.subtopics)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns the top k comments according to the given metric. K defaults to 12.
   */
  topK(
    sortBy: (comment: Comment) => number,
    k: number = this.maxSampleSize,
    filterFn: (comment: Comment) => boolean = () => true
  ): Comment[] {
    return this.comments
      .filter(filterFn)
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, k);
  }

  /**
   * Sorts topics and their subtopics based on comment count in descending order, with
   * "Other" topics and subtopics going last.
   *
   * @param commentsByTopic A nested map where keys are topic names, values are maps
   *                        where keys are subtopic names, and values are maps where
   *                        keys are comment IDs and values are comment texts.
   * @returns A list of TopicStats objects sorted by comment count with "Other" topics last.
   */
  getStatsByTopic(): TopicStats[] {
    const commentsByTopic = groupCommentsBySubtopic(this.comments);
    const topicStats: TopicStats[] = [];

    for (const topicName in commentsByTopic) {
      const subtopics = commentsByTopic[topicName];
      const subtopicStats: TopicStats[] = [];
      let totalTopicComments: number = 0;
      const topicComments: Comment[] = [];

      for (const subtopicName in subtopics) {
        // get corresonding comments, and update counts
        const comments: Comment[] = Object.values(subtopics[subtopicName]);
        const commentCount = comments.length;
        totalTopicComments += commentCount;
        // aggregate comment objects
        topicComments.push(...comments);
        subtopicStats.push({
          name: subtopicName,
          commentCount,
          summaryStats: (this.constructor as typeof SummaryStats).create(comments),
        });
      }

      topicStats.push({
        name: topicName,
        commentCount: totalTopicComments,
        subtopicStats: subtopicStats,
        summaryStats: (this.constructor as typeof SummaryStats).create(topicComments),
      });
    }

    topicStats.sort((a, b) => {
      if (a.name === "Other") return 1;
      if (b.name === "Other") return -1;
      return b.commentCount - a.commentCount;
    });

    topicStats.forEach((topic) => {
      if (topic.subtopicStats) {
        topic.subtopicStats.sort((a, b) => {
          if (a.name === "Other") return 1;
          if (b.name === "Other") return -1;
          return b.commentCount - a.commentCount;
        });
      }
    });

    return topicStats;
  }
}

/**
 * This subclass of the SummaryStats class provides the same abstract purpose
 * (that is, serving as the interface to the RecursiveSummary abstraction),
 * but is specifically tailored to data input in terms of votes and opinion
 * groups data.
 */
export class GroupedSummaryStats extends SummaryStats {
  filteredComments: CommentWithVoteTallies[];

  constructor(comments: Comment[]) {
    super(comments);
    this.filteredComments = comments.filter(isCommentWithVoteTalliesType).filter((comment) => {
      return getCommentVoteCount(comment) >= this.minVoteCount;
    });
  }

  /**
   * An override of the SummaryStats static factory method,
   * to allow for GroupedSummaryStats specific initialization.
   */
  static override create(comments: Comment[]): GroupedSummaryStats {
    return new GroupedSummaryStats(comments);
  }

  /**
   * Returns the top k comments according to the given metric. K defaults to 12.
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
      (comment: CommentWithVoteTallies) => getMinAgreeProb(comment) >= this.minCommonGroundProb
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
      (comment: CommentWithVoteTallies) => getMinDisagreeProb(comment) >= this.minCommonGroundProb
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
      (comment: CommentWithVoteTallies) => getGroupAgreeProbDifference(comment, group),
      k,
      (comment: CommentWithVoteTallies) =>
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
   * @param k defaults to this.maxSampleSize
   * @returns the top disagreed on comments
   */
  getDifferenceOfOpinionComments(k: number = this.maxSampleSize): Comment[] {
    return this.topK(
      // Get the maximum absolute group agree difference for any group.
      getMaxGroupAgreeProbDifference,
      k,
      (comment: CommentWithVoteTallies) =>
        // Some group must agree with the comment less than the minAgreeProbCommonGround
        // threshold, so that this comment doesn't also qualify as a common ground comment.
        getMinAgreeProb(comment) < this.minCommonGroundProb &&
        // Some group must disagree with the rest by a margin larger than the
        // getGroupAgreeProbDifference.
        getMaxGroupAgreeProbDifference(comment) < this.minAgreeProbDifference
    );
  }

  getStatsByGroup(): GroupStats[] {
    const groupNameToStats: { [key: string]: GroupStats } = {};
    for (const comment of this.comments) {
      for (const groupName in comment.voteTalliesByGroup) {
        const commentVoteCount = comment.voteTalliesByGroup[groupName].totalCount;
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
 * Represents statistics about a topic and its subtopics.
 */
export interface TopicStats {
  name: string;
  commentCount: number;
  subtopicStats?: TopicStats[];
  // The stats for the subset of comments.
  summaryStats: SummaryStats;
}

/**
 * Represents statistics about a group.
 */
export interface GroupStats {
  name: string;
  voteCount: number;
}
