import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { generateApp } from "./services/llmGenerator.js";
import { createRepoAndDeploy, updateRepoAndRedeploy } from "./services/github.js";
import { notifyEvaluation } from "./utils/notify.js";
import { handleRevision } from "./services/revision.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET;

// Round 1: BUILD
app.post("/api/build", async (req, res) => {
  try {
    const { secret, email, task, round, nonce, brief, evaluation_url } = req.body;

    if (secret !== SECRET) return res.status(401).json({ error: "Invalid secret" });
    if (round !== 1) return res.status(400).json({ error: "Round must be 1" });

    console.log(`⚙️ Round 1: Building ${task}`);

    // 1️⃣ Generate minimal app using OpenAI
    const appCode = await generateApp(brief);

    // 2️⃣ Deploy to GitHub Pages
    const repoInfo = await createRepoAndDeploy(task, appCode);

    // 3️⃣ Notify evaluation API
    await notifyEvaluation(evaluation_url, {
      email,
      task,
      round,
      nonce,
      ...repoInfo,
    });

    res.status(200).json({ success: true, round, ...repoInfo });
  } catch (err) {
    console.error("❌ Round 1 Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Round 2: REVISE
app.post("/api/revise", async (req, res) => {
  try {
    const { secret, email, task, round, nonce, brief, evaluation_url } = req.body;

    if (secret !== SECRET) return res.status(401).json({ error: "Invalid secret" });
    if (round !== 2) return res.status(400).json({ error: "Round must be 2" });

    console.log(`🧩 Round 2: Revising ${task}`);

    // 1️⃣ Generate updated code suggestion using LLM
    const newCode = await handleRevision(brief);

    // 2️⃣ Update and redeploy repo
    const repoInfo = await updateRepoAndRedeploy(task, newCode);

    // 3️⃣ Notify evaluator
    await notifyEvaluation(evaluation_url, {
      email,
      task,
      round,
      nonce,
      ...repoInfo,
    });

    res.status(200).json({ success: true, round, ...repoInfo });
  } catch (err) {
    console.error("❌ Round 2 Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

