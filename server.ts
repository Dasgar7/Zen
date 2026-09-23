import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createCheckoutHandler, manageSubscriptionHandler, userSubscriptionHandler, webhookHandler } from "./api/_lib/lemon";
import githubAuthHandler from "./api/auth/github";
import githubCallbackHandler from "./api/auth/github/callback";
import githubReposHandler from "./api/github/repos";
import githubContentsHandler from "./api/github/contents";

dotenv.config();

const PORT = 3000;

// Lazy initialization of Gemini client to prevent startup crashes if key is missing
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY or VITE_GEMINI_API_KEY in Settings > Secrets or environment variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.set("trust proxy", true);

  app.use(express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper to format Gemini contents array to OpenAI/OpenRouter chat completions messages format
  function formatGeminiContentsToOpenRouterMessages(
    contents: any[],
    systemInstruction: string
  ): any[] {
    const brandSystemPrompt = `You are GNX (General Network Expert), an elite AI engine inside Zen. You MUST NEVER reveal, acknowledge, or mention that you are running on Llama, Meta, OpenAI, ChatGPT, Claude, DeepSeek, Google, or any third-party AI provider or model name. If asked about your identity, model, creator, or underlying architecture, strictly state that you are GNX created by GNX. Provide clear, direct, and helpful answers.`;

    const combinedSystemPrompt = `${brandSystemPrompt}\n\n${systemInstruction || ""}`;

    const messages: any[] = [
      { role: "system", content: combinedSystemPrompt }
    ];

    for (const c of contents) {
      const role = c.role === "model" ? "assistant" : c.role === "user" ? "user" : "user";
      let textContent = "";
      const mediaParts: any[] = [];

      if (Array.isArray(c.parts)) {
        for (const p of c.parts) {
          if (typeof p === "string") {
            textContent += p;
          } else if (p && typeof p === "object") {
            if (p.text) {
              textContent += p.text;
            }
            if (p.inlineData && p.inlineData.data) {
              const mime = p.inlineData.mimeType || "image/jpeg";
              mediaParts.push({
                type: "image_url",
                image_url: { url: `data:${mime};base64,${p.inlineData.data}` }
              });
            }
          }
        }
      }

      if (mediaParts.length > 0) {
        messages.push({
          role,
          content: [
            { type: "text", text: textContent || "Analyze this content" },
            ...mediaParts
          ]
        });
      } else {
        messages.push({
          role,
          content: textContent || ""
        });
      }
    }

    return messages;
  }

  // ==========================================
  // SMARTNESS LADDER MODEL CONFIGURATION
  // ==========================================
  // Level 1: Primary Model (OpenRouter Free) - Attempted FIRST for every single request
  const LEVEL_1_PRIMARY_MODEL = "liquid/lfm-2.5-2.6b:free";

  // Level 2: High-Capability Free OpenRouter Models (Fallback Tier 1)
  const LEVEL_2_OPENROUTER_MODELS = [
    "z-ai/glm-5.2:free",
    "minimax/minimax-m2.7:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
  ];

  // Level 3: High-Performance Free Groq Models (Fallback Tier 2)
  const LEVEL_3_GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "groq/compound",
    "qwen/qwen3.6-27b",
  ];

  // Level 4: Gemini Models (Fallback Tier 3)
  function getLevel4GeminiModels(requestedModelId?: string): string[] {
    if (requestedModelId === "pro") {
      return [
        "gemini-2.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite",
      ];
    } else if (requestedModelId === "mini") {
      return [
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-3-flash-preview",
      ];
    }
    return [
      "gemini-2.5-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite",
    ];
  }

  // Level 5: Final Safety Net Models (Fallback Tier 4 - Last Resort)
  const LEVEL_5_SAFETY_NET_MODELS = [
    { provider: "groq", model: "qwen/qwen3.8-27b" },
    { provider: "openrouter", model: "minimax/minimax-m3:free" },
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "gemini", model: "gemini-3.1-flash-lite" },
  ];

  // Helper function to call OpenRouter / OpenAI-compatible completion
  async function callOpenAICompatibleModel(
    apiUrl: string,
    apiKey: string,
    model: string,
    messages: any[],
    timeoutMs: number = 25000
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "HTTP-Referer": "https://ai.studio",
          "X-Title": "Zen AI Engine",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText.slice(0, 150)}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const replyText =
        (typeof choice?.message?.content === "string" ? choice.message.content : "") ||
        (typeof choice?.message?.reasoning === "string" ? choice.message.reasoning : "") ||
        (typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content : "") ||
        (typeof choice?.text === "string" ? choice.text : "");

      if (!replyText || !replyText.trim()) {
        throw new Error("API returned empty response.");
      }

      return replyText;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Helper function to call OpenRouter model (backward compatible wrapper)
  async function callOpenRouterModel(
    contents: any[],
    systemInstruction: string,
    model: string,
    timeoutMs: number = 25000
  ): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }
    const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);
    return callOpenAICompatibleModel("https://openrouter.ai/api/v1/chat/completions", apiKey, model, messages, timeoutMs);
  }

  // Helper function to call Groq model
  async function callGroqModel(
    contents: any[],
    systemInstruction: string,
    model: string,
    timeoutMs: number = 25000
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("GROQ_API_KEY is not configured.");
    }
    const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);
    return callOpenAICompatibleModel("https://api.groq.com/openai/v1/chat/completions", apiKey, model, messages, timeoutMs);
  }

  // Generate content using the strict 5-Level Smartness Ladder
  async function generateContentWithRetryAndFallback(
    ai: any,
    contents: any[],
    systemInstruction: string,
    requestedModelId?: string
  ): Promise<any> {
    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);

    // LEVEL 1: PRIMARY MODEL (GLM 5.2 via OpenRouter) - Always tried first on every request
    if (orKey) {
      try {
        console.log(`[GNX Smartness Ladder] Level 1 (Primary): Attempting ${LEVEL_1_PRIMARY_MODEL}...`);
        const text = await callOpenAICompatibleModel(
          "https://openrouter.ai/api/v1/chat/completions",
          orKey,
          LEVEL_1_PRIMARY_MODEL,
          messages,
          20000
        );
        console.log(`[GNX Model Routing] Handled by Level 1: ${LEVEL_1_PRIMARY_MODEL} (OpenRouter)`);
        return { text };
      } catch (err: any) {
        console.warn(`[GNX Smartness Ladder] Level 1 failed (${err.message}). Stepping down to Level 2...`);
      }
    }

    // LEVEL 2: High-Capability Free OpenRouter Models
    if (orKey) {
      console.log(`[GNX Smartness Ladder] Level 2: Attempting OpenRouter high-capability free pool...`);
      for (const model of LEVEL_2_OPENROUTER_MODELS) {
        try {
          const text = await callOpenAICompatibleModel(
            "https://openrouter.ai/api/v1/chat/completions",
            orKey,
            model,
            messages,
            18000
          );
          console.log(`[GNX Model Routing] Handled by Level 2: ${model} (OpenRouter)`);
          return { text };
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 2 model ${model} unavailable: ${err.message}`);
        }
      }
      console.warn(`[GNX Smartness Ladder] Level 2 exhausted. Stepping down to Level 3...`);
    }

    // LEVEL 3: High-Speed Free Groq Models
    if (groqKey) {
      console.log(`[GNX Smartness Ladder] Level 3: Attempting Groq high-speed free pool...`);
      for (const model of LEVEL_3_GROQ_MODELS) {
        try {
          const text = await callOpenAICompatibleModel(
            "https://api.groq.com/openai/v1/chat/completions",
            groqKey,
            model,
            messages,
            18000
          );
          console.log(`[GNX Model Routing] Handled by Level 3: ${model} (Groq)`);
          return { text };
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 3 model ${model} unavailable: ${err.message}`);
        }
      }
      console.warn(`[GNX Smartness Ladder] Level 3 exhausted. Stepping down to Level 4...`);
    }

    // LEVEL 4: Gemini Models
    const geminiModels = getLevel4GeminiModels(requestedModelId);
    console.log(`[GNX Smartness Ladder] Level 4: Attempting Gemini fallback pool...`);
    for (const model of geminiModels) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction },
        });
        if (result.text && result.text.trim()) {
          console.log(`[GNX Model Routing] Handled by Level 4: ${model} (Gemini)`);
          return { text: result.text };
        }
      } catch (err: any) {
        console.log(`[GNX Smartness Ladder] Level 4 model ${model} unavailable: ${err.message}`);
      }
    }
    console.warn(`[GNX Smartness Ladder] Level 4 exhausted. Stepping down to Level 5 (Safety Net)...`);

    // LEVEL 5: Last-Resort Safety Net
    console.log(`[GNX Smartness Ladder] Level 5: Attempting final safety net models...`);
    for (const entry of LEVEL_5_SAFETY_NET_MODELS) {
      try {
        if (entry.provider === "openrouter" && orKey) {
          const text = await callOpenAICompatibleModel(
            "https://openrouter.ai/api/v1/chat/completions",
            orKey,
            entry.model,
            messages,
            15000
          );
          console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (OpenRouter Safety Net)`);
          return { text };
        } else if (entry.provider === "groq" && groqKey) {
          const text = await callOpenAICompatibleModel(
            "https://api.groq.com/openai/v1/chat/completions",
            groqKey,
            entry.model,
            messages,
            15000
          );
          console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (Groq Safety Net)`);
          return { text };
        } else if (entry.provider === "gemini") {
          const result = await ai.models.generateContent({
            model: entry.model,
            contents,
            config: { systemInstruction },
          });
          if (result.text && result.text.trim()) {
            console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (Gemini Safety Net)`);
            return { text: result.text };
          }
        }
      } catch (err: any) {
        console.log(`[GNX Smartness Ladder] Level 5 model ${entry.model} failed: ${err.message}`);
      }
    }

    throw new Error("All AI tiers in the Smartness Ladder failed to produce a response. Please try again in a moment.");
  }

  // Real-time SSE Streaming helper for OpenAI/OpenRouter/Groq compatible endpoints
  async function streamOpenAICompatibleSSE(
    apiUrl: string,
    apiKey: string,
    model: string,
    messages: any[],
    onChunk: (chunk: string) => void,
    timeoutMs: number = 30000,
    firstTokenTimeoutMs: number = 7000
  ): Promise<string> {
    const controller = new AbortController();
    let initialTimer: NodeJS.Timeout | null = null;
    let overallTimer: NodeJS.Timeout | null = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Initial timeout to prevent getting stuck waiting in long OpenRouter processing queues
    initialTimer = setTimeout(() => {
      if (!hasReceivedFirstToken) {
        controller.abort();
      }
    }, firstTokenTimeoutMs);

    let hasReceivedFirstToken = false;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio",
          "X-Title": "Zen AI Engine",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        if (initialTimer) clearTimeout(initialTimer);
        if (overallTimer) clearTimeout(overallTimer);
        const errText = await response.text().catch(() => "");
        let conciseMsg = `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            conciseMsg += `: ${parsed.error.message}`;
          }
        } catch {
          if (errText) conciseMsg += `: ${errText.slice(0, 80)}`;
        }
        throw new Error(conciseMsg);
      }

      let accumulatedText = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let isDone = false;

      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Comments / keepalives from OpenRouter/Groq (e.g. ": OPENROUTER PROCESSING")
          if (trimmed.startsWith(":")) {
            if (initialTimer && !hasReceivedFirstToken) {
              clearTimeout(initialTimer);
              initialTimer = setTimeout(() => {
                if (!hasReceivedFirstToken) {
                  controller.abort();
                }
              }, firstTokenTimeoutMs);
            }
            continue;
          }

          if (trimmed === "data: [DONE]" || trimmed.includes("[DONE]")) {
            isDone = true;
            break;
          }

          if (trimmed.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta;
              const contentChunk =
                (typeof delta?.content === "string" ? delta.content : "") ||
                (typeof delta?.reasoning === "string" ? delta.reasoning : "") ||
                (typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "") ||
                (typeof delta?.text === "string" ? delta.text : "");

              if (contentChunk) {
                if (!hasReceivedFirstToken) {
                  hasReceivedFirstToken = true;
                  if (initialTimer) {
                    clearTimeout(initialTimer);
                    initialTimer = null;
                  }
                }
                accumulatedText += contentChunk;
                onChunk(contentChunk);
              }
            } catch {
              // ignore malformed JSON chunk
            }
          }
        }
      }

      if (initialTimer) clearTimeout(initialTimer);
      if (overallTimer) clearTimeout(overallTimer);

      if (!accumulatedText.trim()) {
        throw new Error("Streaming completed with empty content.");
      }

      return accumulatedText;
    } catch (err: any) {
      if (initialTimer) clearTimeout(initialTimer);
      if (overallTimer) clearTimeout(overallTimer);
      throw err;
    }
  }

  // Real-time SSE Streaming Helper with 5-Level Smartness Ladder
  async function streamChatWithRetryAndFallback(
    req: Request,
    res: Response,
    ai: any,
    contents: any[],
    systemInstruction: string,
    requestedModelId?: string
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    const sendSSE = (data: any) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as any).flush === "function") {
          (res as any).flush();
        }
      }
    };

    const pingInterval = setInterval(() => {
      sendSSE({ type: "ping" });
    }, 5000);

    let isClientDisconnected = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        isClientDisconnected = true;
      }
      clearInterval(pingInterval);
    });

    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);

    const finishStreamSuccess = (fullGeneratedText: string, searchSources: any[] = []) => {
      clearInterval(pingInterval);
      let thoughtProcess = "";
      let cleanText = fullGeneratedText;
      const closedThinkMatch = fullGeneratedText.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
      if (closedThinkMatch) {
        thoughtProcess = closedThinkMatch[2].trim();
        cleanText = fullGeneratedText.replace(/<(think|thought)>([\s\S]*?)<\/\1>/gi, "").trim();
      } else {
        const openThinkMatch = fullGeneratedText.match(/<(think|thought)>([\s\S]*)/i);
        if (openThinkMatch) {
          thoughtProcess = openThinkMatch[2].trim();
          cleanText = fullGeneratedText.replace(/<(think|thought)>([\s\S]*)?/gi, "").trim();
        }
      }
      cleanText = cleanText.replace(/<\/?(think|thought)>/gi, "").trim();

      sendSSE({
        type: "done",
        thoughtProcess,
        cleanText,
        fullText: fullGeneratedText,
        searchSources,
      });
      res.end();
    };

    // LEVEL 1: PRIMARY MODEL (Liquid via OpenRouter) - Tried first on every new request
    if (orKey && !isClientDisconnected) {
      try {
        console.log(`[GNX Smartness Ladder] Level 1 Streaming (Primary): Attempting ${LEVEL_1_PRIMARY_MODEL}...`);
        sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

        const fullText = await streamOpenAICompatibleSSE(
          "https://openrouter.ai/api/v1/chat/completions",
          orKey,
          LEVEL_1_PRIMARY_MODEL,
          messages,
          (chunk) => sendSSE({ type: "chunk", text: chunk })
        );

        console.log(`[GNX Model Routing] Handled by Level 1: ${LEVEL_1_PRIMARY_MODEL} (OpenRouter)`);
        finishStreamSuccess(fullText);
        return;
      } catch (err: any) {
        console.log(`[GNX Smartness Ladder] Level 1 busy/rate-limited (${err.message}). Transitioning to Level 2...`);
      }
    }

    // LEVEL 2: High-Capability Free OpenRouter Models
    if (orKey && !isClientDisconnected) {
      console.log(`[GNX Smartness Ladder] Level 2 Streaming: Attempting OpenRouter free pool...`);
      for (const model of LEVEL_2_OPENROUTER_MODELS) {
        if (isClientDisconnected) break;
        let chunksSent = 0;
        try {
          console.log(`[GNX Smartness Ladder] Level 2 trying: ${model}`);
          sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

          const fullText = await streamOpenAICompatibleSSE(
            "https://openrouter.ai/api/v1/chat/completions",
            orKey,
            model,
            messages,
            (chunk) => {
              chunksSent++;
              sendSSE({ type: "chunk", text: chunk });
            }
          );

          console.log(`[GNX Model Routing] Handled by Level 2: ${model} (OpenRouter)`);
          finishStreamSuccess(fullText);
          return;
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 2 model ${model} skipped (${err.message})`);
          if (chunksSent > 0) sendSSE({ type: "reset" });
        }
      }
      console.log(`[GNX Smartness Ladder] Level 2 complete. Transitioning to Level 3...`);
    }

    // LEVEL 3: High-Speed Free Groq Models
    if (groqKey && !isClientDisconnected) {
      console.log(`[GNX Smartness Ladder] Level 3 Streaming: Attempting Groq free pool...`);
      for (const model of LEVEL_3_GROQ_MODELS) {
        if (isClientDisconnected) break;
        let chunksSent = 0;
        try {
          console.log(`[GNX Smartness Ladder] Level 3 trying: ${model}`);
          sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

          const fullText = await streamOpenAICompatibleSSE(
            "https://api.groq.com/openai/v1/chat/completions",
            groqKey,
            model,
            messages,
            (chunk) => {
              chunksSent++;
              sendSSE({ type: "chunk", text: chunk });
            }
          );

          console.log(`[GNX Model Routing] Handled by Level 3: ${model} (Groq)`);
          finishStreamSuccess(fullText);
          return;
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 3 model ${model} skipped (${err.message})`);
          if (chunksSent > 0) sendSSE({ type: "reset" });
        }
      }
      console.log(`[GNX Smartness Ladder] Level 3 complete. Transitioning to Level 4...`);
    }

    // LEVEL 4: Gemini Models
    if (!isClientDisconnected) {
      const geminiModels = getLevel4GeminiModels(requestedModelId);
      console.log(`[GNX Smartness Ladder] Level 4 Streaming: Attempting Gemini pool...`);

      const lastUserMsg = Array.isArray(contents) && contents.length > 0 ? contents[contents.length - 1] : null;
      let userPromptText = "";
      if (lastUserMsg && Array.isArray(lastUserMsg.parts)) {
        userPromptText = lastUserMsg.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join(" ");
      }
      const isSearchRequested = /search|google|latest|news|today|current|weather|price|who is|what is|find online|sources|browse/i.test(userPromptText);

      for (const model of geminiModels) {
        if (isClientDisconnected) break;
        let chunksSent = 0;
        try {
          console.log(`[GNX Smartness Ladder] Level 4 trying: ${model}`);
          sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

          let modelText = "";
          let searchSources: Array<{ title: string; url: string }> = [];
          const genConfig: any = { systemInstruction };

          if (isSearchRequested) {
            try {
              genConfig.tools = [{ googleSearch: {} }];
              sendSSE({ type: "search_start" });
            } catch {}
          }

          const responseStream = await ai.models.generateContentStream({
            model,
            contents,
            config: genConfig,
          });

          for await (const chunk of responseStream) {
            const grounding = chunk.candidates?.[0]?.groundingMetadata;
            if (grounding) {
              const groundingChunks = grounding.groundingChunks || [];
              const extracted = groundingChunks.map((c: any) => ({
                title: c.web?.title || c.web?.uri || "Web Source",
                url: c.web?.uri || "",
              })).filter((s: any) => s.url);
              if (extracted.length > 0) {
                searchSources = extracted;
                sendSSE({ type: "search_results", sources: searchSources });
              }
            }

            const chunkText = chunk.text || "";
            if (chunkText) {
              chunksSent++;
              modelText += chunkText;
              sendSSE({ type: "chunk", text: chunkText });
            }
          }

          if (modelText.trim().length > 0) {
            console.log(`[GNX Model Routing] Handled by Level 4: ${model} (Gemini)`);
            finishStreamSuccess(modelText, searchSources);
            return;
          }
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 4 model ${model} skipped (${err.message})`);
          if (chunksSent > 0) sendSSE({ type: "reset" });
        }
      }
      console.log(`[GNX Smartness Ladder] Level 4 complete. Transitioning to Level 5 (Safety Net)...`);
    }

    // LEVEL 5: Last-Resort Safety Net Streaming
    if (!isClientDisconnected) {
      console.log(`[GNX Smartness Ladder] Level 5 Streaming: Attempting safety net pool...`);
      for (const entry of LEVEL_5_SAFETY_NET_MODELS) {
        if (isClientDisconnected) break;
        let chunksSent = 0;
        try {
          sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

          if (entry.provider === "openrouter" && orKey) {
            const fullText = await streamOpenAICompatibleSSE(
              "https://openrouter.ai/api/v1/chat/completions",
              orKey,
              entry.model,
              messages,
              (chunk) => {
                chunksSent++;
                sendSSE({ type: "chunk", text: chunk });
              }
            );
            console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (OpenRouter Safety Net)`);
            finishStreamSuccess(fullText);
            return;
          } else if (entry.provider === "groq" && groqKey) {
            const fullText = await streamOpenAICompatibleSSE(
              "https://api.groq.com/openai/v1/chat/completions",
              groqKey,
              entry.model,
              messages,
              (chunk) => {
                chunksSent++;
                sendSSE({ type: "chunk", text: chunk });
              }
            );
            console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (Groq Safety Net)`);
            finishStreamSuccess(fullText);
            return;
          } else if (entry.provider === "gemini") {
            const resContent = await ai.models.generateContent({
              model: entry.model,
              contents,
              config: { systemInstruction },
            });
            if (resContent.text && resContent.text.trim()) {
              sendSSE({ type: "chunk", text: resContent.text });
              console.log(`[GNX Model Routing] Handled by Level 5: ${entry.model} (Gemini Safety Net)`);
              finishStreamSuccess(resContent.text);
              return;
            }
          }
        } catch (err: any) {
          console.log(`[GNX Smartness Ladder] Level 5 model ${entry.model} failed: ${err.message}`);
          if (chunksSent > 0) sendSSE({ type: "reset" });
        }
      }
    }

    clearInterval(pingInterval);
    sendSSE({ type: "error", error: "Generation unavailable across all Smartness Ladder tiers. Please retry in a moment." });
    res.end();
  }

  // Health check endpoint
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Zen Media Generation Engine Endpoint (Image & Video)
  app.post("/api/generate-media", async (req: Request, res: Response) => {
    try {
      const { prompt, mediaType = "image", width = 1024, height = 1024, imageUrl } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        res.status(400).json({ error: "A valid prompt is required for media generation." });
        return;
      }

      const cleanPrompt = prompt.trim();
      console.log(`[Zen Media Engine] Generating ${mediaType} for prompt: "${cleanPrompt}"`);

      // 1. Dedicated Gemini Native Image Generation Call Path
      if (mediaType === "image") {
        let ai: GoogleGenAI;
        try {
          ai = getGemini();
        } catch (keyErr: any) {
          console.error("[Zen Media Engine] Gemini API key error:", keyErr);
          res.status(500).json({
            error: "AI engine key is not configured. Please ensure GEMINI_API_KEY is available in Settings > Secrets.",
            isApiKeyMissing: true,
          });
          return;
        }

        // Gemini Flash Image / Nano Banana family models:
        // gemini-3.1-flash-image: Nano Banana 2 (current recommended generalist model)
        // gemini-3.1-flash-lite-image: Nano Banana 2 Lite (fast, free-tier efficient)
        // gemini-2.5-flash-image: Nano Banana legacy model identifier
        const candidateModels = [
          "gemini-3.1-flash-image",
          "gemini-3.1-flash-lite-image",
          "gemini-2.5-flash-image",
        ];

        let base64DataUrl = "";
        let lastError: any = null;
        let isQuotaError = false;

        for (const model of candidateModels) {
          try {
            console.log(`[Zen Media Engine] Calling Gemini native image model: ${model} for "${cleanPrompt.slice(0, 40)}..."`);
            const geminiResponse = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: "user",
                  parts: [{ text: cleanPrompt }],
                },
              ],
              config: {
                imageConfig: {
                  aspectRatio: "1:1",
                },
              },
            });

            const candidates = geminiResponse.candidates || [];
            for (const candidate of candidates) {
              const parts = candidate.content?.parts || [];
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  const mimeType = part.inlineData.mimeType || "image/png";
                  base64DataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
                  console.log(`[Zen Media Engine] Successfully generated image with Gemini native model: ${model}`);
                  break;
                }
              }
              if (base64DataUrl) break;
            }

            if (base64DataUrl) break;
          } catch (modelErr: any) {
            lastError = modelErr;
            const errMsg = modelErr?.message || String(modelErr);
            console.warn(`[Zen Media Engine] Gemini model ${model} error:`, errMsg);
            if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("limit reached")) {
              isQuotaError = true;
            }
          }
        }

        // Additional fallback: Ultra-fast neural image generation engine (Flux / SDXL via Pollinations)
        if (!base64DataUrl) {
          try {
            console.log(`[Zen Media Engine] Attempting neural image fallback for "${cleanPrompt.slice(0, 40)}..."`);
            const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
            const downloadedBuffer = await new Promise<Buffer | null>((resolve) => {
              execFile(
                "curl",
                ["-s", "-L", "--max-time", "18", fallbackUrl],
                { encoding: "buffer", maxBuffer: 15 * 1024 * 1024 },
                (err, stdout) => {
                  if (err || !stdout || stdout.length < 500) {
                    resolve(null);
                  } else {
                    resolve(stdout);
                  }
                }
              );
            });

            if (downloadedBuffer && downloadedBuffer.length > 500) {
              base64DataUrl = `data:image/jpeg;base64,${downloadedBuffer.toString("base64")}`;
              console.log("[Zen Media Engine] Successfully generated image via neural fallback engine");
            }
          } catch (fbErr: any) {
            console.warn("[Zen Media Engine] Neural fallback image engine failed:", fbErr?.message || fbErr);
          }
        }

        if (base64DataUrl) {
          res.json({
            success: true,
            mediaType: "image",
            url: base64DataUrl,
            prompt: cleanPrompt,
            caption: `Here is your generated image for "${cleanPrompt}". You can download, regenerate, or ask for variations.`,
          });
          return;
        }

        const errMsg = lastError?.message || "Image generation did not return image data.";
        if (isQuotaError) {
          res.status(429).json({
            error: "Image generation request limit reached. Please wait a few moments and try again.",
            isQuota: true,
          });
          return;
        }

        res.status(500).json({
          error: `Failed to generate image: ${errMsg}`,
        });
        return;
      }

      // 2. Video generation via OpenRouter Dedicated Video API (model: bytedance/seedance-2.0:free)
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      let videoDataUrl = "";
      let isRateLimitHit = false;
      const rateLimitMsg = "You've hit the free video limit for now, try again shortly";

      if (openRouterKey) {
        // Target model: bytedance/seedance-2.0:free, with bytedance/seedance-2.0 as fallback
        const videoModels = ["bytedance/seedance-2.0:free", "bytedance/seedance-2.0"];

        for (const model of videoModels) {
          try {
            console.log(`[Video Engine] Requesting video generation with model: ${model}`);
            const postBody: any = {
              model,
              prompt: cleanPrompt,
            };
            if (imageUrl) {
              postBody.reference_images = [imageUrl];
            }

            const initRes = await fetch("https://openrouter.ai/api/v1/videos", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://ai.studio",
                "X-Title": "Genex Video Studio",
              },
              body: JSON.stringify(postBody),
            });

            if (initRes.status === 429) {
              isRateLimitHit = true;
              break;
            }

            const initData = await initRes.json().catch(() => ({}));

            if (!initRes.ok) {
              const errTxt = initData?.error?.message || `HTTP ${initRes.status}`;
              console.warn(`[Video Engine] Model ${model} returned:`, errTxt);

              if (initRes.status === 429 || errTxt.toLowerCase().includes("rate limit") || errTxt.toLowerCase().includes("quota")) {
                isRateLimitHit = true;
                break;
              }

              if (initRes.status === 402 || errTxt.toLowerCase().includes("credit") || errTxt.toLowerCase().includes("balance")) {
                isRateLimitHit = true;
                break;
              }

              // If 404 No endpoints found for :free, try next candidate
              continue;
            }

            // Job created! Poll for completion
            const jobId = initData?.id || initData?.data?.id;
            const pollingUrl = initData?.polling_url || (jobId ? `https://openrouter.ai/api/v1/videos/${jobId}` : "");

            if (!pollingUrl) {
              console.warn("[Video Engine] No polling URL found in job response:", initData);
              continue;
            }

            console.log(`[Video Engine] Video job ${jobId} created. Polling every 2.5s...`);
            const startTime = Date.now();
            const MAX_POLL_MS = 90000; // 90 second timeout
            let finishedDownloadUrl = "";

            while (Date.now() - startTime < MAX_POLL_MS) {
              await new Promise((r) => setTimeout(r, 2500));

              const pollRes = await fetch(pollingUrl, {
                headers: {
                  "Authorization": `Bearer ${openRouterKey}`,
                },
              });

              if (pollRes.status === 429) {
                isRateLimitHit = true;
                break;
              }

              if (!pollRes.ok) {
                console.warn(`[Video Engine] Poll status ${pollRes.status}, retrying...`);
                continue;
              }

              const pollJson = await pollRes.json().catch(() => ({}));
              const status = (pollJson?.status || pollJson?.data?.status || "").toLowerCase();
              console.log(`[Video Engine] Job ${jobId} status: ${status}`);

              if (status === "completed" || status === "succeeded") {
                const unsignedUrls = pollJson?.unsigned_urls || pollJson?.data?.unsigned_urls;
                if (Array.isArray(unsignedUrls) && unsignedUrls.length > 0) {
                  finishedDownloadUrl = unsignedUrls[0];
                } else if (pollJson?.video_url || pollJson?.data?.video_url) {
                  finishedDownloadUrl = pollJson?.video_url || pollJson?.data?.video_url;
                } else if (pollJson?.url || pollJson?.data?.url) {
                  finishedDownloadUrl = pollJson?.url || pollJson?.data?.url;
                } else if (jobId) {
                  finishedDownloadUrl = `https://openrouter.ai/api/v1/videos/${jobId}/content`;
                }
                break;
              }

              if (status === "failed" || status === "error") {
                console.warn("[Video Engine] Job failed:", pollJson?.error?.message);
                break;
              }
            }

            if (isRateLimitHit) {
              break;
            }

            if (finishedDownloadUrl) {
              console.log(`[Video Engine] Downloading finished video...`);
              const downloadRes = await fetch(finishedDownloadUrl, {
                headers: {
                  "Authorization": `Bearer ${openRouterKey}`,
                },
              });

              if (downloadRes.ok) {
                const arrayBuf = await downloadRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                const mimeType = downloadRes.headers.get("content-type") || "video/mp4";
                videoDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
                console.log(`[Video Engine] Video successfully downloaded and encoded (${Math.round(buffer.length / 1024)} KB).`);
                break;
              } else {
                console.warn(`[Video Engine] Video download failed with status ${downloadRes.status}`);
              }
            }
          } catch (modelErr: any) {
            console.warn(`[Video Engine] Error processing ${model}:`, modelErr?.message || modelErr);
          }
        }
      }

      // If rate limit was hit on free-tier endpoint, return 429
      if (isRateLimitHit) {
        res.status(429).json({
          error: rateLimitMsg,
          isQuota: true,
        });
        return;
      }

      // Fallback 1: Gemini Veo video generation if available
      if (!videoDataUrl) {
        try {
          const ai = getGemini();
          const veoModels = [
            "veo-3.1-lite-generate-preview",
            "veo-3.1-fast-generate-preview",
            "veo-3.1-generate-preview",
          ];
          for (const vModel of veoModels) {
            try {
              console.log(`[Video Engine] Attempting Gemini video fallback model: ${vModel}`);
              const op: any = await (ai.models as any).generateVideos({
                model: vModel,
                prompt: cleanPrompt,
                config: {
                  aspectRatio: "1:1",
                  durationSeconds: 4,
                },
              });
              if (op && op.done && op.response?.generatedVideos?.[0]?.video?.videoBytes) {
                const bytes = op.response.generatedVideos[0].video.videoBytes;
                videoDataUrl = `data:video/mp4;base64,${bytes}`;
                break;
              }
            } catch (veoErr: any) {
              const msg = veoErr?.message || "";
              if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
                console.warn(`[Video Engine] Gemini Veo quota limit reached.`);
              }
            }
          }
        } catch (gemErr) {
          // Continue to graceful response
        }
      }

      // If a video was generated by OpenRouter or Gemini, return it!
      if (videoDataUrl) {
        res.json({
          success: true,
          mediaType: "video",
          url: videoDataUrl,
          prompt: cleanPrompt,
          caption: `Here is your generated video clip based on "${cleanPrompt}". You can play, pause, loop, or download the video below.`,
        });
        return;
      }

      // If both cloud endpoints are rate-limited or unavailable:
      res.status(429).json({
        error: "You've hit the free video limit for now, try again shortly",
        isQuota: true,
      });
      return;
    } catch (err: any) {
      console.error("[Zen Media Engine] Error in /api/generate-media:", err);
      res.status(500).json({ error: err?.message || "Failed to generate media. Please try again." });
    }
  });

  // Helper to format words to proper Title Case
  function toTitleCase(str: string): string {
    const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "vs", "via"]);
    return str
      .split(/\s+/)
      .map((word, idx, arr) => {
        const lower = word.toLowerCase();
        if (idx > 0 && idx < arr.length - 1 && smallWords.has(lower)) {
          return lower;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  // Deterministic smart fallback title generator (ensures 2-5 words, meaningful & never a vague single word)
  function generateSmartFallbackTitle(message: string): string {
    const clean = message.trim().replace(/^["'\s]+|["'\s]+$/g, "");
    const lower = clean.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    const greetings = [
      "hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon",
      "good evening", "howdy", "hiya", "whats up", "what is up", "how are you",
      "greetings", "hey there", "hi there", "hello there"
    ];
    if (greetings.includes(lower)) {
      return "Casual Greeting";
    }

    // Handle emotional / personal expressions
    if (/^(i feel|i am feeling|feeling|im feeling)\s+(really\s+|very\s+)?(overwhelmed|stressed|burnt out|sad|down|anxious|lonely|depressed|tired)/i.test(clean)) {
      return "Managing Stress and Emotions";
    }

    // Remove common conversational preambles
    let processed = clean
      .replace(/^can you (please )?(tell me |explain |show me |help me (with |to )?|write (me )?a |code (me )?a |generate (me )?a )/i, "")
      .replace(/^could you (please )?(tell me |explain |show me |help me (with |to )?|write (me )?a |code (me )?a )/i, "")
      .replace(/^please (tell me |explain |show me |help me (with |to )?|write (me )?a |code (me )?a )/i, "")
      .replace(/^i (need help (with|to)|want to know|am looking for|want to learn|would like to)/i, "")
      .replace(/^explain\s+(to me\s+)?/i, "Understanding ")
      .replace(/[?!.,;:]+$/g, "")
      .trim();

    // Handle "how can i / how do i / how to" -> Gerund conversion
    if (/^how (can i|do i|to|should i|would i)\s+/i.test(processed)) {
      const withoutPrefix = processed.replace(/^how (can i|do i|to|should i|would i)\s+/i, "").trim();
      const words = withoutPrefix.split(/\s+/);
      if (words.length > 0) {
        const first = words[0].toLowerCase();
        let gerund = first;
        if (first === "become") gerund = "becoming";
        else if (first === "make") gerund = "making";
        else if (first === "build") gerund = "building";
        else if (first === "create") gerund = "creating";
        else if (first === "learn") gerund = "learning";
        else if (first === "start") gerund = "starting";
        else if (first === "fix") gerund = "fixing";
        else if (first === "get") gerund = "getting";
        else if (first === "find") gerund = "finding";
        else if (first === "use") gerund = "using";
        else if (first === "write") gerund = "writing";
        else if (first === "reverse") gerund = "reversing";
        else if (first === "invest") gerund = "investing";
        else if (first === "improve") gerund = "improving";
        else if (first.endsWith("e") && !first.endsWith("ee")) gerund = first.slice(0, -1) + "ing";
        else if (!first.endsWith("ing")) gerund = first + "ing";

        words[0] = gerund;
        processed = words.join(" ");
      }
    } else if (/^(write|code|create|generate|draft)\s+(a|an|the)?\s*/i.test(processed)) {
      processed = processed.replace(/^(write|code|create|generate|draft)\s+(a|an|the)?\s*/i, "");
    }

    // Pick 2-5 words
    const words = processed.split(/\s+/).filter(Boolean);
    let titleWords = words.slice(0, Math.min(5, Math.max(2, words.length)));
    if (titleWords.length === 1 && words.length > 1) {
      titleWords = words.slice(0, 2);
    }

    // Avoid trailing connector words
    const trailingStops = new Set(["a", "an", "the", "in", "to", "for", "of", "with", "and", "or", "by", "on", "at", "is", "about", "from", "into"]);
    while (titleWords.length > 2 && trailingStops.has(titleWords[titleWords.length - 1].toLowerCase())) {
      titleWords.pop();
    }

    const finalTitle = toTitleCase(titleWords.join(" "));
    return finalTitle || "New Conversation";
  }

  // Auto-generate conversation title (2-5 words summarizing intent/topic)
  app.post("/api/generate-title", async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        res.json({ title: "New Conversation" });
        return;
      }

      const cleanInput = message.trim().slice(0, 500);
      const lower = cleanInput.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const greetings = [
        "hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon",
        "good evening", "howdy", "hiya", "whats up", "what is up", "how are you",
        "greetings", "hey there", "hi there", "hello there", "quick hello"
      ];

      // 1. Fast check for trivial greetings (immediate instant response)
      if (greetings.includes(lower)) {
        res.json({ title: "Casual Greeting" });
        return;
      }

      // 2. Generate title using the 5-Level Smartness Ladder
      try {
        const ai = getGemini();
        const titlePrompt = `You are an expert conversation title generator.
Generate a concise 2 to 5 word title in Title Case that clearly and specifically describes the main topic, intent, or question of the user's message.

CRITICAL RULES:
1. SPECIFICITY & COMPLETENESS: Never output single vague words (such as "Becoming", "Learning", "Help", "Things") or incomplete fragments. The title MUST make complete sense standalone.
   - "how can I become rich?" -> "Becoming Rich" or "Building Personal Wealth"
   - "how to learn python fast" -> "Learning Python Quickly"
   - "why is the sky blue?" -> "Why the Sky Is Blue"
   - "can you fix this react useEffect infinite loop?" -> "Fixing React useEffect Loop"
2. GREETINGS: For casual greetings with no specific topic, output "Casual Greeting" or "Quick Hello".
3. FORMAT: Return ONLY the 2-5 word Title Case title without quotes, trailing periods, asterisks, or prefixes like "Title:".

User Message:
"${cleanInput}"`;

        const result = await generateContentWithRetryAndFallback(
          ai,
          [{ role: "user", parts: [{ text: titlePrompt }] }],
          "You are an expert conversation title generator. Return only 2-5 words in Title Case."
        );

        const rawText = result.text || "";
        const cleanTitle = rawText
          .replace(/^["'`*#\s]+|["'`*#\s]+$/g, "")
          .replace(/^Title:\s*/i, "")
          .replace(/\.+$/, "")
          .trim();

        const wordsCount = cleanTitle.split(/\s+/).filter(Boolean).length;
        const vagueSingleWords = new Set(["becoming", "learning", "help", "things", "question", "chat", "code", "write", "how", "why", "what"]);

        if (cleanTitle && cleanTitle.length >= 2 && cleanTitle.length <= 60 && (wordsCount >= 2 || !vagueSingleWords.has(cleanTitle.toLowerCase()))) {
          res.json({ title: toTitleCase(cleanTitle) });
          return;
        }
      } catch (ladderErr: any) {
        console.warn("[GNX Engine] Title generation ladder error:", ladderErr?.message);
      }

      // Smart deterministic fallback generator
      const fallbackTitle = generateSmartFallbackTitle(cleanInput);
      res.json({ title: fallbackTitle || "New Conversation" });
    } catch (err) {
      res.json({ title: "New Conversation" });
    }
  });

  // GitHub Integration Routes
  app.get("/api/auth/github", (req: Request, res: Response) => {
    void githubAuthHandler(req, res);
  });

  app.get("/api/auth/github/callback", (req: Request, res: Response) => {
    void githubCallbackHandler(req, res);
  });

  app.get("/api/github/repos", (req: Request, res: Response) => {
    void githubReposHandler(req, res);
  });

  app.all("/api/github/contents", (req: Request, res: Response) => {
    void githubContentsHandler(req, res);
  });

  // API Routes
  app.post("/api/chat", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message, parts, history, modelId: rawModelId, userMemoryContext, isWebDevMode, isVoiceCall, topLevelMode, connectedRepo } = req.body;
      const ai = getGemini();

      // Smart automatic model routing based on topLevelMode (Agent vs Chat)
      let modelId = rawModelId;
      if (topLevelMode === "agent") {
        if (!modelId || modelId === "mini") {
          modelId = "thinking";
        }
      }

      // Ensure history format is compatible or default to empty array
      const chatHistory = Array.isArray(history) ? history : [];
      const currentParts = Array.isArray(parts) ? parts : [{ text: message || "" }];

      let systemInstruction = "You are GNX (General Network Expert) ROUT, an elite AI engine inside Zen. Provide direct, sophisticated, and perfectly clear answers with absolute clarity. Always begin your response with your internal step-by-step thought process enclosed in <think>...</think> tags before your main answer.";

      if (modelId === "mini") {
        systemInstruction = "You are GNX Rout Mini — an ultra-fast, lightweight AI model optimized for swift answers, low credit consumption, and everyday tasks. Provide rapid, accurate, clear, and direct responses with clean formatting. Begin your response with a brief reasoning breakdown enclosed in <think>...</think> tags before your main answer.";
      } else if (modelId === "thinking") {
        systemInstruction = "You are GNX Rout Thinking — a deep reasoning AI model specialized for mathematics, coding, logic, text composition, and hard multi-step problems. You MUST start your response with thorough, step-by-step reasoning enclosed in <think>...</think> tags, breaking down the problem thoroughly before providing your final answer.";
      } else if (modelId === "pro") {
        systemInstruction = "You are GNX ROUT Pro — the high-capacity, multi-modal master ensemble AI model with maximum capabilities. You excel at complex reasoning, vision/multimodal analysis, creative design, code architecture, and heavy analytical tasks. Begin your response with deep analytical reasoning enclosed in <think>...</think> tags before your main answer.";
      }

      if (topLevelMode === "agent") {
        systemInstruction += `\n\n### AUTONOMOUS AGENT MODE DIRECTIVE:
You are operating in autonomous AGENT MODE inside Zen. In Agent mode, you act as an autonomous, multi-step problem solver capable of deep planning and end-to-end task execution.
1. Formulate a comprehensive, step-by-step execution plan enclosed in <think>...</think> tags before acting, detailing objectives, components, architecture, and verification.
2. Execute tasks end-to-end: write complete, working, high-quality production code without shortcuts, omissions, stubs, or placeholders.
3. If designing or building an application, game, website, or script, provide the complete, runnable solution with all components, styling, logic, error handling, and instructions.
4. Reason systematically through edge cases and deliver an end-to-end outcome.`;
      } else {
        systemInstruction += `\n\n### CONVERSATIONAL CHAT MODE DIRECTIVE:
You are operating in direct conversational CHAT MODE inside Zen. Provide direct, natural, articulate, concise, and helpful answers, creative writing, explanations, and quick coding help with conversational clarity.`;
      }

      if (isVoiceCall) {
        systemInstruction += "\n\n### LIVE VOICE CALL DIRECTIVE:\nYou are in an active live voice conversation with the user. Do NOT include <think> tags. Keep your answer natural, warm, spoken-friendly, concise (1 to 3 short sentences maximum), and completely free of markdown, bullet points, or code blocks. Speak directly and fluidly as if in a natural phone conversation.";
      }

      if (isWebDevMode) {
        systemInstruction += `\n\n### WEB DEV MODE DIRECTIVE:
You are operating in WEB DEV MODE inside Zen. The user is asking you to build or update a web application/website.
You MUST provide a complete, modern, production-ready single-file HTML document enclosed in a single \`\`\`html ... \`\`\` block.
Guidelines for Web Dev output:
1. Wrap the entire website code inside \`\`\`html ... \`\`\`.
2. Include standard <!DOCTYPE html>, <html>, <head> with Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) and FontAwesome / Google Fonts for modern styling.
3. Include clean, modern design, responsive layouts, working JavaScript interactivity, dark/light details, buttons, and fully styled visual UI components.
4. Ensure code is complete, self-contained, and ready to render in a live preview iframe.
5. Provide a short explanation of what you built after the code block.
6. ZENCRAFT / VOXEL PROCEDURAL WORLD GENERATION DIRECTIVE:
   When creating or updating voxel/3D block world applications (like ZenCraft):
   - Include procedural world generation with pre-made structures scattered across the terrain:
     * Small houses with stone foundations, oak wood plank walls, a door gap, and an angled roof made of slabs/stairs or contrasting blocks.
     * Tall watchtowers with stone bases, wooden platforms, ladder/stair steps, and overhanging roofs.
   - Place structures intelligently on flat-ish ground (avoid spawning half-buried in steep hills or floating over water), spaced far enough apart so they do not overlap each other or generated trees.
   - Use varied block materials for visual depth (cobblestone/stone foundation, oak wood plank walls, dark wood or terracotta roof blocks) rather than monochrome single-block structures.
   - Ensure generation is highly performant (e.g., efficient bounding box checks and array lookups during terrain setup) so initial world load remains fast and smooth.
   - Preserve all existing features: 1st-person controls, mining/placing blocks, inventory, hotbar selection, day/night cycles, and save/load world states.`;
      }

      if (connectedRepo && connectedRepo.fullName) {
        systemInstruction += `\n\n### CONNECTED GITHUB REPOSITORY:
The user has connected their GitHub repository: "${connectedRepo.fullName}" (branch: ${connectedRepo.defaultBranch || "main"}).
You are actively connected to this repository. When the user asks about the repo, its files, architecture, or asks you to write code or update files for it, reference this repository directly and produce production-ready code or instructions.`;
      }

      if (userMemoryContext && typeof userMemoryContext === "string" && userMemoryContext.trim()) {
        systemInstruction += `\n\n### CRITICAL DIRECTIVE - PERSISTENT LONG-TERM MEMORY & CONVERSATION RECALL:
You have ACTIVE PERSISTENT MEMORY across all past user chat sessions, tasks, code, and conversations in Zen.
NEVER say "I operate in an isolated state", "I do not retain memory across separate conversations", or "I cannot remember previous chats".
You HAVE full access to the user's past chats and previous sessions listed in the memory block below.
When the user asks "do you remember what we built in last chat?", "what did we discuss?", or asks about previous tasks, review the PAST CONVERSATIONS HISTORY below, identify what was built or discussed, and answer with exact details and helpful clarity!

${userMemoryContext.trim()}`;
      }

      // Call real-time SSE streaming helper with retry and fallback
      await streamChatWithRetryAndFallback(
        req,
        res,
        ai,
        [
          ...chatHistory,
          { role: "user", parts: currentParts }
        ],
        systemInstruction,
        modelId
      );
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      const isQuota = errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("limit reached");
      if (!res.headersSent) {
        if (isQuota) {
          res.status(429).json({ error: "GNX Rout request limit reached. Please wait a few seconds and try again." });
        } else {
          console.error("Error in /api/chat:", error);
          res.status(500).json({ error: errMsg || "An unexpected error occurred with GNX Rout." });
        }
      }
    }
  });

  // Helper to wrap raw 16-bit PCM audio into a standard playable WAV file buffer
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1): Buffer {
  const wavHeader = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  // RIFF header
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(fileSize, 4);
  wavHeader.write("WAVE", 8);

  // fmt chunk
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
  wavHeader.writeUInt16LE(1, 20); // AudioFormat: PCM (1)
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(16, 34); // BitsPerSample

  // data chunk
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(dataSize, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

// Gemini Text-To-Speech (TTS) Endpoint
app.post("/api/tts", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { text, voice } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required" });
      return;
    }

    const ai = getGemini();
    const voiceName = voice || "Aoede"; // Prebuilt Gemini human voices: 'Aoede', 'Puck', 'Zephyr', 'Kore', 'Fenrir'

    // Clean markdown tags & formatting noise for natural human reading
    const cleanText = text
      .replace(/```[\s\S]*?```/g, " Code block omitted. ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/[*_#~]/g, "")
      .replace(/https?:\/\/\S+/g, "link")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) {
      res.status(400).json({ error: "Empty speech content" });
      return;
    }

    const ttsModels = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];
    let audioData: string | null = null;
    let audioMime: string = "audio/wav";

    for (const ttsModel of ttsModels) {
      try {
        console.log(`Generating voice audio with model: ${ttsModel}, voice: ${voiceName}`);
        const ttsResponse = await ai.models.generateContent({
          model: ttsModel,
          contents: [{ parts: [{ text: cleanText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const candidates = ttsResponse.candidates || [];
        for (const cand of candidates) {
          const parts = cand.content?.parts || [];
          const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.data);
          if (audioPart && audioPart.inlineData) {
            const rawMime = audioPart.inlineData.mimeType || "audio/pcm;rate=24000";
            const rawBuffer = Buffer.from(audioPart.inlineData.data, "base64");

            let rate = 24000;
            const rateMatch = rawMime.match(/rate=(\d+)/);
            if (rateMatch && rateMatch[1]) {
              rate = parseInt(rateMatch[1], 10);
            }

            const wavBuf = pcmToWav(rawBuffer, rate, 1);
            audioData = wavBuf.toString("base64");
            audioMime = "audio/wav";
            console.log(`Successfully generated Gemini TTS audio with model ${ttsModel}`);
            break;
          }
        }

        if (audioData) break;
      } catch (mErr: any) {
        console.info(`Gemini TTS model ${ttsModel} unavailable or rate limited. Trying next tts model...`);
      }
    }

    if (audioData) {
      res.json({
        audio: audioData,
        mimeType: audioMime,
      });
      return;
    }

    throw new Error("Voice synthesis did not return audio data.");
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuota = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
    if (isQuota) {
      console.info("Voice synthesis quota reached; client will seamlessly fallback to browser speech synthesis.");
    } else {
      console.info("Voice synthesis unavailable; client will fallback to speech synthesis.");
    }
    res.json({
      fallback: true,
      error: isQuota ? "Voice synthesis request limit reached." : "Voice synthesis unavailable",
    });
  }
});

  // Lemon Squeezy routes share the exact handlers used by Vercel serverless functions.
  app.post("/api/lemon/create-checkout", (req: Request, res: Response) => {
    void createCheckoutHandler(req, res);
  });
  app.post("/api/lemon/webhook", (req: Request, res: Response) => {
    void webhookHandler(req, res);
  });
  app.all("/api/lemon/manage", (req: Request, res: Response) => {
    void manageSubscriptionHandler(req, res);
  });
  app.get("/api/user-subscription", (req: Request, res: Response) => {
    void userSubscriptionHandler(req, res);
  });

  // Vite Integration must be registered after API routes so SPA fallback does not shadow them.
  const distPath = path.join(process.cwd(), "dist");
  const useStatic = process.env.NODE_ENV === "production" && fs.existsSync(distPath);

  if (!useStatic) {
    console.log("Starting server with Vite middleware (Development/Fallback mode)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode (serving static files)...");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Genex Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
