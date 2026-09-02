import { GoogleGenAI } from "@google/genai";

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY or VITE_GEMINI_API_KEY in Vercel Environment Variables.");
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

export default async function handler(req: any, res: any) {
  // Support CORS preflight if needed
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { message, parts, history } = body;

    const ai = getGemini();

    const chatHistory = Array.isArray(history) ? history : [];
    const currentParts = Array.isArray(parts) ? parts : [{ text: message || "" }];

    const systemInstruction = "You are Genex, a supreme, omnipotent, and highly intelligent all-in-one AI companion inside Genex Studio. Provide direct, sophisticated, and perfectly clear answers. Embody supreme elegance and minimalism. Avoid any conversational fluff, speak with absolute clarity.";

    const modelsToTry = [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let lastError: any = null;
    let replyText = "";

    for (const model of modelsToTry) {
      let delay = 300;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const result = await ai.models.generateContent({
            model,
            contents: [
              ...chatHistory,
              { role: "user", parts: currentParts }
            ],
            config: {
              systemInstruction,
            }
          });
          replyText = result.text || "";
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error;
          const errorMessage = typeof error === "object" && error !== null ? (error.message || JSON.stringify(error)) : String(error);
          const errorCode = error?.code || error?.status || "";

          const isHighDemand = 
            errorMessage.includes("high demand") || 
            errorMessage.includes("503") || 
            errorMessage.includes("UNAVAILABLE") ||
            errorCode === 503 ||
            errorCode === "UNAVAILABLE";

          const isRateLimit = errorMessage.includes("429") || errorCode === 429;

          if (isHighDemand) {
            break; // Try next model immediately
          }

          if (isRateLimit && attempt < 1) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          } else {
            break;
          }
        }
      }

      if (replyText) {
        break; // Successfully generated content
      }
    }

    if (!replyText && lastError) {
      throw lastError;
    }

    const updatedHistory = [
      ...chatHistory,
      { role: "user", parts: currentParts },
      { role: "model", parts: [{ text: replyText }] }
    ];

    return res.status(200).json({ text: replyText, history: updatedHistory });
  } catch (error: any) {
    console.error("Vercel Serverless Function /api/chat error:", error);
    return res.status(500).json({ 
      error: error?.message || "An unexpected error occurred with Gemini API on Vercel." 
    });
  }
}
