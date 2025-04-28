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
import embeddings_lib as embeddings
import numpy as np

from typing import TypedDict

TOPICS_COL = "topics"
COMMENT_ID_COL = "comment-id"
COMMENT_TEXT_COL = "comment_text"

class AnalysisResults:
  """Holds summary statistics for an analysis."""
  mean: float
  stdev: float
  min: float
  max: float

  def __init__(self, values: list[float]):
    self.mean = np.mean(values)
    self.stdev = np.std(values)
    self.min = np.min(values)
    self.max = np.max(values)


def convert_topics_col_to_list(df: pd.DataFrame) -> pd.DataFrame:
  """Converts the topics column from a string of semicolon-separated topics to a list of topics."""
  df[TOPICS_COL] = df[TOPICS_COL].str.split(";")
  df[TOPICS_COL] = df[TOPICS_COL].apply(
      lambda x: list(set([i.split(":")[0] for i in x]))
  )
  return df


def get_pairwise_categorization_diffs(df1: pd.DataFrame, df2: pd.DataFrame) -> float:
  """Gets the rate of comments with at least one topic difference between df1 and df2."""
  count_diffs = 0

  for _, row in df1.iterrows():
    matching_row = df2[df2[COMMENT_ID_COL].eq(row[COMMENT_ID_COL])]
    unique_diffs = set(row[TOPICS_COL]) ^ set(matching_row[TOPICS_COL].iloc[0])
    if len(unique_diffs) >= 1:
      # TODO: add additional metric that tracks degree of change, ie how many assignments changed.
      count_diffs += 1

  return count_diffs / df1.shape[0]


def analyze_categorization_diffs(data: list[pd.DataFrame]) -> float:
  """Gets the average rate of comments with at least one topic difference between all pairs of dataframes."""
  pairwise_diffs = []
  for index, df1 in enumerate(data):
    for df2 in data[index + 1: len(data)]:
      pairwise_diffs.append(get_pairwise_categorization_diffs(df1, df2))

  return AnalysisResults(pairwise_diffs)


def get_topic_set_similarity(topic_set_1: set[str], topic_set_2: set[str]) -> float:
  """Gets the similarity between two sets of topics.

  For each topic in the first topic set, get the most similar corresponding topic in the second
  topic set. This value is then recorded. The same process is done for the second topic set to
  ensure all topics in both sets are considered. The average of these values is returned.
  """

  def get_similarities_for_first_topic_set(
      topic_set_1: set[str], topic_set_2: set[str]
  ) -> list[float]:
    similarities = []
    for topic in topic_set_1:
      other_topics_and_similarity = [
          (other_topic, embeddings.get_cosine_similarity(topic, other_topic))
          for other_topic in topic_set_2
      ]
      similarities.append(
          max(other_topics_and_similarity, key=lambda x: x[1])[1])
    return similarities

  # For each topic set get the average similarity of each topic to its most similar topic. This is
  # macro-averaged at the topic set level.
  mean_similarity_1 = np.mean(get_similarities_for_first_topic_set(
      topic_set_1, topic_set_2))
  mean_similarity_2 = np.mean(get_similarities_for_first_topic_set(
      topic_set_2, topic_set_1))

  return np.mean([mean_similarity_1, mean_similarity_2])


def analyze_topic_set_similarity(data: list[pd.DataFrame]) -> AnalysisResults:
  """Gets the average similarity between all pairs of dataframes."""
  topic_sets = []
  for df in data:
    exploded_topics = df[TOPICS_COL].explode()
    topic_sets.append(exploded_topics.unique())

  similarities = []
  for index, topic_set_1 in enumerate(topic_sets):
    for topic_set_2 in topic_sets[index + 1: len(topic_sets)]:
      similarity = get_topic_set_similarity(topic_set_1, topic_set_2)
      similarities.append(similarity)
  return AnalysisResults(similarities)


def topic_centered_cohesion(comments: pd.DataFrame, topic_name: str) -> float:
  """Returns cluster cohesion for the topic, treating the topic name embedding as the
  center of the cluster. This is computed as the average distance between the topic
  name embedding and embedding of each comment assigned that topic."""
  topic_comments = comments[comments[TOPICS_COL].apply(lambda x: topic_name in x)]
  distances = [embeddings.get_cosine_distance(topic_name, ct)
               for ct in topic_comments[COMMENT_TEXT_COL]]
  return np.mean(distances)


def topic_centered_comment_separation(
    comment: dict, topics: list[str]
) -> tuple[float, str | None]:
  """Computes cluster separation for the given comment, treating the topic name embedding
  as the center of each cluster. This is computed as the shortest distance between the
  comment embedding any the embedding of any topic name _not_ assigned said comment. The
  return value is a tuple of the separation distance, together with the closest topic
  name."""
  distances = [(t, embeddings.get_cosine_distance(t, comment[COMMENT_TEXT_COL]))
               for t in topics if t not in comment[TOPICS_COL]]
  # This covers the case where a comment is assigned to every topic
  if not distances:
    return (float('nan'), None)
  min_distance = min(distances)
  return min_distance


def topic_centered_separation(comments: pd.DataFrame, topic_name: str) -> float:
  """Returns the cluster sepration for the given topic, treating the topic name
  embedding as the center of each cluster. This is computed as the average of the
  tpoic_centered_comment_separation scores for all comments assigned said topic."""
  topics = comments[TOPICS_COL].explode().unique()
  topic_comments = comments[comments[TOPICS_COL].apply(lambda x: topic_name in x)]
  separations = [topic_centered_comment_separation(comment, topics)[1]
                 for comment in topic_comments.to_dict('records')]
  return np.mean(separations)


def topic_centered_silhouette_for_topic(
    comments: pd.DataFrame, topic_name: str
) -> float:
  """Returns the silhouette score for the given topic, treating the topic name
  embedding as the center of each cluster. This is computed as the normalized
  difference between topic_centered_separation and topic_centered_cohesion."""
  cohesion = topic_centered_cohesion(comments, topic_name)
  separation = topic_centered_separation(comments, topic_name)
  return (separation - cohesion) / max(cohesion, separation)


def topic_centered_silhouette(comments: pd.DataFrame) -> AnalysisResults:
  """Returns analysis of silhouette scores for the clustering induced by the topics,
  treating the topic name embedding as the center of each cluster. This is computed
  as the average of all the topic_centered_topic_silhouette scores for all topics in
  the dataset."""
  topics = comments[TOPICS_COL].explode().unique()
  topic_scores = [topic_centered_silhouette_for_topic(comments, topic)
                  for topic in topics]
  return AnalysisResults(topic_scores)
