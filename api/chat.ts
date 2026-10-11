/**
 * ============================================================================
 * ZEN AI CHAT BACKEND — FIRST-PARTY MODEL STUB (GNX ROUT)
 * ============================================================================
 * 
 * PLUG-IN POINT FOR FIRST-PARTY "GNX ROUT" MODEL INTEGRATION:
 * -----------------------------------------------------------
 * All legacy external AI provider integrations (Gemini, OpenRouter, Groq)
 * and their multi-tier smart-routing fallback ladders have been stripped out.
 * 
 * When the first-party GNX Rout model/service is ready:
 * 1. Initialize the GNX Rout connection / client here.
 * 2. Pipe streamed tokens to `sendSSE(res, { type: "chunk", text })`.
 * 3. Emit the final `{ type: "done", thoughtProcess, cleanText, fullText, searchSources }` event.
 * 
 * The streaming response contract (SSE format, chunk structure, message types)
 * below matches the frontend stream reader in `src/App.tsx` verbatim.
 * ============================================================================
 */

// Helper to write Server-Sent Events in standard data: {...}\n\n format
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

// Small promise delay helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req: any, res: any) {
  // Handle CORS preflight if called cross-origin
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Set SSE streaming headers matching production serverless configuration
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  let clientGone = false;
  const pingInterval = setInterval(() => {
    if (!clientGone) {
      sendSSE(res, { type: "ping" });
    }
  }, 6000);

  res.on("close", () => {
    clientGone = true;
    clearInterval(pingInterval);
  });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const userMessage = (body.message || "").trim();

    // -------------------------------------------------------------------------
    // GNX ROUT STUB: REALISTIC AGENT REASONING SEQUENCE
    // -------------------------------------------------------------------------
    // The frontend's stream reader detects `<think>` and initiates the live
    // Thinking shimmer indicator. As thoughts stream in, it keeps the thinking
    // phase active until `</think>` arrives, then transitions to working phase.
    // -------------------------------------------------------------------------

    const thoughtSteps = [
      "Initializing GNX Rout reasoning runtime...\n",
      userMessage ? `Analyzing context for query: "${userMessage.slice(0, 48)}${userMessage.length > 48 ? "..." : ""}"\n` : "Analyzing session context...\n",
      "Connecting to GNX Rout primary core cluster...\n",
      "Trying GNX Rout core...\n",
      "Reconfiguring reasoning path: switching to local dispatch pipeline...\n",
      "Attempting again: verifying first-party model endpoint & tensor weights...\n",
      "Status check: core model deployment in progress by Dasgar.\n",
      "Synthesizing assistant dispatch message.\n",
    ];

    // Begin thought block
    if (!clientGone) {
      sendSSE(res, { type: "chunk", text: "<think>\n" });
    }

    // Stream reasoning sequence with realistic pauses
    for (const step of thoughtSteps) {
      if (clientGone) break;
      await delay(450);
      if (clientGone) break;
      sendSSE(res, { type: "chunk", text: step });
    }

    // Close thought block — transitions frontend from 'thinking' to 'working'
    if (!clientGone) {
      await delay(350);
      sendSSE(res, { type: "chunk", text: "</think>\n\n" });
    }

    // -------------------------------------------------------------------------
    // FINAL FRIENDLY IN-CHARACTER ASSISTANT MESSAGE
    // -------------------------------------------------------------------------
    // Streamed in natural word-chunks so the assistant reply bubble animates
    // smoothly into place like a real generation.
    // -------------------------------------------------------------------------
    const finalAnswerChunks = [
      "My core model (**GNX Rout**) ",
      "isn't wired in yet — ",
      "Dasgar's building it from scratch. ",
      "Hang tight 🛠️\n\n",
      "Once the first-party model is hooked up, ",
      "I'll be fully powered by GNX Rout right here.",
    ];

    for (const chunk of finalAnswerChunks) {
      if (clientGone) break;
      await delay(80);
      if (clientGone) break;
      sendSSE(res, { type: "chunk", text: chunk });
    }

    clearInterval(pingInterval);

    if (!clientGone) {
      const fullThoughtText = thoughtSteps.join("").trim();
      const cleanAnswerText =
        "My core model (**GNX Rout**) isn't wired in yet — Dasgar's building it from scratch. Hang tight 🛠️\n\nOnce the first-party model is hooked up, I'll be fully powered by GNX Rout right here.";

      sendSSE(res, {
        type: "done",
        thoughtProcess: fullThoughtText,
        cleanText: cleanAnswerText,
        fullText: `<think>\n${fullThoughtText}\n</think>\n\n${cleanAnswerText}`,
        searchSources: [],
      });
    }

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error: any) {
    clearInterval(pingInterval);
    console.error("GNX Rout stub error in /api/chat:", error);
    try {
      sendSSE(res, {
        type: "error",
        error: error?.message || "An unexpected error occurred in GNX Rout dispatch.",
      });
    } catch {
      /* ignore */
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
}
