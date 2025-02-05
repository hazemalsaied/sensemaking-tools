#!/usr/bin/env python3

import pandas as pd
import argparse as arg


print("starting program")

# argparse setup with arguments for two input files
def getargs():
    parser = arg.ArgumentParser(description="Process Polis data from the openData export data.")
    parser.add_argument("export_directory", help="Path to export directory.")
    parser.add_argument("--participants-votes", help="Participants votes file (override).")
    parser.add_argument("--comments", help="Path to the comments file (override).")
    parser.add_argument("-o", "--output_file", help="Path to the output CSV file.", required=True)
    args = parser.parse_args()
    args.participants_votes = args.participants_votes or f"{args.export_directory}/participants-votes.csv"
    args.comments = args.comments or f"{args.export_directory}/comments.csv"
    return args


print("processing args")
args = getargs()

# Read the CSV files into pandas DataFrames
try:
    votes = pd.read_csv(args.participants_votes)
    comments = pd.read_csv(args.comments)
except FileNotFoundError as e:
    print(f"Error: One or both input files not found: {e}")
    exit(1)
except pd.errors.EmptyDataError as e:
    print(f"Error: One or both input files are empty: {e}")
    exit(1)
except pd.errors.ParserError as e:
    print(f"Error parsing CSV file: {e}")
    exit(1)

print("args processed")

# make sure to cast comment ids as ints
comments['comment-id'] = comments['comment-id'].astype(int)


# filter out votes rows where group-id is nan, and make ints
votes = votes[votes['group-id'].notna()]
votes['group-id'] = votes['group-id'].astype(int)
group_ids = votes['group-id'].unique()

# prompt: find all of the column names in the votes df that match a numeric regex
import re
comment_ids = [col for col in votes.columns if re.match(r'^\d+$', col)]
print(comment_ids)


# Melt the DataFrame
melted_votes = votes.melt(id_vars=["group-id"], value_vars=comment_ids, var_name='comment-id', value_name='value')
melted_votes['comment-id'] = melted_votes['comment-id'].astype(int)
print(melted_votes)
# Group, count, unstack, and fill missing values
result = (
    melted_votes.groupby(['comment-id','group-id'])['value']
    .value_counts()
    .unstack(fill_value=0)
    .reset_index()
)

# Rename columns
result = result.rename(columns={-1: 'disagree-count', 0: 'pass-count', 1: 'agree-count'})

# pivot out the group-id column so that each of the vote count columns look like "group-N-VOTE-count"
pivoted = result.pivot(index="comment-id", columns='group-id')

# ...?
for_merge = pd.DataFrame({'comment-id': pivoted['disagree-count'][0.0].index})
for group_id in group_ids:
  for count_col in ["disagree-count", "pass-count", "agree-count"]:
    for_merge["group-" + str(group_id) + "-" + count_col] = pivoted[count_col][group_id]

# zero out total vote tallies since incorrect from filtering or database caching
comments["agrees"] = 0
comments["disagrees"] = 0
comments["passes"] = 0

# merge in the per group tallies above
comments = comments.merge(for_merge, on='comment-id')

# add up from the votes matrix for consistency
for group_id in group_ids:
  comments["disagrees"] += comments["group-" + str(group_id) + "-disagree-count"]
  comments["agrees"] += comments["group-" + str(group_id) + "-agree-count"]
  comments["passes"] += comments["group-" + str(group_id) + "-pass-count"]

# Rename columns from "group-0", "group-1", etc to "Group-1", "Group-2", etc
for group_id in group_ids:
   new_columns = [col.replace(f'group-{group_id}', "Group-" + (1 + group_id)) for col in comments.columns]
   comments.columns = new_columns 

comments["votes"] = comments["agrees"] + comments["disagrees"] + comments["passes"]

# Leave only those comments explicitly moderated into the conversation, or that were
# left unmoderated, and accumulated votes (implying the conversation was likely set
# to non-strict moderation)
print("N comments total:", len(comments))
moderated_comments = comments[(comments["moderated"] == 1) | ((comments["moderated"] == 0) & (comments["votes"] > 1))]
print("N comments included after moderation:", len(moderated_comments))

# prompt: write out to a CSV file
moderated_comments = moderated_comments.rename(columns={'comment-body': 'comment_text'})
moderated_comments.to_csv(args.output_file, index=False)

