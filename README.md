# AI + Big Data Interactive Learning Toolkit

This project is a React + Vite educational web app for CS students. It teaches:

- **MapReduce** (split, map, shuffle, reduce flow)
- **Embeddings** (OpenAI embedding vectors, cosine similarity, PCA → 2D plot)
- **Gradient descent** (learning rate effects, convergence vs divergence)

Each topic includes:

- Interactive visualization
- Step-by-step exploration controls
- Immediate-feedback quizzes (with optional AI follow-up on wrong answers)
- Real-world application insight
- **Context-aware AI tutor** (uses live visualization state in every prompt)

## Prerequisites

- Node.js 18+
- An [OpenAI API](https://platform.openai.com/) key with access to chat + embeddings models

## API setup (local development)

The app calls OpenAI through a **Vite dev-server proxy** so your key stays on the machine running `npm run dev` and is **not** embedded in the frontend bundle.

1. Copy the example env file and add your key:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:

   ```bash
   OPENAI_API_KEY=sk-...
   ```

3. Optional overrides:

   ```bash
   VITE_OPENAI_CHAT_MODEL=gpt-4o-mini
   VITE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   ```

4. Start the dev server (proxy is active here):

   ```bash
   npm install
   npm run dev
   ```

5. Open the URL Vite prints (usually `http://localhost:5173`).

> **Production / `npm run preview`:** the Vite proxy does not run in preview mode. AI features (tutor, embeddings API, quiz hints) require the dev server or a small backend you add later that forwards `/api/openai/*` with a server-side key.

## How the ML pieces work

- **Embeddings tab:** fetches real vectors via `POST /v1/embeddings` (proxied). **Nearest neighbors and “Compare” use cosine similarity on full vectors.** The scatter plot is a **PCA projection** (dual Gram eigen trick for small \(n\)) plus min–max scaling into the SVG—use it for intuition, not exact geometry.
- **AI tutor:** each reply sends a **system prompt** that includes the active tab name plus a JSON **live visualization snapshot** (parameters, step, optimizer state, embedding status, errors).
- **RAG:** curated notes live in `src/rag/knowledgeChunks.js` (distilled from public docs, with inline **Sources:** links), including: [Apache MapReduce Tutorial](https://hadoop.apache.org/docs/r1.2.1/mapred_tutorial.html), [GeeksforGeeks MapReduce](https://www.geeksforgeeks.org/big-data/map-reduce-in-hadoop/) / [GFG embeddings overview](https://www.geeksforgeeks.org/machine-learning/what-are-embeddings-in-machine-learning/), [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings), and [ML Cheatsheet — Gradient Descent](https://ml-cheatsheet.readthedocs.io/en/latest/gradient_descent.html). Each question is embedded and matched by **cosine similarity** (`src/rag/ragService.js`); top chunks are added to the system prompt. Responses can show **“RAG: …”** chunk titles. Chunk embeddings are warmed on tutor mount.
- **AI interactive activities:** each topic auto-shows a generated 3-5 step activity below quizzes (`src/components/InteractiveActivityBlock.jsx`). Activities are generated once per topic and cached in localStorage (`mld_activity_cache_v1` + `mld_activity_progress_v1`), reused on tab return, and regenerated only via **Next Activity** or when a new quiz batch is generated.
- **Quizzes:** wrong answers can trigger **“AI: explain my mistake”** (lightweight follow-up).

## Build

```bash
npm run build
```

Static output is written to `dist/`.

## Project structure (high level)

- `src/App.jsx` — MapReduce + gradient modules, layout, quizzes wiring
- `src/components/EmbeddingsExplorer.jsx` — embedding fetch, PCA plot, cosine neighbors, compare
- `src/components/TutorChatbot.jsx` — context-aware chat UI + quick prompts
- `src/components/QuizBlock.jsx` — adaptive quizzes (3 per batch, **Generate New Questions** via OpenAI) + optional AI explanations
- `src/components/InteractiveActivityBlock.jsx` — cached step-by-step activity UI (drag/click/select)
- `src/services/quizGeneration.js` — JSON quiz batch generation from prior performance
- `src/services/activityGeneration.js` — JSON activity generation + schema normalization/fallback
- `src/services/openaiClient.js` — fetch helpers for `/api/openai/...`
- `src/utils/pca2d.js`, `src/utils/vectorMath.js` — PCA projection + cosine
- `src/context/*` — visualization snapshot context for the tutor
- `src/rag/knowledgeChunks.js`, `src/rag/ragService.js` — tutor RAG knowledge + retrieval
- `vite.config.js` — OpenAI proxy configuration

## Scripts

| Command        | Purpose                          |
| -------------- | -------------------------------- |
| `npm run dev`  | Dev server + API proxy           |
| `npm run build`| Production bundle                |
| `npm run preview` | Static preview (no AI proxy) |
| `npm run lint` | ESLint                           |
