import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Round 1 Generator
export async function generateApp(brief) {
  const prompt = `
You are an expert web app generator.
Build a minimal, working HTML + CSS + JS web app that fulfills this brief:
"${brief}"

Requirements:
- Must be a single-page static app (index.html)
- Include inline CSS & JS
- Must not require backend dependencies.
- Clean, readable, minimal code.
  `;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}
