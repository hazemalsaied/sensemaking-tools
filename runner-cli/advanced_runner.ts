// Copyright 2025 Google LLC
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

// Advanced data output mode.
//
// There are 3 outputs:
// - a topic stats json that includes the topics found, their size, their engagement and alignment,
//        and their subtopics
// - a comments json that includes the total vote count and agree, disagree, and pass rate.
// - the summary as a json

import { Command } from "commander";
import { writeFileSync } from "fs";
import { getCommentsFromCsv, getSummary } from "./runner_utils";
import { MajoritySummaryStats } from "../src/stats/majority_vote";
import { TopicStats } from "../src/stats/summary_stats";
import { RelativeContext } from "../src/tasks/summarization_subtasks/relative_context";
import { Comment, CommentWithVoteInfo, VoteInfo } from "../src/types";
import { getTotalAgreeRate, getTotalDisagreeRate, getTotalPassRate } from "../src/stats/stats_util";

// Whether to return the estimated rates of agreement/disagreement/passing by using a prior.
const USE_PROBABILITY_ESTIMATES = false;

interface MinimalTopicStat {
  name: string;
  commentCount: number;
  voteCount: number;
  subtopicStats?: MinimalTopicStat[];
  relativeEngagement: string;
  relativeAlignment: string;
}

interface CommentWithScores {
  id: string;
  text: string;
  votes?: VoteInfo;
  agreeRate?: number;
  disagreeRate?: number;
  passRate?: number;

  isHighAlignment?: boolean;
  highAlignmentScore?: number;

  isLowAlignment?: boolean;
  lowAlignmentScore?: number;

  isHighUncertainty?: boolean;
  highUncertaintyScore?: number;

  isFilteredOut?: boolean;
}

function createMinimalStats(stats: TopicStats[]): MinimalTopicStat[] {
  const relativeContext = new RelativeContext(stats);
  return stats.map((stat): MinimalTopicStat => {
    const minimalStat: MinimalTopicStat = {
      name: stat.name,
      commentCount: stat.commentCount,
      voteCount: stat.summaryStats.voteCount,
      relativeAlignment: relativeContext.getRelativeAgreement(stat.summaryStats),
      relativeEngagement: relativeContext.getRelativeEngagement(stat.summaryStats),
      // Recursively process subtopics if they exist
      subtopicStats: stat.subtopicStats ? createMinimalStats(stat.subtopicStats) : undefined,
    };
    return minimalStat;
  });
}

function getCommentsWithScores(
  comments: Comment[],
  stats: MajoritySummaryStats
): CommentWithScores[] {
  const highAlignmentCommentIDs = stats
    .getCommonGroundComments(Number.MAX_VALUE)
    .map((comment) => comment.id);
  const lowAlignmentCommentIDs = stats
    .getDifferenceOfOpinionComments(Number.MAX_VALUE)
    .map((comment) => comment.id);
  const highUncertaintyCommentIDs = stats
    .getUncertainComments(Number.MAX_VALUE)
    .map((comment) => comment.id);
  const filteredCommentIds = stats.filteredComments.map((comment) => comment.id);
  return comments.map((comment) => {
    const commentWithScores: CommentWithScores = {
      id: comment.id,
      text: comment.text,
      votes: comment.voteInfo,
    };
    if (comment.voteInfo) {
      const commentWithVoteInfo = comment as CommentWithVoteInfo;
      commentWithScores.passRate = getTotalPassRate(comment.voteInfo, USE_PROBABILITY_ESTIMATES);
      commentWithScores.agreeRate = getTotalAgreeRate(comment.voteInfo, USE_PROBABILITY_ESTIMATES);
      commentWithScores.disagreeRate = getTotalDisagreeRate(
        comment.voteInfo,
        USE_PROBABILITY_ESTIMATES
      );
      commentWithScores.isHighAlignment = highAlignmentCommentIDs.includes(comment.id);
      commentWithScores.highAlignmentScore = stats.getCommonGroundScore(commentWithVoteInfo);

      commentWithScores.isLowAlignment = lowAlignmentCommentIDs.includes(comment.id);
      commentWithScores.lowAlignmentScore = stats.getDifferenceOfOpinionScore(commentWithVoteInfo);

      commentWithScores.isHighUncertainty = highUncertaintyCommentIDs.includes(comment.id);
      commentWithScores.highUncertaintyScore = stats.getUncertainScore(commentWithVoteInfo);

      commentWithScores.isFilteredOut = !filteredCommentIds.includes(comment.id);
    }
    return commentWithScores;
  });
}

async function main(): Promise<void> {
  // Parse command line arguments.
  const program = new Command();
  program
    .option(
      "-o, --outputBasename <file>",
      "The output basename, this will be prepended to 'summary.html' and 'summaryClaimsAndComments.csv'."
    )
    .option("-i, --inputFile <file>", "The input file name.")
    .option(
      "-a, --additionalContext <context>",
      "A short description of the conversation to add context."
    )
    .option("-v, --vertexProject <project>", "The Vertex Project name.");
  program.parse(process.argv);
  const options = program.opts();

  const comments = await getCommentsFromCsv(options.inputFile);
  // TODO: Consider making this a flag so the user can choose between algorithms.
  const stats = new MajoritySummaryStats(comments);

  // Modify the SummaryStats output to drop comment info and add RelativeContext.
  const minimalTopicStats = createMinimalStats(stats.getStatsByTopic());
  writeFileSync(
    options.outputBasename + "-topic-stats.json",
    JSON.stringify(minimalTopicStats, null, 2)
  );

  const commentsWithScores = getCommentsWithScores(comments, stats);
  writeFileSync(
    options.outputBasename + "-comments-with-scores.json",
    JSON.stringify(commentsWithScores, null, 2)
  );

  const summary = await getSummary(
    options.vertexProject,
    comments,
    undefined,
    options.additionalContext
  );
  writeFileSync(options.outputBasename + "-summary.json", JSON.stringify(summary, null, 2));
}

main();
