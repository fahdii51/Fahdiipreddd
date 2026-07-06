<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0c17ae7e-6684-465f-8264-c8c7243f5668

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GROQ_API_KEY` or `OPEN_ROUTE_API_KEY` / `OPENAI_API_KEY` in [.env.local](.env.local)
   - For OpenAI route use: `OPEN_ROUTE_API_KEY=sk-or-v1-...`
   - Use `OPEN_ROUTE_MODEL=poolside/laguna-xs-2.1:free` to target the route model
3. Run the app:
   `npm run dev`
