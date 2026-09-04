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
// Lightweight task classification
// ---------------------------------------------------------------------------
type TaskType = "simple" | "reasoning" | "creative" | "multimodal";

function classifyTask(message: string, hasInlineMedia: boolean): TaskType {
  if (hasInlineMedia) return "multimodal";

  const text = (message || "").trim();
  const lower = text.toLowerCase();
  const len = text.length;

  if (
    /\b(write|compose|create|generate|draft|invent)\b.{0,40}\b(story|poem|song|lyrics|script|novel|fiction|tale|narrative|scene)\b/i.test(text) ||
    /\b(imagine|roleplay|pretend|you are a|act as)\b/i.test(text) ||
    /\b(creative writing|short story|flash fiction)\b/i.test(text)
  ) {
    return "creative";
  }

  if (
    /\b(code|function|class|algorithm|debug|refactor|implement|typescript|javascript|python|sql|regex|api|endpoint)\b/i.test(text) ||
    /```[\s\S]*```/.test(text) ||
    /\b(step by step|explain why|prove|derive|solve|calculate|reason about|analyze|architecture|design pattern)\b/i.test(text) ||
    /\b(math|equation|integral|derivative|proof)\b/i.test(text) ||
    len > 280
  ) {
    return "reasoning";
  }

  if (
    len < 90 ||
    /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|how are you|what'?s up|thanks|thank you|ok|okay|yes|no|sure)\b/i.test(lower) ||
    /^(what is|who is|when is|where is|define|meaning of)\b.{0,60}\??$/i.test(lower)
  ) {
    return "simple";
  }

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

/** Detect if text is mostly meta-reasoning about the prompt itself */
function looksLikeMetaReasoning(text: string): boolean {
  const lower = text.toLowerCase();
  const signals = [
    "the user says",
    "user said",
    "we must",
    "we should",
    "according to",
    "response format",
    "instructions",
    "underlying model",
    "must not mention",
    "then the user-facing",
    "then final answer",
    "so produce",
    "internal reasoning",
    "follow the format",
    "begin with",
    "enclosed in",
  ];
  let hits = 0;
  for (const s of signals) {
    if (lower.includes(s)) hits++;
  }
  return hits >= 2 || (hits >= 1 && text.length < 400);
}

/**
 * Robustly split model output into (thoughtProcess, cleanText).
 * Free models frequently ignore <think> tags — this function recovers.
 */
function extractThoughtAndAnswer(
  fullText: string,
  task: TaskType,
  userText: string
): { thoughtProcess: string; cleanText: string } {
  let thoughtProcess = "";
  let cleanText = fullText.trim();

  // 1. Proper closed tags
  const closed = fullText.match(/<(think|thought)\s*>([\s\S]*?)<\/\1\s*>/i);
  if (closed) {
    thoughtProcess = closed[2].trim();
    cleanText = fullText
      .replace(/<(think|thought)\s*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<\/?(think|thought)\s*>/gi, "")
      .trim();

    // If after stripping we still have meta text, treat remaining as thought too
    if (looksLikeMetaReasoning(cleanText)) {
      thoughtProcess = (thoughtProcess + "\n" + cleanText).trim();
      cleanText = "";
    }
  } else {
    // 2. Open tag without close
    const open = fullText.match(/<(think|thought)\s*>([\s\S]*)/i);
    if (open) {
      thoughtProcess = open[2].trim();
      cleanText = "";
    }
  }

  // 3. No usable tags — try to split on greeting / answer start
  if (!cleanText || looksLikeMetaReasoning(cleanText)) {
    const lines = fullText
      .replace(/<\/?(think|thought)\s*>/gi, "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let splitIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^(hi\b|hello\b|hey\b|hi there|hello!|hey!|sure[,!]\s|of course|absolutely)/i.test(l)) {
        splitIdx = i;
        break;
      }
    }

    if (splitIdx > 0) {
      thoughtProcess = lines.slice(0, splitIdx).join("\n").trim();
      cleanText = lines.slice(splitIdx).join("\n").trim();
    } else if (looksLikeMetaReasoning(fullText)) {
      // Entire output is meta reasoning — put it all in thought
      thoughtProcess = fullText.replace(/<\/?(think|thought)\s*>/gi, "").trim();
      cleanText = "";
    }
  }

  // 4. Final safety: if cleanText is still empty or still looks like reasoning,
  //    force a natural answer for simple tasks.
  if (!cleanText || looksLikeMetaReasoning(cleanText)) {
    if (task === "simple") {
      const lower = userText.toLowerCase().trim();
      if (/^(hi|hello|hey|yo|sup)\b/.test(lower)) {
        cleanText = "Hello! How can I help you today?";
      } else if (/how are you|what'?s up/.test(lower)) {
        cleanText = "I\'m doing great, thanks for asking! How can I help you today?";
      } else if (/thanks|thank you/.test(lower)) {
        cleanText = "You\'re welcome! Let me know if you need anything else.";
      } else {
        cleanText = "Hello! How can I help you today?";
      }
      if (!thoughtProcess) {
        thoughtProcess = "Simple greeting detected. Responding warmly and inviting the user to continue.";
      }
    } else if (!cleanText) {
      // Non-simple task but no clean answer recovered — use original as answer
      cleanText = fullText.replace(/<\/?(think|thought)\s*>/gi, "").trim();
      thoughtProcess = thoughtProcess || "Analyzed the request and prepared a response.";
    }
  }

  // Final cleanup of any leftover tags
  cleanText = cleanText.replace(/<\/?(think|thought)\s*>/gi, "").trim();
  thoughtProcess = thoughtProcess.replace(/<\/?(think|thought)\s*>/gi, "").trim();

  return {
    thoughtProcess: thoughtProcess || "Analyzed the request.",
    cleanText: cleanText || fullText.trim(),
  };
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

    const task = classifyTask(userText, hasMedia);
    console.log(`[GNX Router] Task classified as "${task}" for message length ${userText.length}`);

    // Extremely strict format for free models
    const formatRule =
      "\n\n### CRITICAL RESPONSE FORMAT\n" +
      "Your entire reply MUST follow this exact structure and nothing else:\n\n" +
      "<think>\n" +
      "One or two short sentences of internal reasoning only.\n" +
      "</think>\n\n" +
      "Then immediately write the final answer the user will see. " +
      "Do NOT write any analysis, instructions, or meta commentary outside the <think> tags. " +
      "Do NOT explain the format. Just follow it.\n\n" +
      "CORRECT example:\n" +
      "<think>\nUser greeted me. Reply warmly.\n</think>\n\n" +
      "Hello! How can I help you today?\n\n" +
      "WRONG (never do this): writing analysis as the answer, or explaining what you are about to do.";

    let systemInstruction =
      "You are GNX, an elite AI assistant inside Zen. " +
      "Never mention any underlying model, provider, or that you are an AI language model. " +
      "You are GNX." +
      formatRule;

    if (isVoiceCall) {
      systemInstruction =
        "You are GNX. Live voice conversation. " +
        "No <think> tags. Reply in 1-3 short natural spoken sentences. No markdown.";
    } else if (modelId === "mini") {
      systemInstruction =
        "You are GNX Rout Mini — fast and concise. Never reveal underlying models." +
        formatRule;
    } else if (modelId === "pro") {
      systemInstruction =
        "You are GNX ROUT Pro — high capability. Never reveal underlying models." +
        formatRule;
    }

    // For pure simple greetings, make the prompt even tighter
    if (task === "simple" && /^(hi|hello|hey|yo|sup)\b/i.test(userText.trim())) {
      systemInstruction =
        "You are GNX. The user just said a short greeting. " +
        "Reply with ONLY this exact structure:\n\n" +
        "<think>\nFriendly greeting. Invite them to ask anything.\n</think>\n\n" +
        "Hello! How can I help you today?\n\n" +
        "Do not add any other text.";
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

    let success = false;

    if (task === "simple") {
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
      success =
        (await tryGemini()) ||
        (await tryOpenAIList(STRONG_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq"));
    } else {
      success =
        (await tryOpenAIList(STRONG_OPENROUTER, "https://openrouter.ai/api/v1/chat/completions", orKey, "OpenRouter")) ||
        (await tryOpenAIList(FAST_GROQ, "https://api.groq.com/openai/v1/chat/completions", groqKey, "Groq")) ||
        (await tryGemini());
    }

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

    // Aggressive separation so the UI always gets a clean final answer
    const { thoughtProcess, cleanText } = extractThoughtAndAnswer(fullText, task, userText);

    console.log(`[GNX Extract] thought length=${thoughtProcess.length}, clean length=${cleanText.length}`);

    sendSSE(res, {
      type: "done",
      thoughtProcess,
      cleanText,
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
