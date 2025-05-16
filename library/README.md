# Jigsaw's tools for sensemaking

# Overview

[Sensemaker](https://medium.com/jigsaw/making-sense-of-large-scale-online-conversations-b153340bda55), an evolving toolkit developed by Jigsaw, helps make sense of large-scale online conversations, leveraging LLMs to categorize statements, and summarize statements and voting patterns to surface actionable insights. There are currently three main functions:

* Topic Identification \- identifies the main points of discussion. The level of detail is configurable, allowing the tool to discover: just the top level topics; topics and subtopics; or the deepest level — topics, subtopics, and themes (sub-subtopics).  
* Statement Categorization \- sorts statements into topics defined by a user or from the Topic Identification function. Statements can belong to more than one topic.  
* Summarization \- analyzes statements and vote data to output a summary of the conversation, including an overview, themes discussed, and areas of agreement and disagreement.

Please see these [docs](https://jigsaw-code.github.io/sensemaking-tools/docs/) for a full breakdown of available methods and types. These tools are still in their beta stage.

# How It Works

## Topic Identification

Sensemaker provides an option to identify the topics present in the comments. The tool offers flexibility to learn:

* Top-level topics  
* Both top-level and subtopics  
* Sub-topics only, given a set of pre-specified top-level topics

## Statement Categorization

Categorization assigns statements to one or more of the topics and subtopics. These topics can either be provided by the user, or can be the result of the "topic identification" method described above. 

Topics are assigned to statements in batches, asking the model to return the appropriate categories for each statement, and leveraging the Vertex API constrained decoding feature to structure this output according to a pre-specified JSON schema, to avoid issues with output formatting. Additionally, error handling has been added to retry in case an assignment fails.

## Summarization

The summarization is output as a narrative report, but users are encouraged to pick and choose which elements are right for their data (see example from the runner [here](https://github.com/Jigsaw-Code/sensemaking-tools/blob/521dd0c4c2039f0ceb7c728653a9ea495eb2c8e9/runner-cli/runner.ts#L54)) and consider showing the summarizations alongside visualizations (more tools for this coming soon). 

### Introduction Section

Includes a short bullet list of the number of statements, votes, topics and subtopics within the summary.

### Overview Section

The overview section summarizes the "Themes" sections for all subtopics, along with summaries generated for each top-level topic (these summaries are generated as an intermediate step, but not shown to users, and can be thought of as intermediate “chain of thought” steps in the overall recursive summarization approach).

Currently the Overview does not reference the "Common Ground" and "Differences of Opinion" sections.

Percentages in the overview (e.g. “Arts and Culture (17%)”) are the percentage of statements that are about this topic. Since statements can be categorized into multiple topics these percentages add up to a number greater than 100%. 

### Top 5 Subtopics

Sensemaker selects the top 5 subtopics by statement count, and concisely summarizes key themes found in statements within these subtopics. These themes are more concise than what appears later in the summary, to act as a quick overview.

### Topic and Subtopic Sections

Using the topics and subtopics from our "Topic Identification" and "Statement Categorization" features, short summaries are produced for each subtopic (or topic, if no subtopics are present). 

For each subtopic, Sensemaker surfaces:

* The number of statements assigned to this subtopic.  
* Prominent themes.  
* A summary of the top statements where we find "common ground" and "differences of opinion", based on agree and disagree rates.  
* The relative level of agreement within the subtopic, as compared to the average subtopic, based on how many comments end up in “common ground” vs “differences of opinion” buckets.

#### Themes

For each subtopic, Sensemaker identifies up to 5 themes found across statements assigned to that subtopic, and writes a short description of each theme. This section considers all statements assigned to that subtopic.

When identifying themes, Sensemaker leverages statement text and not vote information. Sensemaker attempts to account for differing viewpoints in how it presents themes.

#### Common Ground and Differences of Opinion

When summarizing "Common Ground" and "Differences of Opinion" within a subtopic, Sensemaker summarizes a sample of statements selected based on statistics calculated using the agree, disagree, and pass vote counts for those statements. For each section, Sensemaker selects statements with the clearest signals for common ground and disagreement, respectively.  It does not use any form of text analysis (beyond categorization) when selecting the statements, and only considers vote information.

Because small sample sizes (low vote counts) can create misleading impressions, statements with fewer than 20 votes total are not included. This avoids, for example, a total of 2 votes in favor of a particular statement being taken as evidence of broad support, and included as a point of common ground, when more voting might reveal relatively low support (or significant differences of opinion).

For this section, Sensemaker provides grounding citations to show which statements the LLM referenced, and to allow readers to check the underlying text and vote counts.

#### Relative Agreement

Each subtopic is labeled as “high”, “moderately high”, “moderately low” or “low” agreement. This is determined by, for each subtopic, getting *all* the comments that qualify as common ground comments and normalizing it based on how many comments were in that subtopic. Then these numbers are compared subtopic to subtopic. 

### **LLMs Used and Custom Models**

This library is implemented using Google Cloud’s [VertexAI](https://cloud.google.com/vertex-ai). This means the library can be set up to use any model available on VertexAI’s Google Cloud’s [Model Garden](https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models), including the latest Gemini models, the open source model Gemma, and other models like Llama and Claude (full list [here](https://cloud.google.com/model-garden)). The access and quota requirements are controlled by a user’s Google Cloud account.

In addition to models available through VertexAI’s Model Garden, users can integrate custom models using the library’s `Model` abstraction. This can be done by implementing a class with only two methods, one for generating plain text and one for generating structured data ([docs](https://jigsaw-code.github.io/sensemaking-tools/classes/models_model.Model.html) for methods). This allows for the library to be used with models not available in the Model Garden, with other cloud providers, and even with on-premise infrastructure for complete data sovereignty.

### **Costs of Running**

LLM pricing is based on token count and constantly changing. Here we list the token counts for a conversation with \~1000 statements. Please see [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) for an up-to-date cost per input token. As of April 10, 2025 the cost for running topic identification, statement categorization, and summarization was in total under $1 on Gemini 1.5 Pro.  
Token Counts for a 1000 statement conversation

|  | Topic Identification | Statement Categorization | Summarization |
| ----- | ----- | ----- | ----- |
| Input Tokens | 130,000 | 130,000 | 80,000 |
| Output Tokens | 50,000 | 50,000 | 7,500 |

### **Evaluations**

Our text summary consists of outputs from multiple LLM calls, each focused on summarizing a subset of comments. We have evaluated these LLM outputs for hallucinations both manually and using autoraters. Autorating code can be found in [evals/autorating](https://github.com/Jigsaw-Code/sensemaking-tools/tree/main/evals/autorating). 

We have evaluated topic identification and categorization using methods based on the silhouette coefficient. This evaluation code will be published in the near future. We have also considered how stable the outputs are run to run and comments are categorized into the same topic(s) \~90% of the time, and the identified topics also show high stability.

## **Running the tools \- Setup**

First make sure you have `npm` installed (`apt-get install npm` on Ubuntu-esque systems).  
Next install the project modules by running:  
`npm install`

### **Using the Default Models \- GCloud Authentication**

A Google Cloud project is required to control quota and access when using the default models that connect to Model Garden. Installation instructions for all machines are [here](https://cloud.google.com/sdk/docs/install-sdk#deb).  
For Linux the GCloud CLI can be installed like:  
`sudo apt install -y google-cloud-cli`  
Then to log in locally run:  
`gcloud config set project <your project name here>`  
`gcloud auth application-default login`

## **Example Usage \- Javascript**

Summarize Seattle’s $15 Minimum Wage Conversation.

```javascript
// Set up the tools to use the default Vertex model (Gemini Pro 1.5) and related authentication info.
const mySensemaker = new Sensemaker({
  defaultModel: new VertexModel(
    "myGoogleCloudProject123,
    "us-central1",
  ),
});

// Note: this function does not exist.
// Get data from a discussion in Seattle over a $15 minimum wage.
// CSV containing comment text, vote counts, and group information from:
// https://github.com/compdemocracy/openData/tree/master/15-per-hour-seattle
const comments: Comments[] = getCommentsFromCsv("./comments.csv");

// Learn what topics were discussed and print them out.
const topics = mySensemaker.learnTopics(
  comments,
  // Should include subtopics:
  true,
  // There are no existing topics:
  undefined,
  // Additional context:
  "This is from a conversation on a $15 minimum wage in Seattle"
);
console.log(topics);

// Summarize the conversation and print the result as Markdown.
const summary = mySensemaker.summarize(
  comments,
  SummarizationType.AGGREGATE_VOTE,
  topics,
  // Additional context:
  "This is from a conversation on a $15 minimum wage in Seattle"
);
console.log(summary.getText("MARKDOWN"));
```

**CLI Usage**  
There is also a simple CLI set up for testing. There are two tools:

* ./runner-cli/runner.ts: takes in a CSV representing a conversation and outputs an HTML file containing the summary. The summary is best viewed as an HTML file so that the included citations can be hovered over to see the original comment and votes.  
* ./runner-cli/rerunner.ts: takes in a CSV representing a conversation and reruns summarization a number of times and outputs each of the summaries in one CSV. This is useful for testing consistency.

## **Making Changes to the tools \- Development**

### **Testing**

Unit tests can be run with the following command: `npm test`  
To run tests continuously as you make changes run: `npm run test-watch`

## **Documentation**

The documentation [here](https://jigsaw-code.github.io/sensemaking-tools) is the hosted version of the html from the docs/ subdirectory. This documentation is automatically generated using typedoc, and to update the documentation run:  
`npx typedoc`

## **Feedback**

If you have questions or issues with this library, please leave feedback [here](https://docs.google.com/forms/d/e/1FAIpQLSd6kScXaf0d8XR7X9mgHBgG11DJYXV1hEzYLmqpxMcDFJxOhQ/viewform?resourcekey=0-GTVtn872epNsEHtI2ClBEA) and we will reach out to you. Our team is actively evaluating Sensemaker performance and is aiming to share our results on this page in the future. Please note that performance results may vary depending on the model selected.

## **Cloud Vertex Terms of Use**

This library is designed to leverage Cloud Vertex, and usage is subject to the [Cloud Vertex Terms of Service](https://cloud.google.com/terms/service-terms) and the [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).
