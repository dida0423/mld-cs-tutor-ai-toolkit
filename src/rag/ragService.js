import { chatCompletion, createEmbeddings, getChatModelName } from '../services/openaiClient.js'
import { cosineSimilarity } from '../utils/vectorMath.js'
import { RAG_CHUNKS } from './knowledgeChunks.js'

/** @type {number[][] | null} Cached embedding row for each RAG_CHUNKS[i]. */
let chunkEmbeddingRows = null

/**
 * Embeds all knowledge chunks once per browser session (batched API call).
 */
async function ensureChunkEmbeddings() {
  if (chunkEmbeddingRows) return
  const inputs = RAG_CHUNKS.map((c) => `${c.title}\n\n${c.text}`)
  chunkEmbeddingRows = await createEmbeddings(inputs)
}

function chunkEligibleForTopic(chunk, activeTopic) {
  return chunk.topics.includes('*') || chunk.topics.includes(activeTopic)
}

/**
 * Retrieves top-K chunks by cosine similarity between the query embedding and chunk embeddings.
 * Only considers chunks tagged for `activeTopic` or `*`.
 */
export async function retrieveRagMatches({ userQuery, activeTopic, topK = 4 }) {
  await ensureChunkEmbeddings()

  const queryInput = `Concept: ${activeTopic}. Student question: ${userQuery}`
  const [queryVec] = await createEmbeddings([queryInput])

  const scored = []
  for (let i = 0; i < RAG_CHUNKS.length; i += 1) {
    const chunk = RAG_CHUNKS[i]
    if (!chunkEligibleForTopic(chunk, activeTopic)) continue
    const row = chunkEmbeddingRows[i]
    scored.push({
      chunk,
      score: cosineSimilarity(queryVec, row),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/**
 * Formats retrieved chunks for the system prompt (Markdown-friendly).
 */
export function formatRagContextForPrompt(matches) {
  if (!matches.length) return ''
  const lines = [
    'Retrieved reference notes (ground explanations in these when they match the question; if anything disagrees with the "Live visualization state" JSON below, trust the JSON for this app):',
    '',
  ]
  for (const { chunk, score } of matches) {
    lines.push(`### ${chunk.title} _(relevance ${score.toFixed(3)})_`)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

/** Pre-embed knowledge chunks on mount so the first chat turn only pays for the query embedding. */
export async function warmRagCache() {
  try {
    await ensureChunkEmbeddings()
  } catch {
    /* Offline or missing key: tutor answers without RAG context. */
  }
}

function sanitizeForClassifier(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

function parseUseRagJson(raw) {
  const t = String(raw ?? '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const inner = fence ? fence[1].trim() : t
  const obj = JSON.parse(inner)
  if (typeof obj.use_rag === 'boolean') return obj.use_rag
  if (typeof obj.rag_required === 'boolean') return obj.rag_required
  if (typeof obj.require_rag === 'boolean') return obj.require_rag
  return null
}

/**
 * LLM router: whether to run embedding retrieval for this turn.
 * On failure or ambiguous parse, returns true (prefer retrieving notes).
 */
export async function classifyRagRequired({ userQuery, activeTopic }) {
  const q = sanitizeForClassifier(userQuery)
  if (!q) return false

  const user = [
    'Decide if retrieved course notes (RAG) are needed to answer the student well.',
    `They are viewing tab/context: "${String(activeTopic ?? '').slice(0, 120)}".`,
    '',
    'use_rag = true when: definitions, algorithm behavior, standard teaching, intuition that matches curated notes on MapReduce, embeddings, or gradient descent, or the question clearly benefits from reference material.',
    'use_rag = false when: greetings/thanks/OK, chit-chat, meta questions about the UI only, or the answer can rely solely on the live visualization JSON the tutor already receives (no need for external notes).',
    '',
    `Student message: """${q.replace(/"/g, "'")}"""`,
    '',
    'Reply with ONLY JSON: {"use_rag": true} or {"use_rag": false}. No markdown, no other keys.',
  ].join('\n')

  const text = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are a strict routing classifier. Output a single JSON object with boolean field use_rag only. No prose.',
      },
      { role: 'user', content: user },
    ],
    { model: getChatModelName(), maxTokens: 80, temperature: 0 }
  )

  try {
    const parsed = parseUseRagJson(text)
    return parsed !== null ? parsed : true
  } catch {
    return true
  }
}
