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

// Util class for models

// The maximum number of times an API call should be retried.
export const MAX_RETRIES = 3;
// How long in milliseconds to wait between API calls.
export const RETRY_DELAY_MS = 10000; // 10 seconds
// Set vertex parallelism based on environment variables or default values
export const CATEGORIZATION_VERTEX_PARALLELISM = parseInt(
  process.env["CATEGORIZATION_VERTEX_PARALLELISM"] || "2"
);
export const SUMMARIZATION_VERTEX_PARALLELISM = parseInt(
  process.env["SUMMARIZATION_VERTEX_PARALLELISM"] || "1"
);
