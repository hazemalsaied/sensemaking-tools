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

"""Tests for evals_lib."""

import pandas as pd
import unittest
from unittest.mock import patch
import evals_lib


def assert_topic_lists_equal(
    all_expected_topics: list[list[str]], all_result_topics: list[list[str]]
) -> None:
  """Asserts that two sets of topics lists are equal regardless of order."""
  for expected_topics, result_topics in zip(all_expected_topics, all_result_topics):
    expected_topics = expected_topics.sort()
    result_topics = result_topics.sort()
    assert expected_topics == result_topics


class TestEvalsLib(unittest.TestCase):

  def test_convert_topics_col_to_list(self):
    data = {
        "topics": [
            "topic1:subtopic1;topic2:subtopic2",
            "topic3:subtopic3;topic4:subtopic4",
            "topic5:subtopic5;topic6:subtopic6",
        ]
    }
    all_expected_topics = [
        ["topic2", "topic1"],
        ["topic3", "topic4"],
        ["topic6", "topic5"],
    ]
    result_df = evals_lib.convert_topics_col_to_list(pd.DataFrame(data))
    all_result_topics = result_df["topics"].tolist()
    assert_topic_lists_equal(all_expected_topics, all_result_topics)

  def test_convert_topics_col_to_list_duplicate_topics(self):
    data = {
        "topics": [
            "topic1:subtopic1;topic1:subtopic2",
            "topic2:subtopic3;topic2:subtopic4",
            "topic3:subtopic5;topic4:subtopic6",
        ]
    }
    expected_topics = [
        ["topic1"],
        ["topic2"],
        ["topic3", "topic4"],
    ]
    result_df = evals_lib.convert_topics_col_to_list(pd.DataFrame(data))
    assert_topic_lists_equal(expected_topics, result_df["topics"].tolist())

  def test_get_categorization_diffs_no_diffs(self):
    """Test with two identical DataFrames."""
    df1 = pd.DataFrame(
        {
            "comment-id": [1, 2],
            "comment_text": ["a", "b"],
            "topics": [["topic1"], ["topic2"]],
        }
    )
    data = [df1, df1]
    result = evals_lib.get_categorization_diffs(data)
    self.assertEqual(result, 0.0)

  def test_get_categorization_diffs_some_diffs(self):
    """Test with two DataFrames with some differences."""
    df1 = pd.DataFrame(
        {
            "comment-id": [1, 2],
            "comment_text": ["a", "b"],
            "topics": [["topic1"], ["topic2"]],
        }
    )
    df2 = pd.DataFrame(
        {
            "comment-id": [1, 2],
            "comment_text": ["a", "b"],
            "topics": [["topic1"], ["topic3"]],
        }
    )
    data = [df1, df2]
    result = evals_lib.get_categorization_diffs(data)
    self.assertEqual(result, 0.5)


  @patch("evals_lib.embeddings_lib.get_cosine_similarity")
  def test_get_topic_set_similarity_identical_sets(self, mock_get_cosine_similarity):
    """Test with two identical sets of topics."""
    mock_get_cosine_similarity.return_value = 1.0
    topic_set_1 = {"topic1", "topic2", "topic3"}
    topic_set_2 = {"topic1", "topic2", "topic3"}
    result = evals_lib.get_topic_set_similarity(topic_set_1, topic_set_2)
    self.assertEqual(result, 1.0)
    self.assertEqual(mock_get_cosine_similarity.call_count, 18)

  @patch("evals_lib.embeddings_lib.get_cosine_similarity")
  def test_get_topic_set_similarity_partial_overlap(self, mock_get_cosine_similarity):
    """Test with two sets of topics that have some overlap."""
    mock_get_cosine_similarity.side_effect = lambda x, y: 1.0 if x == y else 0
    topic_set_1 = {"topic1", "topic2", "topic3"}
    topic_set_2 = {"topic2", "topic3", "topic4"}
    result = evals_lib.get_topic_set_similarity(topic_set_1, topic_set_2)
    self.assertEqual(result, 2 / 3)
    self.assertEqual(mock_get_cosine_similarity.call_count, 18)

  @patch("evals_lib.get_topic_set_similarity")
  def test_get_average_topic_set_similarity_identical_dataframes(
      self, mock_get_topic_set_similarity
  ):
    """Test with two identical DataFrames."""
    mock_get_topic_set_similarity.return_value = 1.0
    df1 = pd.DataFrame({"topics": [["topic1"], ["topic2"]]})
    df2 = pd.DataFrame({"topics": [["topic1"], ["topic2"]]})
    data = [df1, df2]
    result = evals_lib.get_average_topic_set_similarity(data)
    self.assertEqual(result, 1.0)
    self.assertEqual(mock_get_topic_set_similarity.call_count, 1)

  @patch("evals_lib.get_topic_set_similarity")
  def test_get_average_topic_set_similarity_multiple_dataframes(
      self, mock_get_topic_set_similarity
  ):
    """Test with multiple DataFrames."""
    mock_get_topic_set_similarity.side_effect = [0.5, 0.75, 0.25]
    df1 = pd.DataFrame({"topics": [["topic1"], ["topic2"]]})
    df2 = pd.DataFrame({"topics": [["topic3"], ["topic4"]]})
    df3 = pd.DataFrame({"topics": [["topic5"], ["topic6"]]})
    data = [df1, df2, df3]
    result = evals_lib.get_average_topic_set_similarity(data)
    self.assertEqual(result, 0.5)
    self.assertEqual(mock_get_topic_set_similarity.call_count, 3)
