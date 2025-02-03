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

// Functions for formatting citations.

import { Comment } from "../../types";

/**
 * Create citations for comments in the format of "[12, 43, 56]"
 * @param comments the comments to use for citations
 * @returns the formatted citations as a string
 */
export function getCommentCitations(comments: Comment[]): string {
  return "[" + comments.map((comment) => commentCitation(comment)).join(", ") + "]";
}

/**
 * Get the text that should be visible on hover for a citation.
 *
 * This includes the text and vote information.
 *
 * @param comment the comment to use for the numbers and text.
 * @returns
 */
export function commentCitationHoverOver(comment: Comment) {
  const hoverText = `${comment.text.replace(/"/g, '\\"').replace(/\n/g, " ")}`;
  if (comment.voteTalliesByGroup) {
    return hoverText + `\n${voteTallySummary(comment)}`;
  } else {
    return hoverText;
  }
}
/**
 * Utility function for displaying a concise textual summary of a comment as Markdown
 *
 * This includes the text and vote information.
 *
 * @param comment
 * @returns the summary as a string
 */
export function commentCitation(comment: Comment): string {
  return `[${comment.id}](## "${commentCitationHoverOver(comment)}")`;
}

/**
 * Display a summary of a comment (text and votes) as a citation in HTML.
 * @param comment the comment to summarize
 * @returns the html element with the comment id and more info on hover over.
 */
export function commentCitationHtml(comment: Comment): string {
  return "<a href='##' title='" + commentCitationHoverOver(comment) + "'>" + comment.id + `</a>`;
}
/**
 * Utility function for displaying a concise textual summary of the vote tally patterns for a given comment
 * @param comment
 * @returns the summary as a string
 */
export function voteTallySummary(comment: Comment): string {
  // Map k,v pairs from comment vote tallies to string representations, and combine into a single string.
  if (comment.voteTalliesByGroup) {
    return Object.entries(comment.voteTalliesByGroup as object).reduce((acc, [key, value]) => {
      return (
        acc +
        ` ${key}(Agree=${value.agreeCount}, Disagree=${value.disagreeCount}, Pass=${value.passCount || 0})`
      );
    }, "Votes:");
  } else {
    return "";
  }
}
