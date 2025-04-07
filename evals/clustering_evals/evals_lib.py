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


# Converts the topics column from a string of semicolon-separated topics to a
# list of topics.
def convert_topics_col_to_list(df: pd.DataFrame) -> pd.DataFrame:
  df[TOPICS_COL] = df[TOPICS_COL].str.split(";")
  df[TOPICS_COL] = df[TOPICS_COL].apply(lambda x: list(set([i.split(":")[0] for i in x])))
  return df


def get_categorization_diffs(data: list[pd.DataFrame]) -> int:
  print("Number of dataframes: ", len(data))
  return 0
