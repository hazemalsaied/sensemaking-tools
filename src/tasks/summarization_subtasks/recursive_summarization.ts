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
import { MAX_RETRIES } from "../../models/vertex_model";
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
 * Adds a one-second backoff for failed calls.
 *
 * Batching can be used to execute multiple promises in parallel that will then be resolved in
 * order. The batchSize can be thought of as the maximum number of parallel threads.
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

  async function retryPromise(promise: Promise<T>, currentRetry: number = 0): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      if (currentRetry >= MAX_RETRIES) {
        console.error(`Promise failed after ${MAX_RETRIES} retries:`, error);
        throw error;
      }
      console.error("Promise failed, retrying in 1 second:", error);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      return retryPromise(promise, currentRetry + 1);
    }
  }

  for (let i = 0; i < promises.length; i += numParallelExecutions) {
    const batch = promises.slice(i, i + numParallelExecutions).map(retryPromise); // Apply retry to each promise in the batch
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  return results;
}
