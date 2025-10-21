import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function createRepoAndDeploy(task, appCode) {
  const repoName = `app-${task}`;
  const username = process.env.GITHUB_USERNAME;

  try {
    // 1️⃣ Try to create repo (ignore if it already exists)
    try {
      await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        private: false,
      });
      console.log(`✅ Created new repo: ${repoName}`);
    } catch {
      console.log(`ℹ️ Repo may already exist: ${repoName}`);
    }

    // 2️⃣ Upload index.html
    const content = Buffer.from(appCode).toString("base64");

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: username,
      repo: repoName,
      path: "index.html",
      message: "Initial commit",
      content,
    });

    // 3️⃣ Upload README.md
    const readmeContent = Buffer.from(`# ${repoName}\n\nGenerated app`).toString("base64");
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: username,
      repo: repoName,
      path: "README.md",
      message: "Add README",
      content: readmeContent,
    });

    // 4️⃣ Enable GitHub Pages
    try {
      await octokit.rest.repos.createPagesSite({
        owner: username,
        repo: repoName,
        source: { branch: "main", path: "/" },
      });
      console.log("✅ Enabled GitHub Pages");
    } catch (err) {
      console.log("ℹ️ GitHub Pages may already be enabled.");
    }

    return {
      repoUrl: `https://github.com/${username}/${repoName}`,
      pagesUrl: `https://${username}.github.io/${repoName}/`,
    };
  } catch (err) {
    console.error("❌ GitHub Deploy Error:", err.message);
    throw err;
  }
}

export async function updateRepoAndRedeploy(task, updatedCode) {
  const repoName = `app-${task}`;
  const username = process.env.GITHUB_USERNAME;

  try {
    const content = Buffer.from(updatedCode).toString("base64");

    // Commit new version
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: username,
      repo: repoName,
      path: "index.html",
      message: "Round 2 update",
      content,
    });

    return {
      repoUrl: `https://github.com/${username}/${repoName}`,
      pagesUrl: `https://${username}.github.io/${repoName}/`,
    };
  } catch (err) {
    console.error("❌ GitHub Redeploy Error:", err.message);
    throw err;
  }
}
