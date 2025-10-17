import axios from "axios";
import { simpleGit } from "simple-git";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const GITHUB_API = "https://api.github.com";

// --- THIS FUNCTION IS NOW CORRECTED ---
export async function createRepoAndDeploy(task, appCode) {
  const repoName = `app-${task}`;
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;
  const repoPath = path.resolve(`./tmp/${repoName}`);
  const remoteUrl = `https://${token}@github.com/${username}/${repoName}.git`;

  // 1. Create an EMPTY repo on GitHub if it doesn't exist
  try {
    await axios.post(
      `${GITHUB_API}/user/repos`,
      { name: repoName, private: false, auto_init: false }, // Set auto_init to false
      { headers: { Authorization: `token ${token}` } }
    );
    console.log(`✅ Created GitHub repo: ${repoName}`);
  } catch (err) {
    // If the repo already exists, this will fail, which is okay.
    console.log(`ℹ️ Repo may already exist: ${repoName}`);
  }

  // 2. Clean up old directory and initialize a new local repo
  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
  fs.mkdirSync(repoPath, { recursive: true });

  const localGit = simpleGit(repoPath);
  await localGit.init();
  console.log(`✅ Initialized empty local repo at ${repoPath}`);
  
  // 3. Write the new app code, commit, and set the branch to 'main'
  fs.writeFileSync(`${repoPath}/index.html`, appCode);
  fs.writeFileSync(`${repoPath}/README.md`, `# ${repoName}\n\nGenerated app`);

  await localGit.add("./*");
  await localGit.commit("Initial commit from deployment API");
  // Explicitly set the branch name to main to avoid master/main issues.
  await localGit.branch(['-M', 'main']); 
  console.log(`✅ Committed files to local 'main' branch`);
  
  // 4. Add remote and push
  try {
    await localGit.addRemote("origin", remoteUrl);
  } catch (e) {
    // remote may already exist if we are re-running
    console.log('ℹ️ Remote origin may already exist.');
  }
  await localGit.push(["-u", "origin", "main", "--force"]);
  console.log(`✅ Pushed initial code to main branch`);

  // 5. Enable GitHub Pages
  try {
    await axios.post(
      `${GITHUB_API}/repos/${username}/${repoName}/pages`,
      { source: { branch: "main", path: "/" } },
      { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    console.log(`✅ Enabled GitHub Pages`);
  } catch (e) {
    console.log('ℹ️ Could not enable GitHub Pages, it might be enabled already.');
  }

  const commitSha = (await localGit.revparse(["HEAD"])).trim();

  return {
    repoUrl: `https://github.com/${username}/${repoName}`,
    commitSha,
    pagesUrl: `https://${username}.github.io/${repoName}/`,
  };
}

// --- THIS FUNCTION WAS CORRECTED PREVIOUSLY ---
export async function updateRepoAndRedeploy(task, updatedCode) {
  const repoName = `app-${task}`;
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;
  const repoPath = path.resolve(`./tmp/${repoName}`);
  const remoteUrl = `https://${token}@github.com/${username}/${repoName}.git`;

  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
  await simpleGit().clone(remoteUrl, repoPath);

  fs.writeFileSync(`${repoPath}/index.html`, updatedCode);

  const localGit = simpleGit(repoPath);
  await localGit.add("./*").commit("Round 2 update").push("origin", "main");

  const commitSha = (await localGit.revparse(["HEAD"])).trim();

  return {
    repoUrl: `https://github.com/${username}/${repoName}`,
    commitSha,
    pagesUrl: `https://${username}.github.io/${repoName}/`,
  };
}

