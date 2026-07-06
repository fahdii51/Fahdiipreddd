Vercel Deployment
-----------------

1. Set environment variables in the Vercel dashboard:
   - `GROQ_API_KEY` (your Groq API key)
   - `GROQ_MODELS` (comma-separated list of models, e.g. `qwen/qwen3-32b,llama-3.3-70b-versatile,groq/compound-mini`)

2. Build & deploy

   - Push this repository to GitHub.
   - In Vercel, import the repo and link your project.
   - Vercel will run `npm install` and `npm run build` (or `vercel-build`) and deploy statics from `dist/` and serverless functions from `api/`.

3. Notes & limitations

   - Serverless functions have execution time limits. If the ensemble of models takes too long, reduce the model count or use an external server.
   - Do NOT commit API keys to the repository. Use Vercel's Environment Variables.
