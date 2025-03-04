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

// Functions for different ways to summarize Comment and Vote data.

import { Model } from "../../models/model";
import { SummaryContent } from "../../types";

export abstract class RecursiveSummary<InputType> {
  protected input: InputType;
  // Input data with at least minimumCommentCount votes.
  protected model: Model;
  protected additionalContext?: string;

  constructor(input: InputType, model: Model, additionalContext?: string) {
    this.input = input;
    this.model = model;
    this.additionalContext = additionalContext;
  }

  abstract getSummary(): Promise<SummaryContent>;
}

/**
 * Resolves Promises sequentially, optionally using batching for limited parallelization.
 *
 * Batching can be used to execute mutiple promises in parallel that will then be resolved in
 * order. The batchSize can be though of as the maximum number of parallel threads.
 * @param promises the promises to resolve.
 * @param numParallelExecutions how many promises to resolve at once, the default is 2 based on the
 * current Gemini qps quotas, see: https://cloud.google.com/gemini/docs/quotas#per-second.
 * @returns A list of the resolved values of the promises.
 */
export async function resolvePromisesInParallel<T>(
  promises: Promise<T>[],
  numParallelExecutions: number = 2
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < promises.length; i += numParallelExecutions) {
    const batch = promises.slice(i, i + numParallelExecutions);
    const batchResults = await Promise.all(batch); // Resolve batch in parallel
    results.push(...batchResults); // Add batch results to the main results array
  }

  return results;
}
