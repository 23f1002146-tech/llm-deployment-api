import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handleRevision(brief) {
  const prompt = `
You are updating an existing web app according to this new revision request:
"${brief}"

Output the FULL updated code (index.html) including the modifications.
Keep it production-ready, simple, and minimal.
  `;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}
