import { GoogleGenAI } from "@google/genai";

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-vercel',
        }
      }
    });
  }
  return aiClient;
}

const LEVEL_1_PRIMARY_MODEL = "z-ai/glm-5.2:free";
const LEVEL_2_OPENROUTER_MODELS = [
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "minimax/minimax-m2.7:free",
  "liquid/lfm-2.5-2.6b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];
const LEVEL_3_GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "groq/compound",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
];
const LEVEL_4_GEMINI_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const LEVEL_5_SAFETY_NET_MODELS = [
  { provider: "groq", model: "qwen/qwen3.8-27b" },
  { provider: "openrouter", model: "minimax/minimax-m3:free" },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "gemini", model: "gemini-3.1-flash-lite" },
];

async function callOpenAICompatible(url: string, key: string, model: string, messages: any[]): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai.studio",
      "X-Title": "Zen AI",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let conciseMsg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(t);
      if (parsed?.error?.message) conciseMsg += `: ${parsed.error.message}`;
    } catch {
      if (t) conciseMsg += `: ${t.slice(0, 80)}`;
    }
    throw new Error(conciseMsg);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const text =
    (typeof choice?.message?.content === "string" ? choice.message.content : "") ||
    (typeof choice?.message?.reasoning === "string" ? choice.message.reasoning : "") ||
    (typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content : "") ||
    (typeof choice?.text === "string" ? choice.text : "");

  if (!text || !text.trim()) {
    throw new Error("Empty response");
  }
  return text;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { message, parts, history } = body;

    const chatHistory = Array.isArray(history) ? history : [];
    const currentParts = Array.isArray(parts) ? parts : [{ text: message || "" }];
    const combinedContents = [...chatHistory, { role: "user", parts: currentParts }];

    const systemInstruction = "You are GNX, an elite AI assistant inside Zen. Provide direct, sophisticated, and perfectly clear answers.";

    const messages = [
      { role: "system", content: systemInstruction },
      ...combinedContents.map((c: any) => ({
        role: c.role === "model" ? "assistant" : "user",
        content: Array.isArray(c.parts)
          ? c.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join(" ")
          : typeof c.parts === "string" ? c.parts : ""
      }))
    ];

    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();

    let replyText = "";

    // Level 1: Primary
    if (orKey) {
      try {
        replyText = await callOpenAICompatible("https://openrouter.ai/api/v1/chat/completions", orKey, LEVEL_1_PRIMARY_MODEL, messages);
        console.log(`[GNX Model Routing] Handled by Level 1: ${LEVEL_1_PRIMARY_MODEL} (OpenRouter)`);
      } catch {}
    }

    // Level 2: OpenRouter
    if (!replyText && orKey) {
      for (const m of LEVEL_2_OPENROUTER_MODELS) {
        try {
          replyText = await callOpenAICompatible("https://openrouter.ai/api/v1/chat/completions", orKey, m, messages);
          console.log(`[GNX Model Routing] Handled by Level 2: ${m} (OpenRouter)`);
          break;
        } catch {}
      }
    }

    // Level 3: Groq
    if (!replyText && groqKey) {
      for (const m of LEVEL_3_GROQ_MODELS) {
        try {
          replyText = await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", groqKey, m, messages);
          console.log(`[GNX Model Routing] Handled by Level 3: ${m} (Groq)`);
          break;
        } catch {}
      }
    }

    // Level 4: Gemini
    if (!replyText) {
      try {
        const ai = getGemini();
        for (const m of LEVEL_4_GEMINI_MODELS) {
          try {
            const result = await ai.models.generateContent({
              model: m,
              contents: combinedContents,
              config: { systemInstruction },
            });
            if (result.text && result.text.trim()) {
              replyText = result.text;
              console.log(`[GNX Model Routing] Handled by Level 4: ${m} (Gemini)`);
              break;
            }
          } catch {}
        }
      } catch {}
    }

    // Level 5: Safety Net
    if (!replyText) {
      for (const entry of LEVEL_5_SAFETY_NET_MODELS) {
        try {
          if (entry.provider === "openrouter" && orKey) {
            replyText = await callOpenAICompatible("https://openrouter.ai/api/v1/chat/completions", orKey, entry.model, messages);
            console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (OpenRouter)`);
            break;
          } else if (entry.provider === "groq" && groqKey) {
            replyText = await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", groqKey, entry.model, messages);
            console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (Groq)`);
            break;
          }
        } catch {}
      }
    }

    if (!replyText) {
      return res.status(503).json({ error: "All model tiers currently busy. Please retry in a moment." });
    }

    const updatedHistory = [
      ...chatHistory,
      { role: "user", parts: currentParts },
      { role: "model", parts: [{ text: replyText }] }
    ];

    return res.status(200).json({ text: replyText, history: updatedHistory });
  } catch (error: any) {
    console.error("Serverless Function /api/chat error:", error);
    return res.status(500).json({ 
      error: error?.message || "An unexpected error occurred." 
    });
  }
}
