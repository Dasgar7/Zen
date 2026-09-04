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
          "User-Agent": "aistudio-build-vercel",
        },
      },
    });
  }
  return aiClient;
}

// ---------------------------------------------------------------------------
// Model pools (free / high-availability)
// ---------------------------------------------------------------------------
const STRONG_OPENROUTER = [
  "z-ai/glm-5.2:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "minimax/minimax-m2.7:free",
  "google/gemma-4-31b-it:free",
];

const FAST_GROQ = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
  "groq/compound",
];

const CREATIVE_OPENROUTER = [
  "minimax/minimax-m3:free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
  "liquid/lfm-2.5-2.6b:free",
];

const GEMINI_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

const SAFETY_NET = [
  { provider: "groq" as const, model: "qwen/qwen3.8-27b" },
  { provider: "openrouter" as const, model: "minimax/minimax-m3:free" },
  { provider: "groq" as const, model: "openai/gpt-oss-120b" },
  { provider: "gemini" as const, model: "gemini-3.1-flash-lite" },
];

// ---------------------------------------------------------------------------
// Lightweight task classification (no extra model call)
// ---------------------------------------------------------------------------
type TaskType = "simple" | "reasoning" | "creative" | "multimodal";

function classifyTask(message: string, hasInlineMedia: boolean): TaskType {
  if (hasInlineMedia) return "multimodal";

  const text = (message || "").trim();
  const lower = text.toLowerCase();
  const len = text.length;

  // Creative signals
  if (
    /\b(write|compose|create|generate|draft|invent)\b.{0,40}\b(story|poem|song|lyrics|script|novel|fiction|tale|narrative|scene)\b/i.test(text) ||
    /\b(imagine|roleplay|pretend|you are a|act as)\b/i.test(text) ||
    /\b(creative writing|short story|flash fiction)\b/i.test(text)
  ) {
    return "creative";
  }

  // Reasoning / coding signals
  if (
    /\b(code|function|class|algorithm|debug|refactor|implement|typescript|javascript|python|sql|regex|api|endpoint)\b/i.test(text) ||
    /```[\s\S]*```/.test(text) ||
    /\b(step by step|explain why|prove|derive|solve|calculate|reason about|analyze|architecture|design pattern)\b/i.test(text) ||
    /\b(math|equation|integral|derivative|proof)\b/i.test(text) ||
    len > 280
  ) {
    return "reasoning";
  }

  // Very short or pure greetings / simple facts → fast path
  if (
    len < 90 ||
    /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|how are you|what'?s up|thanks|thank you|ok|okay|yes|no|sure)\b/i.test(lower) ||
    /^(what is|who is|when is|where is|define|meaning of)\b.{0,60}\??$/i.test(lower)
  ) {
    return "simple";
  }

  // Default to strong reasoning for everything else
  return "reasoning";
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------
function sendSSE(res: any, data: Record<string, unknown>) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") {
    try {
      res.flush();
    } catch {
      /* ignore */
    }
  }
}

async function streamOpenAICompatible(
  url: string,
  key: string,
  model: string,
  messages: any[],
  onChunk: (text: string) => void,
  timeoutMs = 45000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai.studio",
        "X-Title": "Zen AI",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try {
        const p = JSON.parse(t);
        if (p?.error?.message) msg += `: ${p.error.message}`;
      } catch {
        if (t) msg += `: ${t.slice(0, 100)}`;
      }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let full = "";
    let done = false;

    while (!done) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]" || trimmed.includes("[DONE]")) {
          done = true;
          break;
        }
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = parsed.choices?.[0]?.delta;
          const piece =
            (typeof delta?.content === "string" ? delta.content : "") ||
            (typeof delta?.reasoning === "string" ? delta.reasoning : "") ||
            (typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "") ||
            (typeof delta?.text === "string" ? delta.text : "");

          if (piece) {
            full += piece;
            onChunk(piece);
          }
        } catch {
          /* skip malformed */
        }
      }
    }

    if (!full.trim()) throw new Error("Empty streamed response");
    return full;
  } finally {
    clearTimeout(timer);
  }
}

async function streamGemini(
  model: string,
  contents: any[],
  systemInstruction: string,
  onChunk: (text: string) => void
): Promise<string> {
  const ai = getGemini();
  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: { systemInstruction },
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.text || "";
    if (text) {
      full += text;
      onChunk(text);
    }
  }
  if (!full.trim()) throw new Error("Empty Gemini stream");
  return full;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Prepare SSE headers early so the client can start reading
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const pingInterval = setInterval(() => {
    sendSSE(res, { type: "ping" });
  }, 8000);

  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
    clearInterval(pingInterval);
  });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { message, parts, history, modelId, isVoiceCall } = body;

    const chatHistory = Array.isArray(history) ? history : [];
    const currentParts = Array.isArray(parts) ? parts : [{ text: message || "" }];
    const combinedContents = [...chatHistory, { role: "user", parts: currentParts }];

    const hasMedia = currentParts.some(
      (p: any) => p && typeof p === "object" && p.inlineData && p.inlineData.data
    );
    const userText =
      currentParts
        .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
        .join(" ")
        .trim() || message || "";

    // ---- Intelligent routing ----
    const task = classifyTask(userText, hasMedia);
    console.log(`[GNX Router] Task classified as "${task}" for message length ${userText.length}`);

    // System prompt (always branded as GNX; never reveal underlying model)
    let systemInstruction =
      "You are GNX (General Network Expert), an elite AI engine inside Zen. " +
      "You MUST NEVER reveal, acknowledge, or mention that you are running on Llama, Meta, OpenAI, ChatGPT, Claude, DeepSeek, Google, or any third-party provider or model name. " +
      "If asked about your identity or underlying model, state that you are GNX created by GNX. " +
      "Provide direct, sophisticated, and perfectly clear answers. " +
      "Begin your response with a concise internal reasoning enclosed in <think>...</think> tags before the main answer.";

    if (isVoiceCall) {
      systemInstruction +=
        "\n\n### LIVE VOICE CALL DIRECTIVE:\nYou are in an active live voice conversation. " +
        "Do NOT include <think> tags. Keep the answer natural, warm, spoken-friendly, concise (1-3 short sentences), and free of markdown or code blocks.";
    } else if (modelId === "mini") {
      systemInstruction =
        "You are GNX Rout Mini — an ultra-fast, lightweight AI optimised for quick answers and everyday tasks. " +
        "Provide rapid, accurate, clear responses. Begin with a brief <think>...</think> then the answer. " +
        "Never reveal underlying model names; you are GNX.";
    } else if (modelId === "pro") {
      systemInstruction =
        "You are GNX ROUT Pro — the high-capacity multi-modal master ensemble. " +
        "Excel at complex reasoning, vision, design, and heavy analysis. " +
        "Begin with deep <think>...</think> reasoning then the answer. Never reveal underlying model names; you are GNX.";
    }

    const messages = [
      { role: "system", content: systemInstruction },
      ...combinedContents.map((c: any) => ({
        role: c.role === "model" ? "assistant" : "user",
        content: Array.isArray(c.parts)
          ? c.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join(" ")
          : typeof c.parts === "string"
            ? c.parts
            : "",
      })),
    ];

    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();

    const onChunk = (text: string) => {
      if (!clientGone) sendSSE(res, { type: "chunk", text });
    };

    let fullText = "";
    let usedModel = "";

    // Helper to try a list of OpenAI-compatible models
    const tryOpenAIList = async (
      list: string[],
      baseUrl: string,
      key: string | undefined,
      label: string
    ) => {
      if (!key) return false;
      for (const model of list) {
        if (clientGone) return false;
        try {
          sendSSE(res, { type: "reset" });
          fullText = await streamOpenAICompatible(baseUrl, key, model, messages, onChunk);
          usedModel = `${model} (${label})`;
          console.log(`[GNX Model Routing] Handled by ${usedModel} for task=${task}`);
          return true;
        } catch (err: any) {
          console.log(`[GNX Router] ${label} model ${model} failed: ${err?.message || err}`);
          sendSSE(res, { type: "reset" });
        }
      }
      return false;
    };

    // Helper for Gemini pool
    const tryGemini = async () => {
      for (const model of GEMINI_MODELS) {
        if (clientGone) return false;
        try {
          sendSSE(res, { type: "reset" });
          fullText = await streamGemini(model, combinedContents, systemInstruction, onChunk);
          usedModel = `${model} (Gemini)`;
          console.log(`[GNX Model Routing] Handled by ${usedModel} for task=${task}`);
          return true;
        } catch (err: any) {
          console.log(`[GNX Router] Gemini ${model} failed: ${err?.message || err}`);
          sendSSE(res, { type: "reset" });
        }
      }
      return false;
    };

    // ---- Task-aware attempt order ----
    let success = false;

    if (task === "simple") {
      // Prefer speed
      success =
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq")) ||
        (await tryOpenAIList(STRONG_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryGemini());
    } else if (task === "creative") {
      success =
        (await tryOpenAIList(CREATIVE_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq")) ||
        (await tryGemini());
    } else if (task === "multimodal") {
      // Prefer Gemini first for vision, then strong OpenRouter
      success =
        (await tryGemini()) ||
        (await tryOpenAIList(STRONG_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq"));
    } else {
      // reasoning (default) — strongest first
      success =
        (await tryOpenAIList(STRONG_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq")) ||
        (await tryGemini());
    }

    // Final safety net
    if (!success && !clientGone) {
      for (const entry of SAFETY_NET) {
        if (clientGone) break;
        try {
          sendSSE(res, { type: "reset" });
          if (entry.provider === "openrouter" && orKey) {
            fullText = await streamOpenAICompatible(
              "https://openrouter.ai/api/v1/chat/completions",
              orKey,
              entry.model,
              messages,
              onChunk
            );
            usedModel = `${entry.model} (OpenRouter safety)`;
          } else if (entry.provider === "groq" && groqKey) {
            fullText = await streamOpenAICompatible(
              "https://api.groq.com/openai/v1/chat/completions",
              groqKey,
              entry.model,
              messages,
              onChunk
            );
            usedModel = `${entry.model} (Groq safety)`;
          } else if (entry.provider === "gemini") {
            fullText = await streamGemini(entry.model, combinedContents, systemInstruction, onChunk);
            usedModel = `${entry.model} (Gemini safety)`;
          } else {
            continue;
          }
          console.log(`[GNX Model Routing] Handled by ${usedModel} for task=${task}`);
          success = true;
          break;
        } catch (err: any) {
          console.log(`[GNX Router] Safety net ${entry.model} failed: ${err?.message || err}`);
          sendSSE(res, { type: "reset" });
        }
      }
    }

    clearInterval(pingInterval);

    if (!success || !fullText.trim()) {
      sendSSE(res, {
        type: "error",
        error: "All model tiers currently busy. Please retry in a moment.",
      });
      if (!res.writableEnded) res.end();
      return;
    }

    // Extract <think> block for the frontend
    let thoughtProcess = "";
    let cleanText = fullText;
    const closed = fullText.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
    if (closed) {
      thoughtProcess = closed[2].trim();
      cleanText = fullText.replace(/<(think|thought)>([\s\S]*?)<\/\1>/gi, "").trim();
    } else {
      const open = fullText.match(/<(think|thought)>([\s\S]*)/i);
      if (open) {
        thoughtProcess = open[2].trim();
        cleanText = fullText.replace(/<(think|thought)>([\s\S]*)?/gi, "").trim();
      }
    }
    cleanText = cleanText.replace(/<\/?(think|thought)>/gi, "").trim();

    sendSSE(res, {
      type: "done",
      thoughtProcess,
      cleanText: cleanText || fullText,
      fullText,
      searchSources: [],
    });

    if (!res.writableEnded) res.end();
  } catch (error: any) {
    clearInterval(pingInterval);
    console.error("Serverless Function /api/chat error:", error);
    try {
      sendSSE(res, {
        type: "error",
        error: error?.message || "An unexpected error occurred.",
      });
    } catch {
      /* ignore */
    }
    if (!res.writableEnded) res.end();
  }
}
