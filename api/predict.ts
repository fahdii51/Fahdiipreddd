import 'dotenv/config';
import Groq from 'groq-sdk';
import OpenAI from 'openai';

let groqClient: Groq | null = null;
let openAiClient: OpenAI | null = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

function getOpenAiClient() {
  if (!openAiClient) {
    const apiKey = process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPEN_ROUTE_API_KEY or OPENAI_API_KEY is not configured');
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { history } = req.body || {};
  if (!history || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid history data' });
  }

  const usingOpenRoute = Boolean(process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY);
  const models = usingOpenRoute
    ? process.env.OPEN_ROUTE_MODELS
      ? process.env.OPEN_ROUTE_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
      : process.env.OPEN_ROUTE_MODEL
      ? [process.env.OPEN_ROUTE_MODEL.trim()]
      : ['poolside/laguna-xs-2.1:free']
    : process.env.GROQ_MODELS
    ? process.env.GROQ_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'groq/compound-mini'];

  try {
    const client = getAiClient();

    const requests = models.map((model) =>
      client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an elite Wingo Pattern Architect. Analyze trends (Dragon, Mirror, ABAB). Last results are most critical. Output ONLY JSON: {"number": N (0-9), "size": "BIG"|"SMALL", "confidence": 1-100, "reason": "short explanation"}'
          },
          {
            role: 'user',
            content: `Analyze last 30 periods (newest last): ${history.join(', ')}. Predict next.`
          }
        ],
        temperature: 0.5,
        max_tokens: 512
      }).catch((err: any) => {
        console.error(`Error with model ${model}:`, err?.message || err);
        return null;
      })
    );

    const responses = await Promise.all(requests);
    const validPredictions: any[] = [];

    responses.forEach((resp: any, index: number) => {
      if (!resp) return;
      try {
        const content = resp.choices?.[0]?.message?.content || '';
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
      throw new Error('All ensemble models failed to provide valid predictions');
    }

    const sizeVotes: Record<string, number> = { BIG: 0, SMALL: 0 };
    const numberVotes: Record<number, number> = {};
    let totalConfidence = 0;
    let reasons: string[] = [];

    validPredictions.forEach((p) => {
      if (p.size) sizeVotes[p.size.toUpperCase()] = (sizeVotes[p.size.toUpperCase()] || 0) + 1;
      if (typeof p.number === 'number') numberVotes[p.number] = (numberVotes[p.number] || 0) + 1;
      totalConfidence += p.confidence || 50;
      if (p.reason) reasons.push(`[${p.sourceModel}]: ${p.reason}`);
    });

    const finalSize = sizeVotes['BIG'] >= sizeVotes['SMALL'] ? 'BIG' : 'SMALL';

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
      reason: reasons.join(' | '),
      ensemble_count: validPredictions.length,
      models_used: validPredictions.map((p) => p.sourceModel),
      individual_predictions: validPredictions
    };

    return res.status(200).json(finalResult);
  } catch (error: any) {
    console.error('Ensemble API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch ensemble prediction' });
  }
}
