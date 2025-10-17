require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const OpenAI = require('openai');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

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
  
  try {
    // Step 1: Verify secret
    if (req.body.secret !== process.env.MY_SECRET) {
      return res.status(401).json({ error: 'Invalid secret' });
    }

    // Step 2: Send immediate 200 response
    res.status(200).json({ message: 'Request accepted, processing...' });

    // Step 3: Extract request data
    const { email, task, round, nonce, brief, checks, evaluation_url, attachments } = req.body;

    console.log(`Processing task: ${task}, round: ${round}`);

    // Step 4: Generate app code using LLM
    const appCode = await generateAppCode(brief, attachments, checks);

    // Step 5: Create GitHub repository
    const repoName = `${task}-${Date.now()}`;
    const repo = await createGitHubRepo(repoName);

    // Step 6: Push code to repository
    const commitSha = await pushCodeToRepo(repo.data.owner.login, repoName, appCode, brief);

    // Step 7: Enable GitHub Pages
    await enableGitHubPages(repo.data.owner.login, repoName);

    // Step 8: Wait a bit for Pages to deploy
    await sleep(5000);

    const pagesUrl = `https://${repo.data.owner.login}.github.io/${repoName}/`;

    // Step 9: Notify evaluation URL
    await notifyEvaluation(evaluation_url, {
      email,
      task,
      round,
      nonce,
      repo_url: repo.data.html_url,
      commit_sha: commitSha,
      pages_url: pagesUrl
    });

    console.log('✅ Successfully deployed:', pagesUrl);

  } catch (error) {
    console.error('Error processing request:', error.message);
    // Note: We already sent 200 response, so we just log errors
  }
});

// Function to generate app code using OpenAI
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

// Function to create GitHub repository
async function createGitHubRepo(repoName) {
  console.log(`Creating repository: ${repoName}`);
  
  return await octokit.repos.createForAuthenticatedUser({
    name: repoName,
    description: 'Auto-generated app for LLM deployment project',
    private: false,
    auto_init: false
  });
}

// Function to push code to repository
async function pushCodeToRepo(owner, repo, appCode, brief) {
  console.log('Pushing code to repository...');
  
  // Create index.html
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'index.html',
    message: 'Add index.html',
    content: Buffer.from(appCode).toString('base64')
  });

  // Create README.md
  const readme = `# ${repo}

## Summary
${brief}

## Setup
1. Clone this repository
2. Open index.html in a browser

## Usage
Visit the GitHub Pages URL to use the application.

## Code Explanation
This is an auto-generated single-page application that fulfills the requirements specified in the brief.

## License
MIT License`;

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'README.md',
    message: 'Add README.md',
    content: Buffer.from(readme).toString('base64')
  });

  // Create LICENSE
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

  const licenseResponse = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'LICENSE',
    message: 'Add MIT LICENSE',
    content: Buffer.from(license).toString('base64')
  });

  return licenseResponse.data.commit.sha;
}

// Function to enable GitHub Pages
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

// Function to notify evaluation URL with retries
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

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/api/build`);
});