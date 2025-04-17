# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http:#www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Library for running performance and stability evals on Topic Identification and Categorization."""

import pandas as pd


TOPICS_COL = "topics"
COMMENT_ID_COL = "comment-id"
COMMENT_TEXT_COL = "comment_text"


def convert_topics_col_to_list(df: pd.DataFrame) -> pd.DataFrame:
  """Converts the topics column from a string of semicolon-separated topics to a list of topics."""
  df[TOPICS_COL] = df[TOPICS_COL].str.split(";")
  df[TOPICS_COL] = df[TOPICS_COL].apply(
      lambda x: list(set([i.split(":")[0] for i in x]))
  )
  return df


def get_pairwise_categorization_diffs(df1: pd.DataFrame, df2: pd.DataFrame) -> float:
  """Gets the count of comments with at least one topic difference between df1 and df2."""
  count_diffs = 0

  for _, row in df1.iterrows():
    matching_row = df2[df2[COMMENT_ID_COL].eq(row[COMMENT_ID_COL])]
    unique_diffs = set(row[TOPICS_COL]) ^ set(matching_row[TOPICS_COL].iloc[0])
    if len(unique_diffs) >= 1:
      count_diffs += 1

  return count_diffs / df1.shape[0]


def get_categorization_diffs(data: list[pd.DataFrame]) -> float:
  """Gets the average number of comments with at least one topic difference between all pairs of dataframes."""
  pairwise_diffs = []
  for index, df1 in enumerate(data):
    for df2 in data[index + 1: len(data)]:
      pairwise_diffs.append(get_pairwise_categorization_diffs(df1, df2))

  return sum(pairwise_diffs) / len(pairwise_diffs)
