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

// Routines for grounding summarization results in source comments and vote data, to ensure accuracy.

import { Comment, Summary, SummaryChunk } from "../types";
import { Model } from "../models/model";
import { commentCitation } from "../tasks/utils/citation_utils";
import { retryGenerateSummary } from "../tasks/summarization";

function formatComments(comments: Comment[]): string {
  return (
    comments.map((comment: Comment): string => "```\n" + JSON.stringify(comment)).join("\n") +
    "\n```"
  );
}

/**
 * Prompt for the first step of grounding, which is to identify the claims in the summary that need to be grounded.
 * @param summary
 */
export function identifyClaimsPrompt(summary: string): string {
  return `
In what follows you will be a given a summary of the outputs from a deliberative exercise. You will eventually be going through a list of comments and associated metadata (which might include voting patterns) and tasked with identifying source comments (and associated metadata) that substantiates the claims being made in the summary. This task is called "grounding". But that will come later.

For now, you job is the following: Identify portions of text in the summary making claims that need to be so grounded, and mark them by bracketing with double square brackets [[]], followed by a ^ character, and an empty set of single square brackets, which will eventually (in a later step) be the place where you identify grounding comment-ids, like this:

    [[a **specific claim** that needs to be grounded]]^[]

If a portion of text is followed by a punctuation mark, like a comma, period, etc., then include the punctuation within the double brackets.

These are correct examples (punctuation is within the double brackets):

    [[a **specific claim** that needs to be grounded,]]^[]
    [[**a specific claim that needs to be grounded**.]]^[]


These are incorrect examples (punctuation is outside of the double brackets):

    [[a **specific claim** that needs to be grounded]],^[]
    [[**a specific claim that needs to be grounded**]].^[]

However, prefer marking segments of texts that identify atomic or singular claims, rather than larger chunks (like complete sentences) of text making a larger number of claims.

Do not ground:
- topic and subtopics names (like "Infrastructure (5 comments)"),
- claims about the number of total comments in the conversation or the number of total votes.

THIS IS IMPORTANT!
Leave any portion of text from the original summary that does not need to be grounded alone. The overall structure of the summary text should not change, and all text, punctuation, special symbols (like asterisks "*"), indentation and aspects of markdown notation should be left as is. The only changes to the original text you should make are in the addition of brackets as described above.
You must preserve the existing double asterisks "**" (that represent bold markdown) in the summary, e.g. "**this is a claim**" should remain intact. Do not remove the existing double asterisks "**".
For example, this sentence should preserve double asterisks "**":
this is **a very specific claim**,
And when you add double brackets to the sentence above, you must keep the double asterisks "**" intact, like this:
[[this is **a very specific claim**,]]^[]
Leave the double asterisks "**" around phrases like **99 comments** alone, do not remove them.

Do not crop the response; you must include all sections of the summary.

Here is the summary for grounding:

${summary}`;
}

/**
 * Prompt for the second step of grounding, which is to identify the comments that ground the claims in the summary.
 * @param summary
 * @param comments
 */
export function assignGroundingPrompt(summary: string, comments: Comment[]): string {
  return `
In what follows you will be a given a summary of the outputs from a deliberative exercise, together with the comments and associated metadata that were the inputs for those summaries. This metadata specifically includes a comment-id, and possibly also a summary of voting patterns for some number of opinion or demographic groups. Portions of the summary that have been surrounded by double square brackets [[]], have been previously identified as claims that need to be grounded in (i.e. backed up by) comments submitted as part of the conversation.

Your job: for each portion of text in the summary that is making a statement about the content of what was said in the comments (or how participants expressed themselves via votes submitted in response to other participant's comments), identify those comments that substantiate the claims being made in the corresponding portion of text.
Select up to five comment IDs that best represent the statement being grounded. Prioritize comments that strongly support the statement, either through their text content or associated group votes. This includes comments demonstrating strong agreement and strong disagreement with the statement, as both can be valuable indicators of a clear perspective.
Place the comment ids for those statements in the single square brackets following the ^ character. For example, if you see a summary statement that looks like:

    [[a claim that needs to be grounded]]^[]

And you identify that comments 3, 5, and 10 support the summary statement, you would output the following in its place:

    [[a claim that needs to be grounded]]^[3,5,10]

You may notice that some statements marked for grounding already have comment ids assigned to them. If so, and you
identify new comments that help ground the statement, you can add those comment ids to the existing set.

Add comment ids only, and don't add anything else.
Do not add text like "All comment ids" or "There were X comments in the conversation".

This is correct:

    [[**An excellent claim**]]^[1,2,3,4,5]

This is NOT correct:

    [[**An excellent claim**]]^[All comment ids]

THIS IS IMPORTANT!
Leave any portion of text from the original summary that does not need to be grounded alone. The overall structure of the summary text should not change, and all text, punctuation, special symbols (like asterisks "*"), indentation and aspects of markdown notation should be left as is. The only changes to the original text you should make are in the addition of comment ids in brackets as described above.

Do not crop the response; you must include all sections of the summary.

Here is the summary for grounding:

${summary}

Here are the comments:

${formatComments(comments)}`;
}

/**
 * Prompt for the third step of grounding, which is to verify that the comments identified in the second step actually ground the claims in the summary, and remove any comments that fail verification.
 * @param summary
 * @param comments
 */
export function verifyGroundingPrompt(summary: string, comments: Comment[]): string {
  return `
In what follows you will be a given a summary of the outputs from a deliberative exercise, together with the comments and associated metadata that were the inputs for those summaries. This metadata specifically includes a comment-id, and possibly also a summary of voting patterns for some number of opinion or demographic groups. Portions of the summary that have been surrounded by double square brackets [[]], have been previously identified as claims that need to be grounded in (i.e. backed up by) comments submitted as part of the conversation. These portions of text will be followed by a ^ and then another set of single square brackets [] containing a list of comment ids which may or may not ground the summary statement. For example, you might see:

    [[a claim that needs to be grounded]]^[3,5,10]

for a statement that has comments that have been identified as possibly grounding it. Or you may see:

    [[a claim that needs to be grounded]]^[]

if no statements have been identified as grounding the statement.

Your job: for each portion of text in the summary that has been so marked, check that the comments corresponding to the flagged comment ids actually back up the corresponding claim. If a marked comment id does not back up a claim in the summary, remove it from the list of comment ids.

If vote tallies per each group are included in the comment data, pay attention to not just the content of the comments in relation to the summary claims, but also to whether the claims accurately reflect the vote breakdown by each group.
If there is a group with high number of disagree votes on a claim, do not state that there is strong or widespread support, and do not put this claim under high consensus. You goal is to avoid misrepresentation of group's opinion based on the group's votes.
Example: Do not put a claim "There's strong support for a X" under "High consensus" section, if the number of "Disagree" votes from any group on any comment related to this statement is higher (say 500) than "Agree" votes (say 100).

As you do this, pay attention not just to the marked portion of text, but also the context in which it is situated, such as surrounding text, or event the section it falls in (which might contextualize the claim being made about the highlighted portion of text).

THIS IS IMPORTANT!
Leave any portion of text from the original summary that does not need to be grounded alone. The overall structure of the summary text should not change, and all text, punctuation, special symbols (like asterisks "*"), indentation and aspects of markdown notation should be left as is. The only changes to the original text you should make are in the removal of comment ids in brackets as described above.

Do not crop the response; you must include all sections of the summary.

Here is the summary for grounding:

${summary}

Here are the comments:

${formatComments(comments)}`;
}

/**
 * Prompt for the final step of grounding, which is to remove any claims that were not grounded in the summary.
 * @param summary
 */
export function finalizeGroundingPrompt(summary: string): string {
  return `
In what follows you will be given a summary of the outputs from a deliberative exercise. Portions of the summary that have been surrounded by double square brackets [[]] have been previously identified as being in need of grounding (that is, of being backed up by comments submitted as part of the conversation). Portions of text so marked will be followed by a ^ and then another set of single square brackets [] containing a list of comment ids which have been identified as grounding the statement. For example, you might see:

    [[a claim that needs to be grounded.]]^[3,5,10]

for a statement that has comments that have been identified as possibly grounding it. Or you may see:

    [[a claim that needs to be grounded.]]^[]

if no comments have been identified as grounding the statement.

Your job: for each statement in the summary that has been so marked, if there are no comments that have been found to ground the statement, then remove the statement from the summary, and if necessary, adjust the surrounding text to that it makes sense without the removed statement.

THIS IS IMPORTANT!
Leave in any portion of text from the original summary that does not need to be grounded and is not invalidated by the removal of a claim. The overall structure of the summary text should not change, and all text, punctuation, special symbols (like asterisks "*"), indentation and aspects of markdown notation should be left as is, unless they have become unnecessary due to the removal of text as described above.

Do not crop the response; you must include all sections of the summary.

Here is the summary for editing:

${summary}`;
}

/**
 * Replace citation notation with hoverover links for analysis
 * @param comments
 * @param summary
 * @returns the markdown summary
 */
export function formatCitations(comments: Comment[], summary: string): string {
  // Regex for capturing all the ^[n,m] citation annotations from the summary (post grounding).
  const groundingCitationRegex = /\[([\d,\s]+)\]/g;
  // Create a mapping of comment ids to comment records.
  const commentIndex = comments.reduce((acc, curr) => acc.set(curr.id, curr), new Map());

  // Find every match of citation annotations and replace cited comment ids with markdown links.
  const summaryWithLinks = summary.replace(groundingCitationRegex, (_, match: string): string => {
    // Extract the individual comment ids from the match.
    const commentIds = match.split(/,\s*/);
    // Map to markdown links that display the comment text and vote patterns when you hover over.
    const mdLinks = commentIds.map((commentId) => commentCitation(commentIndex.get(commentId)));

    return "[" + mdLinks.join(", ") + "]";
  });
  // For debugging, add commentTable for searching comments that might have been removed at previous steps.
  //return summaryWithLinks + commentTable(comments);
  return summaryWithLinks;
}

// Requiring these here since they are only useful for this debugging code, which may get removed eventually
// eslint-disable-next-line
const Diff = require("diff");
// import * as Diff from 'diff'
import "colors";

/**
 * Debugging utility for rapidly scanning changes between steps in the grounding routine.
 * Logs a diff between two strings, with added text in green, removed text in red, and unchanged text in white.
 * @param header
 * @param summary1
 * @param summary2
 */
function diffLogger(header: string, summary1: string, summary2: string): void {
  console.log("\n\n" + header + "\n");
  const diff = Diff.diffChars(summary1, summary2);
  // eslint-disable-next-line
  diff.forEach((part: any): void => {
    const text = part.added ? part.value.bgGreen : part.removed ? part.value.bgRed : part.value;
    process.stderr.write(text);
  });
}

/**
 * Parses a string containing claim annotations into a `Summary` object.
 *
 * This function takes a string that represents a summary with embedded claim annotations
 * and converts it into a structured `Summary` object.  The annotations are expected to
 * be in the format `[[claim]]^[comment_id1,comment_id2,...]`.
 *
 * @param groundingResult The input string containing the summary with claim annotations.
 * @returns A `Summary` object representing the parsed summary.
 *
 * @example
 * For input summary:
 * "This is a filler text. [[This is the first claim.]]^[id1,id2] [[This is the second.]]^[id3]"
 *
 * The resulting 'summary' object will be:
 * {
 *   chunks: [
 *     { text: "This is a filler text. " },
 *     {
 *       text: "This is the first claim.",
 *       representativeCommentIds: ["id1", "id2"],
 *     },
 *     { text: " " },
 *     {
 *       text: "This is the second.",
 *       representativeCommentIds: ["id3"],
 *     },
 *   ],
 * }
 */
export async function parseStringIntoSummary(
  groundingResult: string,
  comments: Comment[]
): Promise<Summary> {
  // Regex for citation annotations like: "[[This is a grounded claim.]]^[id1,id2]"
  const groundingCitationRegex = /\[\[(.*?)]]\^\[(.*?)]/g;
  // The regex repeatedly splits summary into segments of 3 groups appended next to each other:
  // 1. filler text, 2. claim (without brackets), 3 comment ids (without brackets)
  //
  // For example, this summary:
  //  This is a filler text.
  //  [[Grounded claim...]]^[id1] [[Deeply, fully grounded claim.]]^[id2,id3][[Claim with no space in front]]^[id4,id5,id6]
  //  Finally, this is another filler text.
  //
  // will be split into:
  // [
  //   'This is a filler text.\n',
  //   'Grounded claim...',
  //   'id1',
  //   ' ',
  //   'Deeply, fully grounded claim.',
  //   'id2,id3',
  //   '',
  //   'Claim with no space in front',
  //   'id4,id5,id6',
  //   '\nFinally, this is another filler text.'
  // ]
  const parts = groundingResult.split(groundingCitationRegex);
  const chunks: SummaryChunk[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      // Add filler text, if not empty (in case two claims have no space in between)
      chunks.push({ text: parts[i] });
    }

    if (i < parts.length - 2) {
      const claim = parts[i + 1];
      const commentIds = parts[i + 2].split(",");
      chunks.push({
        text: claim,
        representativeCommentIds: commentIds,
      });
      i += 2; // bypass processed claim and comment ids elements
    }
  }
  return new Summary(chunks, comments);
}

/**
 * Analyze the summary for claims that should be grounded in comment data, identify comments
 * that accomplish this grounding objective, verify these grounding assignments, and remove claims
 * that fail grounding.
 * @param model
 * @param instructions
 * @param comments
 */
export async function groundSummary(
  model: Model,
  summary: string,
  comments: Comment[]
): Promise<Summary> {
  // Run each of the grounding prompts in turn, to produce a final grounded summary.
  console.log("\n## Initiating grounding routine");

  // Identify and demarcate claims.
  const identifyClaimsResult = await retryGenerateSummary(model, identifyClaimsPrompt(summary));
  diffLogger("## Initial statement tagging:", summary, identifyClaimsResult);

  // Assign initial grounding citations.
  const assignGroundingResult = await retryGenerateSummary(
    model,
    assignGroundingPrompt(identifyClaimsResult, comments)
  );
  diffLogger("## Initial statement grounding:", identifyClaimsResult, assignGroundingResult);

  // Verify the grounding citations.
  const verifyGroundingResult = await retryGenerateSummary(
    model,
    verifyGroundingPrompt(assignGroundingResult, comments)
  );
  diffLogger("## Grounding verification step:", assignGroundingResult, verifyGroundingResult);

  // Finalize the grounding by unverified claims.
  const finalGroundingResult = await retryGenerateSummary(
    model,
    finalizeGroundingPrompt(verifyGroundingResult)
  );
  diffLogger("## Final grounding results:", verifyGroundingResult, finalGroundingResult);

  return parseStringIntoSummary(finalGroundingResult, comments);
}
