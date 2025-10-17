// require('dotenv').config(); // <--- VERCEL FIX 1: This is commented out to prevent crashing on Vercel
const express = require('express');
const { Octokit } = require('@octokit/rest');
const OpenAI = require('openai');
const cors = require('cors');
const fetch = require('node-fetch'); // Use standard fetch for consistency if available, otherwise fetch is polyfilled by Node.js 18+

const app = express();
app.use(express.json());
app.use(cors());

// Global, in-memory store: { taskId: { owner, repoName, repoUrl, pagesUrl } }
// This stores the repo details after Round 1 for use in Round 2.
const taskRepoMap = {}; 

// Initialize GitHub and OpenAI clients
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'API is running', message: 'POST to /api/build to deploy apps' });
});

// Main build endpoint
app.post('/api/build', async (req, res) => {
  console.log('Received request:', JSON.stringify(req.body, null, 2));
  
  // Step 1: Verify secret
  if (req.body.secret !== process.env.MY_SECRET) {
    // Send 401 response and stop execution immediately
    return res.status(401).json({ error: 'Invalid secret' });
  }

  // Step 2: Send immediate 200 response (crucial for long-running serverless function)
  res.status(200).json({ message: 'Request accepted, processing...' });

  // The rest of the function runs asynchronously after sending the response
  try {
    // Step 3: Extract request data
    const { email, task, round, nonce, brief, checks, evaluation_url, attachments } = req.body;

    console.log(`Processing task: ${task}, round: ${round}`);
    
    let owner, repoName, repoUrl, pagesUrl;

    // --- Step 4: Determine Repository based on Round ---
    if (round === 1) {
        // Round 1: CREATE NEW REPO
        repoName = `${task}-${Date.now()}`;
        console.log(`Round 1: Creating new repository: ${repoName}`);
        
        const repo = await createGitHubRepo(repoName);
        owner = repo.data.owner.login;
        repoUrl = repo.data.html_url;

        // Store details for the next round
        taskRepoMap[task] = { owner, repoName, repoUrl };

    } else if (round === 2) {
        // Round 2: USE EXISTING REPO
        const existingRepo = taskRepoMap[task];
        if (!existingRepo) {
            console.error(`Task ${task} not found in map for Round 2. Cannot update.`);
            return; // Stop processing if state is missing
        }
        owner = existingRepo.owner;
        repoName = existingRepo.repoName;
        repoUrl = existingRepo.repoUrl;
        
        console.log(`Round 2: Updating existing repository: ${repoName}`);

    } else {
        console.error('Invalid round number:', round);
        return; // Stop processing if round is invalid
    }

    // Step 5: Generate app code using LLM
    const appCode = await generateAppCode(brief, attachments, checks);

    // Step 6: Push code to repository (handles creation/update)
    // Pass 'round' to prevent creating the LICENSE file again
    const commitSha = await pushCodeToRepo(owner, repoName, appCode, brief, round);

    // Step 7: Enable GitHub Pages (harmless to call again for Round 2)
    await enableGitHubPages(owner, repoName);

    // Step 8: Wait a bit for Pages to deploy
    await sleep(5000);

    pagesUrl = `https://${owner}.github.io/${repoName}/`;
    
    // Store pagesUrl for Round 2 if it's Round 1
    if (round === 1) {
        taskRepoMap[task].pagesUrl = pagesUrl;
    }
    
    // Step 9: Notify evaluation URL
    await notifyEvaluation(evaluation_url, {
      email,
      task,
      round,
      nonce,
      repo_url: repoUrl,
      commit_sha: commitSha,
      pages_url: pagesUrl
    });

    console.log(`✅ Successfully deployed (Round ${round}):`, pagesUrl);

  } catch (error) {
    console.error('Error processing request:', error.message);
    // Note: We already sent 200 response, so we just log errors
  }
});

// Function to generate app code using OpenAI (NO CHANGE)
async function generateAppCode(brief, attachments, checks) {
  console.log('Generating code with LLM...');
  
  const prompt = `Create a complete, single-file HTML application that does the following:

${brief}

Requirements to check:
${checks.map((check, i) => `${i + 1}. ${check}`).join('\n')}

${attachments && attachments.length > 0 ? `\nAttachments provided:\n${attachments.map(a => `- ${a.name}: ${a.url.substring(0, 100)}...`).join('\n')}` : ''}

IMPORTANT:
- Create a complete, working HTML file with embedded CSS and JavaScript
- Include all necessary CDN links for libraries (use jsdelivr or cdnjs)
- Make it functional and professional-looking
- Handle the attachments by embedding them or fetching them as needed
- Ensure all the checks will pass
- Add comments explaining key parts

Return ONLY the HTML code, no explanations.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert web developer. Generate clean, working HTML/CSS/JS code." },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4000
  });

  let code = completion.choices[0].message.content;
  
  // Remove markdown code blocks if present
  code = code.replace(/```html\n?/g, '').replace(/```\n?/g, '');
  
  return code.trim();
}

// Function to create GitHub repository (NO CHANGE)
async function createGitHubRepo(repoName) {
  console.log(`Creating repository: ${repoName}`);
  
  return await octokit.repos.createForAuthenticatedUser({
    name: repoName,
    description: 'Auto-generated app for LLM deployment project',
    private: false,
    auto_init: false
  });
}

// Function to push code to repository (MODIFIED to accept 'round')
async function pushCodeToRepo(owner, repo, appCode, brief, round) {
  console.log(`Pushing code (Round ${round}) to repository...`);
  
  const filesToCommit = [
    { 
        path: 'index.html', 
        content: appCode, 
        message: `Update index.html (Round ${round})` 
    },
    { 
        path: 'README.md', 
        content: `# ${repo}\n\n## Summary\n${brief}\n\n## Setup\n1. Clone this repository\n2. Open index.html in a browser\n\n## Usage\nVisit the GitHub Pages URL to use the application.\n\n## Code Explanation\nThis is an auto-generated single-page application that fulfills the requirements specified in the brief.\n\n## License\nMIT License`, 
        message: `Update README.md (Round ${round})`
    }
  ];

    // Only create the LICENSE file in Round 1
    if (round === 1) {
        const license = `MIT License

Copyright (c) ${new Date().getFullYear()} ${owner}

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
SOFTWARE.`;
        
        filesToCommit.push({
            path: 'LICENSE',
            content: license,
            message: 'Add MIT LICENSE (Round 1)'
        });
    }

    let commitSha;

    for (const file of filesToCommit) {
        const response = await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: file.path,
            message: file.message,
            content: Buffer.from(file.content).toString('base64'),
            // Using 'undefined' for sha makes Octokit check if the file exists and update it, 
            // or create it if it doesn't. We don't need to fetch the SHA beforehand.
            sha: undefined 
        });
        commitSha = response.data.commit.sha; // Capture the last commit SHA
    }


  return commitSha;
}

// Function to enable GitHub Pages (NO CHANGE)
async function enableGitHubPages(owner, repo) {
  console.log('Enabling GitHub Pages...');
  
  try {
    await octokit.repos.createPagesSite({
      owner,
      repo,
      source: {
        branch: 'main',
        path: '/'
      }
    });
  } catch (error) {
    if (error.status === 409) {
      console.log('Pages already enabled');
    } else {
      throw error;
    }
  }
}

// Function to notify evaluation URL with retries (NO CHANGE)
async function notifyEvaluation(evaluationUrl, data) {
  console.log('Notifying evaluation URL...');
  
  const maxRetries = 5;
  let delay = 1000; // Start with 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(evaluationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        console.log('✅ Evaluation notified successfully');
        return;
      }
      
      console.log(`Attempt ${attempt} failed with status ${response.status}`);
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
    }
    
    if (attempt < maxRetries) {
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    }
  }
  
  console.error('❌ Failed to notify evaluation URL after all retries');
}

// Helper function to sleep (NO CHANGE)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// module.exports = app; // <--- VERCEL FIX 2: This is the correct Serverless Function export
// DELETE the old app.listen() block and replace it with:
module.exports = app;