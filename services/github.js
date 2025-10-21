import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_API = 'https://api.github.com';
const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

// Axios instance with preset headers for convenience
const github = axios.create({
  baseURL: GITHUB_API,
  headers: {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  },
});

/**
 * Creates a repository and deploys the app.
 * This function is now fully idempotent: it can safely create a new repo and file,
 * or update an existing file if it already finds one.
 */
export async function createRepoAndDeploy(task, appCode) {
  const repoName = `app-${task}`;
  const filePath = 'index.html';

  // 1. Create a repo on GitHub if it doesn't exist.
  try {
    await github.post('/user/repos', {
      name: repoName,
      private: false,
    });
    console.log(`✅ Created GitHub repo: ${repoName}`);
  } catch (err) {
    if (err.response && err.response.status === 422) {
      console.log(`ℹ️ Repo already exists: ${repoName}`);
    } else {
      throw err; // Re-throw other errors
    }
  }

  // 2. Check if the index.html file already exists to get its SHA.
  let currentSha;
  try {
    const { data } = await github.get(`/repos/${username}/${repoName}/contents/${filePath}`);
    currentSha = data.sha;
    console.log(`ℹ️ Found existing file with SHA: ${currentSha}`);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`ℹ️ No existing '${filePath}' found. Creating a new one.`);
    } else {
      throw error; // Re-throw other errors
    }
  }

  // 3. Create or update the index.html file using the Contents API.
  const content = Buffer.from(appCode).toString('base64');
  const { data: { commit } } = await github.put(`/repos/${username}/${repoName}/contents/${filePath}`, {
    message: 'Commit from deployment API',
    content: content,
    branch: 'main',
    sha: currentSha, // Provide the SHA if the file exists. API handles it if undefined.
  });
  console.log(`✅ Pushed code to main branch. New SHA: ${commit.sha}`);
  
  // 4. Enable GitHub Pages.
  try {
    await github.post(`/repos/${username}/${repoName}/pages`, {
      source: { branch: 'main', path: '/' },
    });
    console.log(`✅ Enabled GitHub Pages`);
  } catch (e) {
    console.log('ℹ️ Could not enable GitHub Pages, it might be enabled already.');
  }

  return {
    repoUrl: `https://github.com/${username}/${repoName}`,
    commitSha: commit.sha,
    pagesUrl: `https://${username}.github.io/${repoName}/`,
  };
}

// NOTE: The separate updateRepoAndRedeploy function is no longer needed,
// as the main createRepoAndDeploy function now handles updates.
// You can remove it or keep it if you have other uses for it.
export async function updateRepoAndRedeploy(task, updatedCode) {
    // This function can now simply call the main function
    return createRepoAndDeploy(task, updatedCode);
}