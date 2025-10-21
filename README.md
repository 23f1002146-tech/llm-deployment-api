LLM Web App Generator & Deployer

Summary

This project is a Node.js application that leverages a Large Language Model (LLM) to automatically generate simple, single-page web applications from a text prompt. Once the code is generated, the application creates a new GitHub repository, commits the code, and deploys it as a live website using GitHub Pages. It also supports revising and redeploying the application based on new prompts.

The primary workflow is:

A user provides a brief for a web app.

The application uses the OpenAI API (gpt-4o-mini) to generate the complete HTML, CSS, and JavaScript code.

A new public repository is created on GitHub.

The generated code is pushed to the new repository.

GitHub Pages is enabled for the repository, making the web app live.

The application can then take a new prompt to revise the code and redeploy the changes.

Setup

Follow these steps to set up the project locally.

1. Prerequisites

Node.js (v20 or higher)

npm

Git

2. Installation

Clone the repository to your local machine:

git clone <your-repository-url>
cd <your-repository-directory>


Install the required npm packages:

npm install


3. Environment Variables

Create a .env file in the root of the project directory. This file will store your secret keys. Add the following variables:

# Your GitHub Personal Access Token
# Required scopes: repo, pages:write
GITHUB_TOKEN=your_github_personal_access_token

# Your GitHub Username
GITHUB_USERNAME=your_github_username

# Your OpenAI API Key
OPENAI_API_KEY=your_openai_api_key


Note: The .gitignore file is already configured to ignore the .env file, node_modules, and the tmp directory.

Usage

To use the application, you would typically run a main script that orchestrates the different modules. (Assuming a main script index.js that is not present in the uploaded files).

Example Workflow:

Generate and Deploy an App:

// In your main script
import { generateApp } from './llmGenerator.js';
import { createRepoAndDeploy } from './github.js';

const brief = "Create a simple counter app with buttons to increment and decrement.";
const appCode = await generateApp(brief);
const deploymentInfo = await createRepoAndDeploy('counter-task', appCode);
console.log('App deployed!', deploymentInfo);


Revise and Redeploy an App:

// In your main script
import { handleRevision } from './revision.js';
import { updateRepoAndRedeploy } from './github.js';

const revisionBrief = "Change the background color to lightblue.";
const updatedCode = await handleRevision(revisionBrief);
const redeploymentInfo = await updateRepoAndRedeploy('counter-task', updatedCode);
console.log('App updated!', redeploymentInfo);


Code Explanation

The project is structured into several modules, each with a specific responsibility.

llmGenerator.js

This module is responsible for the initial code generation.

generateApp(brief): Takes a string brief describing the web app. It constructs a prompt for the OpenAI API, asking it to generate a single index.html file with inline CSS and JavaScript. It then calls the gpt-4o-mini model and returns the generated code as a string.

revision.js

This module handles updates to existing code.

handleRevision(brief): Similar to generateApp, this function takes a brief for a revision. It prompts the LLM to return the full, updated code for the index.html file, incorporating the requested changes.

github.js

This module manages all interactions with the GitHub API and local Git operations.

createRepoAndDeploy(task, appCode):

Creates a new public repository on GitHub named app-${task}.

Initializes a new local Git repository in the tmp/ directory.

Writes the appCode to an index.html file.

Commits the file to the main branch.

Pushes the code to the remote GitHub repository.

Enables GitHub Pages for the main branch.

Returns an object with the repository URL, commit SHA, and the live GitHub Pages URL.

updateRepoAndRedeploy(task, updatedCode):

Clones the existing app-${task} repository.

Overwrites the index.html file with the updatedCode.

Commits and pushes the changes to the main branch.

logger.js

A simple utility module for consistent logging. It exports a logger object with info, warn, and error methods.

notify.js

Contains a function for sending notifications to an external service.

notifyEvaluation(url, data): Sends a POST request with JSON data to a specified url, likely for evaluation or webhook purposes.

License

This project is licensed under the MIT License. See the LICENSE file for details.

MIT License

Copyright (c) 2024 [Your Name or Organization]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.