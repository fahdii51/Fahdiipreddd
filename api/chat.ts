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

  const { messages } = req.body || {};

  try {
    const client = getAiClient();
    const usingOpenRoute = Boolean(process.env.OPEN_ROUTE_API_KEY || process.env.OPENAI_API_KEY);
    const chatModel = usingOpenRoute
      ? process.env.OPEN_ROUTE_MODEL
        ? process.env.OPEN_ROUTE_MODEL.trim()
        : process.env.OPEN_ROUTE_MODELS
        ? process.env.OPEN_ROUTE_MODELS.split(',')[0].trim()
        : 'poolside/laguna-xs-2.1:free'
      : process.env.GROQ_MODELS
      ? process.env.GROQ_MODELS.split(',')[0].trim()
      : 'llama-3.3-70b-versatile';
    const completion = await client.chat.completions.create({
      model: chatModel,
      messages: messages || [{ role: 'user', content: 'Hi' }],
      max_tokens: 2048,
      temperature: 0.6,
      top_p: 0.95,
      stream: false
    });

    return res.status(200).json(completion.choices[0].message);
  } catch (error: any) {
    console.error('Groq Chat Error:', error);
    if (error?.status === 429) return res.status(429).json({ error: 'AI is currently busy (Rate Limit). Please try again in a few seconds.' });
    return res.status(500).json({ error: 'Failed to chat with AI' });
  }
}
