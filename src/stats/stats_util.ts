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
 * Compute the probability of an agree vote for a given vote tally entry.
 * @param voteTally the votes to use for the calculation
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the actual or estimated agree probability
 */
export function getAgreeRate(voteTally: VoteTally, asProbabilityEstimate: boolean = true): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  if (asProbabilityEstimate) {
    return (voteTally.agreeCount + 1) / (totalCount + 2);
  } else {
    return voteTally.agreeCount / totalCount;
  }
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
 * Compute the probability of an agree vote for a given set of vote tallies.
 * @param voteTalliesByGroup the votes to use for the calculation
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the actual or estimated agree probability
 */
export function getTotalAgreeRate(
  voteTalliesByGroup: { [key: string]: VoteTally },
  asProbabilityEstimate: boolean = true
): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalAgreeCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.agreeCount)
    .reduce((a: number, b: number) => a + b, 0);
  if (asProbabilityEstimate) {
    return (totalAgreeCount + 1) / (totalCount + 2);
  } else {
    return totalAgreeCount / totalCount;
  }
}

/**
 * Compute the probability of an pass vote for a given set of vote tallies.
 * @param voteTalliesByGroup the votes to use for the calculation
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the actual or estimated pass probability
 */
export function getTotalPassRate(
  voteTalliesByGroup: { [key: string]: VoteTally },
  asProbabilityEstimate: boolean = true
): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalPassCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.passCount || 0)
    .reduce((a: number, b: number) => a + b, 0);
  if (asProbabilityEstimate) {
    return (totalPassCount + 1) / (totalCount + 2);
  } else {
    return totalPassCount / totalCount;
  }
}

/**
 * Compute the probability of an disagree vote for a given set of vote tallies.
 * @param voteTalliesByGroup the votes to use for the calculation
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the actual or estimated disagree probability
 */
export function getTotalDisagreeRate(
  voteTalliesByGroup: {
    [key: string]: VoteTally;
  },
  asProbabilityEstimate: boolean = true
): number {
  const totalCount = Object.values(voteTalliesByGroup)
    .map(
      (voteTally: VoteTally) =>
        voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0)
    )
    .reduce((a: number, b: number) => a + b, 0);
  const totalDisagreeCount = Object.values(voteTalliesByGroup)
    .map((voteTally: VoteTally) => voteTally.disagreeCount)
    .reduce((a: number, b: number) => a + b, 0);
  if (asProbabilityEstimate) {
    return (totalDisagreeCount + 1) / (totalCount + 2);
  } else {
    return totalDisagreeCount / totalCount;
  }
}

/**
 * Computes group informed (agree) consensus for a comment's vote tallies,
 * computed as the product of the aggree probabilities across groups.
 */
export function getGroupInformedConsensus(comment: CommentWithVoteTallies): number {
  return Object.values(comment.voteTalliesByGroup).reduce(
    (product, voteTally) => product * getAgreeRate(voteTally, true),
    1
  );
}

/**
 * A function which returns the minimum aggree probability across groups
 * @param comment the comment with vote tallies to get the agree probability for
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the minimum agree probability across all groups
 */
export function getMinAgreeProb(
  comment: CommentWithVoteTallies,
  asProbabilityEstimate: boolean = true
): number {
  return Math.min(
    ...Object.values(comment.voteTalliesByGroup).map((voteTally) =>
      getAgreeRate(voteTally, asProbabilityEstimate)
    )
  );
}

/**
 * Compute the probability of an disagree vote for a given vote tally entry.
 * @param voteTally the votes to use for the calculation
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 * @returns the actual or estimated disagree probability
 */
export function getDisagreeRate(
  voteTally: VoteTally,
  asProbabilityEstimate: boolean = true
): number {
  const totalCount = voteTally.agreeCount + voteTally.disagreeCount + (voteTally.passCount || 0);
  if (asProbabilityEstimate) {
    return (voteTally.disagreeCount + 1) / (totalCount + 2);
  } else {
    return voteTally.disagreeCount / totalCount;
  }
}

/**
 * Computes group informed (disagree) consensus for a comment's vote tallies
 * computed as the product of disaggree probabilities across groups.
 */
export function getGroupInformedDisagreeConsensus(comment: CommentWithVoteTallies): number {
  return Object.values(comment.voteTalliesByGroup).reduce(
    (product, voteTally) => product * getDisagreeRate(voteTally, true),
    1
  );
}

/**
 * A function which returns the minimum disagree probability across groups
 * @param comment the comment with associated votes to get the probability for
 * @param asProbabilityEstimate whether to as add +1 and +2 to the numerator and demonenator
 * respectively as a psuedo-count prior so that probabilities tend to 1/2 in the absence of data,
 * and to avoid division/multiplication by zero. This is technically a simple maxima a priori (MAP)
 * probability estimate.
 */
export function getMinDisagreeProb(
  comment: CommentWithVoteTallies,
  asProbabilityEstimate: boolean = true
): number {
  return Math.min(
    ...Object.values(comment.voteTalliesByGroup).map((voteTally: VoteTally) =>
      getDisagreeRate(voteTally, asProbabilityEstimate)
    )
  );
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
  const groupAgreeProb = getAgreeRate(comment.voteTalliesByGroup[group]);
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
  const otherGroupsAgreeProb = getAgreeRate(otherGroupsVoteTally);
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
