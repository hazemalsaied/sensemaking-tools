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

"""This script runs evals on Topic Identification and Categorization."""
import argparse
import pandas as pd

import evals_lib


def parse_arguments() -> argparse.Namespace:
  """Parses command-line arguments."""
  parser = argparse.ArgumentParser(
      description="Process evaluation data and calculate categorization differences."
  )
  parser.add_argument(
      "--input-data",
      type=str,
      required=True,
      nargs="+",
      help="Path to the input data CSV files.",
  )
  parser.add_argument(
      "--output-csv-path",
      type=str,
      required=True,
      help="Path where the output CSV results file will be saved.",
  )
  return parser.parse_args()


def main(args: argparse.Namespace) -> None:
  input_files = args.input_data
  output_path = args.output_csv_path

  data = []
  for filepath in input_files:
    new_df = pd.read_csv(filepath)
    new_df = evals_lib.convert_topics_col_to_list(new_df)
    data.append(new_df)

    categorization_diff_rate = evals_lib.get_categorization_diffs(data)
    average_topic_set_similarity = evals_lib.get_average_topic_set_similarity(
        data)

    results_data = {
        "Evaluation Name": [
            "Topic Categorization Diff Rate",
            "Average Topic Set Similarity",
        ],
        "Result": [categorization_diff_rate, average_topic_set_similarity],
    }
    with open(output_path, "w") as f:
      pd.DataFrame(data=results_data).to_csv(f, index=False)


if __name__ == "__main__":
  args = parse_arguments()
  main(args)
