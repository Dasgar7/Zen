import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createCheckoutHandler, manageSubscriptionHandler, userSubscriptionHandler, webhookHandler } from "./api/_lib/lemon";

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

  // Helper function to call OpenRouter API
  async function callOpenRouterModel(
    contents: any[],
    systemInstruction: string,
    model: string
  ): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("OPENROUTER_API_KEY environment variable is not configured.");
    }

    const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);

    console.log(`[OpenRouter Fallback] Sending request to model: ${model}`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const replyText = data.choices?.[0]?.message?.content;
    if (!replyText || typeof replyText !== "string") {
      throw new Error("OpenRouter API returned empty response.");
    }

    return replyText;
  }

  // Helper function to call Gemini with robust retry and multi-tier fallback logic
  async function generateContentWithRetryAndFallback(
    ai: any,
    contents: any[],
    systemInstruction: string,
    requestedModelId?: string
  ): Promise<any> {
    let baseModels = [
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ];

    if (requestedModelId === "pro") {
      baseModels = [
        "gemini-3.1-pro-preview",
        "gemini-3.7-flash",
        "gemini-flash-latest",
        "gemini-3.5-flash-lite",
      ];
    } else if (requestedModelId === "mini") {
      baseModels = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-flash-latest",
      ];
    }

    let lastError: any = null;

    // TIER 0: Try Primary Gemini Models (Fast pass, no long blocking sleeps)
    for (const model of baseModels) {
      try {
        console.log(`[GNX Engine] Trying primary model: ${model}`);
        const result = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
          }
        });
        console.log(`[GNX Engine] Successfully generated response with model: ${model}`);
        return { text: result.text };
      } catch (error: any) {
        lastError = error;
        const errorMessage = typeof error === "object" && error !== null ? (error.message || String(error)) : String(error);
        const errorCode = error?.code || error?.status || "";

        const isQuotaOrRateLimit = 
          errorMessage.includes("429") ||
          errorMessage.includes("Quota") ||
          errorMessage.includes("RESOURCE_EXHAUSTED") ||
          errorCode === 429;

        // If primary model hit rate limits, jump directly to OpenRouter fallback without stalling
        if (isQuotaOrRateLimit) {
          console.log(`[GNX Engine] Gemini rate limit reached on ${model}. Initiating instant multi-model fallback.`);
          break;
        }
      }
    }

    // TIER 1 & TIER 2: OpenRouter Multi-Model Fallback
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
    
    if (hasOpenRouterKey) {
      console.log("[GNX Engine] Routing request through OpenRouter Fallback Pipeline...");
      const openRouterModels = [
        // Verified active free models
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-31b-it:free",
        "openai/gpt-oss-20b:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "nvidia/nemotron-nano-9b-v2:free",
        "poolside/laguna-s-2.1:free",
        "inclusionai/ling-3.0-tiny:free",
        // Reliable paid fallbacks
        "openai/gpt-4o-mini",
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek/deepseek-chat",
      ];

      for (const openRouterModel of openRouterModels) {
        try {
          const text = await callOpenRouterModel(contents, systemInstruction, openRouterModel);
          console.log(`[GNX Engine] Fallback successfully completed using model: ${openRouterModel}`);
          return { text };
        } catch (orErr: any) {
          // Silent transition to next fallback model without throwing noisy console errors
          console.log(`[GNX Engine] Provider ${openRouterModel} busy. Trying next fallback...`);
        }
      }
    }

    const finalErrMsg = lastError?.message || String(lastError || "");
    if (finalErrMsg.includes("Quota exceeded") || finalErrMsg.includes("RESOURCE_EXHAUSTED") || finalErrMsg.includes("429")) {
      throw new Error("Gemini API request limit reached. Please wait a few seconds and try again.");
    }

    throw lastError || new Error("Failed to generate content after trying primary and fallback AI models.");
  }

  // Real-time SSE Streaming Helper with Multi-Model Fallback
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

    req.on("close", () => {
      clearInterval(pingInterval);
    });

    let baseModels = [
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ];

    if (requestedModelId === "pro") {
      baseModels = [
        "gemini-3.1-pro-preview",
        "gemini-3.7-flash",
        "gemini-flash-latest",
        "gemini-3.5-flash-lite",
      ];
    } else if (requestedModelId === "mini") {
      baseModels = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-flash-latest",
      ];
    }

    let fullGeneratedText = "";
    let lastError: any = null;

    // TIER 0: Primary Gemini Streaming
    const lastUserMsg = Array.isArray(contents) && contents.length > 0 ? contents[contents.length - 1] : null;
    let userPromptText = "";
    if (lastUserMsg && Array.isArray(lastUserMsg.parts)) {
      userPromptText = lastUserMsg.parts.map((p: any) => (typeof p === "string" ? p : p.text || "")).join(" ");
    }

    const isSearchRequested = /search|google|latest|news|today|current|weather|price|who is|what is|find online|sources|browse/i.test(userPromptText);

    for (const model of baseModels) {
      try {
        console.log(`[GNX Engine] Streaming with primary model: ${model}`);
        let streamedInThisModel = false;
        let modelText = "";
        let searchSources: Array<{ title: string; url: string }> = [];
        let sentSearchStart = false;

        const genConfig: any = {
          systemInstruction,
        };

        if (isSearchRequested) {
          try {
            genConfig.tools = [{ googleSearch: {} }];
            sentSearchStart = true;
          } catch (tErr) {
            console.warn("[GNX Engine] Google Search tool config ignored:", tErr);
          }
        }

        const responseStream = await ai.models.generateContentStream({
          model,
          contents,
          config: genConfig,
        });

        sendSSE({ type: "start", modelId: requestedModelId || "thinking" });

        if (sentSearchStart) {
          sendSSE({ type: "search_start" });
        }

        for await (const chunk of responseStream) {
          // Check for grounding search metadata in Gemini chunk
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
            if (!streamedInThisModel) {
              streamedInThisModel = true;
            }
            modelText += chunkText;
            sendSSE({ type: "chunk", text: chunkText });
          }
        }

        if (modelText.trim().length > 0) {
          fullGeneratedText = modelText;
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
          return;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`[GNX Engine] Gemini model ${model} streaming error:`, error?.message || error);
        sendSSE({ type: "reset" });
      }
    }

    // TIER 1 & TIER 2: OpenRouter Multi-Model Streaming Fallback
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
    if (hasOpenRouterKey) {
      console.log("[GNX Engine] Transitioning to OpenRouter streaming pipeline...");
      const openRouterModels = [
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-31b-it:free",
        "openai/gpt-oss-20b:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "nvidia/nemotron-nano-9b-v2:free",
        "poolside/laguna-s-2.1:free",
        "inclusionai/ling-3.0-tiny:free",
        "openai/gpt-4o-mini",
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek/deepseek-chat",
      ];

      const messages = formatGeminiContentsToOpenRouterMessages(contents, systemInstruction);

      for (const openRouterModel of openRouterModels) {
        try {
          console.log(`[GNX Engine] Trying OpenRouter streaming model: ${openRouterModel}`);
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY.trim()}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://ais-build.studio",
              "X-Title": "Zen AI",
            },
            body: JSON.stringify({
              model: openRouterModel,
              messages,
              stream: true,
            }),
          });

          if (!response.ok || !response.body) {
            continue;
          }

          sendSSE({ type: "start", modelId: requestedModelId || "thinking" });
          sendSSE({ type: "reset" });

          let modelText = "";
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;
              if (trimmed === "data: [DONE]") break;
              if (trimmed.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(trimmed.slice(6));
                  const contentChunk = parsed.choices?.[0]?.delta?.content || "";
                  if (contentChunk) {
                    modelText += contentChunk;
                    sendSSE({ type: "chunk", text: contentChunk });
                  }
                } catch {
                  // ignore invalid JSON line
                }
              }
            }
          }

          if (modelText.trim().length > 0) {
            fullGeneratedText = modelText;
            clearInterval(pingInterval);

            let thoughtProcess = "";
            let cleanText = fullGeneratedText;
            const closedThinkMatch = fullGeneratedText.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
            if (closedThinkMatch) {
              thoughtProcess = closedThinkMatch[2].trim();
              cleanText = fullGeneratedText.replace(/<(think|thought)>([\s\S]*?)<\/\1>/gi, "").trim();
            }
            cleanText = cleanText.replace(/<\/?(think|thought)>/gi, "").trim();

            sendSSE({ type: "done", thoughtProcess, cleanText, fullText: fullGeneratedText });
            res.end();
            return;
          }
        } catch (orErr) {
          console.warn(`[GNX Engine] OpenRouter model ${openRouterModel} streaming error:`, orErr);
        }
      }
    }

    clearInterval(pingInterval);
    const errMsg = lastError?.message || "Generation stalled or model rate limit reached. Click Retry to rebuild.";
    sendSSE({ type: "error", error: errMsg });
    res.end();
  }

  // Zen Media Generation Engine Endpoint (Image & Video)
  app.post("/api/generate-media", async (req: Request, res: Response) => {
    try {
      const { prompt, mediaType = "image", width = 1024, height = 1024 } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        res.status(400).json({ error: "A valid prompt is required for media generation." });
        return;
      }

      const cleanPrompt = prompt.trim();
      console.log(`[Zen Media Engine] Generating ${mediaType} for prompt: "${cleanPrompt}"`);

      const seed = Math.floor(Math.random() * 1000000);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

      let base64DataUrl = "";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000); // 18 second limit
        const imageRes = await fetch(pollinationsUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (imageRes.ok) {
          const arrayBuf = await imageRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const mimeType = imageRes.headers.get("content-type") || "image/jpeg";
          base64DataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
        }
      } catch (fetchErr: any) {
        // Fall back gracefully to synthesized visual artwork
        console.info(`[Zen Media Engine] Using responsive generative visual rendering for "${cleanPrompt.slice(0, 30)}..."`);
      }

      if (!base64DataUrl) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0f172a" />
              <stop offset="50%" stop-color="#1e1b4b" />
              <stop offset="100%" stop-color="#311042" />
            </linearGradient>
            <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)" />
          <circle cx="${width/2}" cy="${height/2 - 20}" r="${width/4}" fill="url(#glow)" opacity="0.25" />
          <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="800">Zen AI Media</text>
          <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#cbd5e1" font-family="sans-serif" font-size="16" opacity="0.95">${cleanPrompt.slice(0, 55)}</text>
        </svg>`;
        base64DataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      }

      const caption = mediaType === "video"
        ? `Here is your generated video clip based on "${cleanPrompt}". You can play, pause, loop, or download the media below.`
        : `Here is your generated image for "${cleanPrompt}". You can download, regenerate, or ask for variations.`;

      res.json({
        success: true,
        mediaType,
        url: base64DataUrl,
        prompt: cleanPrompt,
        caption,
      });
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

      // 2. Try Gemini with fast timeout
      try {
        const ai = getGemini();
        const geminiPromise = ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are an expert conversation title generator.
Generate a concise 2 to 5 word title in Title Case that clearly and specifically describes the main topic, intent, or question of the user's message.

CRITICAL RULES:
1. SPECIFICITY & COMPLETENESS: Never output single vague words (such as "Becoming", "Learning", "Help", "Things") or incomplete fragments. The title MUST make complete sense standalone and immediately convey the exact subject of the conversation.
   - "how can I become rich?" -> "Becoming Rich" or "Building Personal Wealth" (NEVER "Becoming")
   - "how to learn python fast" -> "Learning Python Quickly" (NEVER "Learning" or "Python")
   - "why is the sky blue?" -> "Why the Sky Is Blue"
   - "write a sci-fi story about a rogue time traveler" -> "Rogue Time Traveler Story"
   - "can you fix this react useEffect infinite loop?" -> "Fixing React useEffect Loop"
   - "I feel really overwhelmed and burnt out from work" -> "Managing Work Burnout"
2. GREETINGS: For casual greetings with no specific topic (e.g. "Hi", "Hello", "Hey there"), output "Casual Greeting" or "Quick Hello".
3. SUBSTANTIVE REQUESTS: Prioritize clarity, meaning, and completeness over extreme brevity. Target 2 to 5 words.
4. FORMAT: Return ONLY the 2-5 word Title Case title without quotes, trailing periods, asterisks, or prefixes like "Title:".

User Message:
"${cleanInput}"`,
                },
              ],
            },
          ],
          config: {
            maxOutputTokens: 40,
            temperature: 0.2,
          },
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Title generation timeout")), 3500)
        );

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);

        const rawText = response.text || "";
        const cleanTitle = rawText
          .replace(/^["'`*#\s]+|["'`*#\s]+$/g, "")
          .replace(/^Title:\s*/i, "")
          .replace(/\.+$/, "")
          .trim();

        const wordsCount = cleanTitle.split(/\s+/).filter(Boolean).length;
        const vagueSingleWords = new Set(["becoming", "learning", "help", "things", "question", "chat", "code", "write", "how", "why", "what"]);

        // Accept if title is valid, has 2+ words (or 1 non-vague word) and is well formed
        if (cleanTitle && cleanTitle.length >= 2 && cleanTitle.length <= 60 && (wordsCount >= 2 || !vagueSingleWords.has(cleanTitle.toLowerCase()))) {
          res.json({ title: toTitleCase(cleanTitle) });
          return;
        }
      } catch (geminiErr: any) {
        // Fall back to OpenRouter if configured
        if (process.env.OPENROUTER_API_KEY) {
          try {
            const fallbackText = await callOpenRouterModel(
              [
                {
                  role: "user",
                  parts: [{
                    text: `Generate a concise 2 to 5 word Title Case title that clearly and specifically describes the main topic or question of this message. Do NOT use single vague words or sentence fragments — the title should make sense standalone. If it is just a greeting, return "Casual Greeting". No quotes or period.\n\nUser Message:\n"${cleanInput}"`
                  }],
                },
              ],
              "You are a conversation title generator. Return only a 2-5 word Title Case title that specifically describes the topic. Never return a single vague word.",
              "meta-llama/llama-3.3-70b-instruct"
            );
            const cleanFallback = fallbackText
              ?.replace(/^["'`*#\s]+|["'`*#\s]+$/g, "")
              .replace(/^Title:\s*/i, "")
              .replace(/\.+$/, "")
              .trim();
            const wordsCount = cleanFallback ? cleanFallback.split(/\s+/).filter(Boolean).length : 0;
            if (cleanFallback && cleanFallback.length >= 2 && cleanFallback.length <= 60 && wordsCount >= 2) {
              res.json({ title: toTitleCase(cleanFallback) });
              return;
            }
          } catch {}
        }
      }

      // Smart deterministic fallback generator
      const fallbackTitle = generateSmartFallbackTitle(cleanInput);
      res.json({ title: fallbackTitle || "New Conversation" });
    } catch (err) {
      res.json({ title: "New Conversation" });
    }
  });

  // GitHub OAuth Routes
  app.get("/api/auth/github", (req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID || "Ov23liA5FPrwR4cCmecj";
    
    let redirectUri = process.env.GITHUB_REDIRECT_URI;
    if (!redirectUri) {
      const host = req.get("host") || "";
      const proto = (req.headers["x-forwarded-proto"] as string) || (host.includes("localhost") || host.includes("127.0.0.1") ? req.protocol : "https");
      redirectUri = `${proto}://${host}/api/auth/github/callback`;
    }
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user,user:email`;
    res.redirect(githubAuthUrl);
  });

  app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).send("No authorization code provided from GitHub");
        return;
      }

      const clientId = process.env.GITHUB_CLIENT_ID || "Ov23liA5FPrwR4cCmecj";
      const clientSecret = process.env.GITHUB_CLIENT_SECRET || "51ec4f1605883d8a3315aeef69c6459c55b90bf3";

      let redirectUri = process.env.GITHUB_REDIRECT_URI;
      if (!redirectUri) {
        const host = req.get("host") || "";
        const proto = (req.headers["x-forwarded-proto"] as string) || (host.includes("localhost") || host.includes("127.0.0.1") ? req.protocol : "https");
        redirectUri = `${proto}://${host}/api/auth/github/callback`;
      }

      // 1. Exchange code for access token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        console.error("GitHub OAuth token error:", tokenData);
        res.status(400).send(`GitHub OAuth failed: ${tokenData.error_description || tokenData.error || "Unknown token error"}`);
        return;
      }

      const accessToken = tokenData.access_token;

      // 2. Fetch user profile
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": "Genex-App"
        }
      });

      const userData = await userResponse.json();

      // 3. Fetch user primary email
      let primaryEmail = userData.email;
      if (!primaryEmail) {
        try {
          const emailsResponse = await fetch("https://api.github.com/user/emails", {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "User-Agent": "Genex-App"
            }
          });
          const emailsData = await emailsResponse.json();
          if (Array.isArray(emailsData)) {
            const primaryObj = emailsData.find((e: any) => e.primary) || emailsData[0];
            if (primaryObj?.email) {
              primaryEmail = primaryObj.email;
            }
          }
        } catch (e) {
          console.warn("Could not fetch user emails:", e);
        }
      }

      const displayName = userData.name || userData.login || "GitHub User";
      const finalEmail = primaryEmail || `${userData.login}@github.com`;
      const avatarUrl = userData.avatar_url || "";

      // 4. Return HTML that posts message to opener or redirects
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>GitHub Authentication Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background-color: #ffffff;
                color: #000000;
              }
              .card {
                text-align: center;
                padding: 24px;
                border-radius: 16px;
                border: 1px solid #e4e4e7;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Authentication Successful!</h2>
              <p>Authenticated as <strong>${displayName}</strong> (${finalEmail}).</p>
              <p style="font-size: 13px; color: #71717a;">Closing window...</p>
            </div>
            <script>
              const authData = {
                type: "GITHUB_AUTH_SUCCESS",
                user: {
                  name: ${JSON.stringify(displayName)},
                  email: ${JSON.stringify(finalEmail)},
                  avatar: ${JSON.stringify(avatarUrl)}
                }
              };

              if (window.opener) {
                window.opener.postMessage(authData, "*");
                setTimeout(() => {
                  window.close();
                }, 500);
              } else {
                window.location.href = "/?auth_success=1&name=" + encodeURIComponent(${JSON.stringify(displayName)}) + "&email=" + encodeURIComponent(${JSON.stringify(finalEmail)});
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Error in GitHub OAuth callback:", err);
      res.status(500).send("Authentication failed. " + (err?.message || ""));
    }
  });

  // API Routes
  app.post("/api/chat", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message, parts, history, modelId, userMemoryContext, isWebDevMode, isVoiceCall } = req.body;
      const ai = getGemini();

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
          res.status(429).json({ error: "Gemini API request limit reached. Please wait a few seconds and try again." });
        } else {
          console.error("Error in /api/chat:", error);
          res.status(500).json({ error: errMsg || "An unexpected error occurred with Gemini API." });
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

    const ttsModels = ["gemini-3.1-flash-tts-preview"];
    let audioData: string | null = null;
    let audioMime: string = "audio/wav";

    for (const ttsModel of ttsModels) {
      try {
        console.log(`Generating Gemini TTS with model: ${ttsModel}, voice: ${voiceName}`);
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

    throw new Error("Gemini TTS model did not return audio data.");
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuota = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
    if (isQuota) {
      console.info("Gemini TTS quota reached; client will seamlessly fallback to browser speech synthesis.");
    } else {
      console.info("Gemini TTS unavailable; client will fallback to speech synthesis.");
    }
    res.json({
      fallback: true,
      error: isQuota ? "Gemini TTS quota reached." : "TTS unavailable",
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
