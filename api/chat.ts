import 'dotenv/config';
import Groq from 'groq-sdk';

let groqClient: Groq | null = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { messages } = req.body || {};

  try {
    const client = getGroqClient();
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODELS ? process.env.GROQ_MODELS.split(',')[0].trim() : 'llama-3.3-70b-versatile',
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
