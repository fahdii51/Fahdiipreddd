import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import OpenAI from "openai";

let groqClient: Groq | null = null;
let openAiClient: OpenAI | null = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured");
    }
    groqClient = new Groq({
      apiKey: apiKey,
    });
  }
  return groqClient;
}

function getOpenAiClient() {
  if (!openAiClient) {
    const apiKey = process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPEN_ROUTE_API_KEY or OPENAI_API_KEY is not configured");
    }
    openAiClient = new OpenAI({ apiKey });
  }
  return openAiClient;
}

function getAiClient() {
  if (process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY) {
    return getOpenAiClient();
  }
  return getGroqClient();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory cache for predictions
  const predictionCache = new Map<string, any>();

  // AI Prediction Route via Groq Ensemble
  app.post("/api/predict", async (req, res) => {
    const { history } = req.body;

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ error: "Invalid history data" });
    }

    const cacheKey = history.join(",");
    if (predictionCache.has(cacheKey)) {
      return res.json(predictionCache.get(cacheKey));
    }
    
    const usingOpenRoute = Boolean(process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY);
    const models = usingOpenRoute
      ? process.env.OPEN_ROUTE_MODELS
        ? process.env.OPEN_ROUTE_MODELS.split(',').map(s => s.trim()).filter(Boolean)
        : process.env.OPEN_ROUTE_MODEL
        ? [process.env.OPEN_ROUTE_MODEL.trim()]
        : ["poolside/laguna-xs-2.1:free"]
      : process.env.GROQ_MODELS
      ? process.env.GROQ_MODELS.split(',').map(s => s.trim()).filter(Boolean)
      : [
          "qwen/qwen3-32b",
          "llama-3.3-70b-versatile",
          "groq/compound-mini"
        ];

    try {
      const client = getAiClient();
      
      // Request predictions from all models in parallel
      const requests = models.map(model => 
        client.chat.completions.create({
          model: model,
          messages: [
            {
              role: "system",
              content: `You are an elite Wingo Pattern Architect. Analyze trends (Dragon, Mirror, ABAB). Last results are most critical. 
              Output ONLY JSON: {"number": N (0-9), "size": "BIG"|"SMALL", "confidence": 1-100, "reason": "short explanation"}`
            },
            {
              role: "user",
              content: `Analyze last 30 periods (newest last): ${history.join(", ")}. Predict next.`
            }
          ],
          temperature: 0.5,
          max_tokens: 512
        }).catch(err => {
          console.error(`Error with model ${model}:`, err.message);
          return null;
        })
      );

      const responses = await Promise.all(requests);
      const validPredictions: any[] = [];

      responses.forEach((resp, index) => {
        if (!resp) return;
        try {
          const content = resp.choices[0].message.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            parsed.sourceModel = models[index];
            validPredictions.push(parsed);
          }
        } catch (e) {
          console.error(`Failed to parse response from ${models[index]}`);
        }
      });

      if (validPredictions.length === 0) {
        throw new Error("All ensemble models failed to provide valid predictions");
      }

      // VOTING LOGIC
      const sizeVotes: Record<string, number> = { "BIG": 0, "SMALL": 0 };
      const numberVotes: Record<number, number> = {};
      let totalConfidence = 0;
      let reasons: string[] = [];

      validPredictions.forEach(p => {
        // Size voting
        if (p.size) sizeVotes[p.size.toUpperCase()] = (sizeVotes[p.size.toUpperCase()] || 0) + 1;
        // Number voting
        if (typeof p.number === 'number') numberVotes[p.number] = (numberVotes[p.number] || 0) + 1;
        
        totalConfidence += (p.confidence || 50);
        if (p.reason) reasons.push(`[${p.sourceModel.split('-')[1]}]: ${p.reason}`);
      });

      // Resolve Winning Size (Majority)
      const finalSize = sizeVotes["BIG"] >= sizeVotes["SMALL"] ? "BIG" : "SMALL";
      
      // Resolve Winning Number (Majority or highest confidence model fallback)
      let finalNumber = validPredictions[0].number;
      let maxVotes = 0;
      for (const [num, votes] of Object.entries(numberVotes)) {
        if (votes > maxVotes) {
          maxVotes = votes;
          finalNumber = parseInt(num);
        }
      }

      const finalResult = {
        number: finalNumber,
        size: finalSize,
        confidence: Math.round(totalConfidence / validPredictions.length),
        reason: reasons.join(" | "),
        ensemble_count: validPredictions.length,
        models_used: validPredictions.map(p => p.sourceModel),
        individual_predictions: validPredictions
      };

      predictionCache.set(cacheKey, finalResult);
      if (predictionCache.size > 100) {
        const firstKey = predictionCache.keys().next().value;
        if (firstKey) predictionCache.delete(firstKey);
      }

      res.json(finalResult);
    } catch (error: any) {
      console.error("Ensemble API Error:", error);
      res.status(500).json({ error: "Failed to fetch ensemble prediction" });
    }
  });

  // General Chat Route using the new model
  app.post("/api/chat", async (req, res) => {
    const { messages } = req.body;
    
    try {
      const client = getAiClient();
      const chatModel = process.env.OPEN_ROUTE_MODEL
        ? process.env.OPEN_ROUTE_MODEL
        : process.env.GROQ_MODELS
        ? process.env.GROQ_MODELS.split(',')[0].trim()
        : process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY
        ? "poolside/laguna-xs-2.1:free"
        : "llama-3.3-70b-versatile";
      const completion = await client.chat.completions.create({
        model: chatModel,
        messages: messages || [{ role: "user", content: "Hi" }],
        max_tokens: 2048,
        temperature: 0.60,
        top_p: 0.95,
        stream: false
      });

      res.json(completion.choices[0].message);
    } catch (error: any) {
      console.error("Groq Chat Error:", error);
      if (error.status === 429) {
        return res.status(429).json({ error: "AI is currently busy (Rate Limit). Please try again in a few seconds." });
      }
      res.status(500).json({ error: "Failed to chat with AI" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
