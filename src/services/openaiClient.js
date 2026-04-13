/**
 * Talks to OpenAI through the Vite dev proxy at /api/openai → https://api.openai.com/v1
 * so the API key stays on the server (see vite.config.js + .env).
 */

const CHAT_MODEL = import.meta.env.VITE_OPENAI_CHAT_MODEL ?? 'gpt-4o-mini'
const EMBEDDING_MODEL = import.meta.env.VITE_OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

const BASE = '/api/openai'

async function parseError(res) {
  let detail = res.statusText
  try {
    const body = await res.json()
    detail = body?.error?.message ?? JSON.stringify(body)
  } catch {
    /* ignore */
  }
  return new Error(`OpenAI request failed (${res.status}): ${detail}`)
}

/**
 * Chat completion; returns assistant text.
 */
export async function chatCompletion(messages, options = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model ?? CHAT_MODEL,
      messages,
      temperature: options.temperature ?? 0.45,
      max_tokens: options.maxTokens ?? 700,
    }),
  })
  if (!res.ok) throw await parseError(res)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty response.')
  return text.trim()
}

/**
 * Embeddings for one or more input strings (in order).
 */
export async function createEmbeddings(inputs, options = {}) {
  if (!inputs.length) return []
  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model ?? EMBEDDING_MODEL,
      input: inputs,
    }),
  })
  if (!res.ok) throw await parseError(res)
  const data = await res.json()
  const list = data?.data
  if (!Array.isArray(list)) throw new Error('Invalid embeddings response.')
  return list
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

export function getEmbeddingModelName() {
  return EMBEDDING_MODEL
}

export function getChatModelName() {
  return CHAT_MODEL
}
