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

import { Comment, CommentWithVoteTallies, VoteTally } from "../types";

/**
 * Compute the MAP probability estimate of an agree vote for a given vote tally entry.
 */
export function getAgreeProbability(voteTally: VoteTally): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (voteTally.agreeCount + 1) / (totalCount + 2);
}

export function getStandardDeviation(numbers: number[]): number {
  if (numbers.length <= 1) {
    return 0; // Standard deviation of a single number is 0
  }

  const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  const squaredDifferences = numbers.map((num) => Math.pow(num - mean, 2));
  const variance =
    squaredDifferences.reduce((sum, squaredDiff) => sum + squaredDiff, 0) / (numbers.length - 1); // Use (n-1) for sample standard deviation
  return Math.sqrt(variance);
}

/**
 * Compute the MAP probability estimate of an agree vote for a given map of VoteTallies.
 */
export function getTotalAgreeProbability(voteTalliesByGroup: { [key: string]: VoteTally }): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalAgreeCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.agreeCount)
    .reduce((a: number, b: number) => a + b, 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (totalAgreeCount + 1) / (totalCount + 2);
}

/**
 * Compute the MAP probability estimate of an pass vote for a given map of VoteTallies.
 */
export function getTotalPassProbability(voteTalliesByGroup: { [key: string]: VoteTally }): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalPassCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.passCount || 0)
    .reduce((a: number, b: number) => a + b, 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (totalPassCount + 1) / (totalCount + 2);
}

/**
 * Compute the MAP probability estimate of an disagree vote for a given map of VoteTallies.
 */
export function getTotalDisagreeProbability(voteTalliesByGroup: {
  [key: string]: VoteTally;
}): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalDisagreeCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.disagreeCount)
    .reduce((a: number, b: number) => a + b, 0);
  // We add +1 and +2 to the numerator and demonenator respectively as a psuedo-count prior so that probabilities tend to 1/2 in the
  // absence of data, and to avoid division/multiplication by zero in group informed consensus and risk ratio calculations. This is technically
  // a simple maxima a priori (MAP) probability estimate.
  return (totalDisagreeCount + 1) / (totalCount + 2);
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
