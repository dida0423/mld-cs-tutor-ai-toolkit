import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatCompletion, getChatModelName } from '../services/openaiClient.js'
import { useVisualizationReader } from '../context/useVisualization.js'
import {
  classifyRagRequired,
  formatRagContextForPrompt,
  retrieveRagMatches,
  warmRagCache,
} from '../rag/ragService.js'

/** Renders chat text as Markdown (GFM: tables, strikethrough, task lists, autolinks). */
function TutorMarkdown({ markdown }) {
  return (
    <div className="tutor-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

function buildSystemPrompt(activeTopic, vizPayload, ragBlock) {
  const payloadText =
    vizPayload == null
      ? 'No structured payload yet (visualization may still be loading).'
      : JSON.stringify(vizPayload, null, 2)

  return [
    'You are an expert ML educator helping a student in an interactive lab.',
    `The student is viewing the "${activeTopic}" visualization right now.`,
    'You MUST ground explanations in the "Live visualization state" below: cite numbers, labels, and the current step when relevant.',
    'When retrieved notes are provided, use them to reinforce definitions and intuition; resolve conflicts in favor of the live JSON for this specific demo. Retrieved notes include **Sources:** with links—mention those links when you lean on a retrieved fact.',
    'Be concise (short paragraphs or bullets). Avoid generic textbook lectures.',
    'If the state JSON is missing details you need, ask one clarifying question instead of guessing.',
    '',
    ragBlock || '(No RAG notes retrieved for this turn—rely on the live state and general knowledge.)',
    '',
    'Live visualization state (JSON):',
    payloadText,
  ].join('\n')
}

export function TutorChatbot() {
  const { activeTopic, vizPayload } = useVisualizationReader()
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content:
        'Hi! Ask me about what you see on screen. I use the current tab’s parameters and step as context, plus **retrieved notes** (RAG) on MapReduce, embeddings, and gradient descent when you chat.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    void warmRagCache()
  }, [])

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
  }

  const send = async (userText) => {
    const trimmed = userText.trim()
    if (!trimmed || loading) return
    setError(null)
    setLoading(true)

    let historyForApi = []

    setMessages((prev) => {
      historyForApi = [...prev, { role: 'user', content: trimmed }]
      return historyForApi
    })
    scrollToBottom()

    let ragMatches = []
    let ragBlock = ''
    try {
      const needRag = await classifyRagRequired({ userQuery: trimmed, activeTopic })
      if (needRag) {
        ragMatches = await retrieveRagMatches({ userQuery: trimmed, activeTopic, topK: 4 })
        ragBlock = formatRagContextForPrompt(ragMatches)
      }
    } catch {
      /* Classifier or embeddings unavailable: try retrieval once; otherwise continue without RAG */
      try {
        ragMatches = await retrieveRagMatches({ userQuery: trimmed, activeTopic, topK: 4 })
        ragBlock = formatRagContextForPrompt(ragMatches)
      } catch {
        /* no RAG */
      }
    }

    const system = buildSystemPrompt(activeTopic, vizPayload, ragBlock)

    try {
      const reply = await chatCompletion(
        [{ role: 'system', content: system }, ...historyForApi.map((m) => ({ role: m.role, content: m.content }))],
        { model: getChatModelName() }
      )
      const sources = ragMatches.map((m) => m.chunk.title)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, sources }])
    } catch (e) {
      setError(e?.message ?? String(e))
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I could not reach the model. For local dev: add OPENAI_API_KEY to `.env`, restart `npm run dev`, and ensure you are not blocking the `/api/openai` proxy.',
        },
      ])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  const explainStep = () => {
    send(
      `Explain the current step I am on for "${activeTopic}" in plain language, referencing the exact labels/numbers in the live state. What should I notice visually?`
    )
  }

  const whyHappening = () => {
    send(
      `Why does the visualization look the way it does right now for "${activeTopic}"? Tie the answer to the current parameters and step in the live state.`
    )
  }

  return (
    <aside className="tutor-panel" aria-label="AI tutor">
      <div className="tutor-head">
        <h2>AI tutor</h2>
        <p className="tutor-sub">Context: {activeTopic}</p>
      </div>

      <div className="tutor-quick">
        <button type="button" onClick={explainStep} disabled={loading}>
          Explain this step
        </button>
        <button type="button" onClick={whyHappening} disabled={loading}>
          Why does this happen?
        </button>
      </div>

      <div className="tutor-messages" ref={listRef}>
        {messages.map((m, idx) => (
          <div key={`${idx}-${m.role}`} className={`tutor-msg ${m.role}`}>
            <TutorMarkdown markdown={m.content} />
            {m.role === 'assistant' && m.sources?.length > 0 && (
              <p className="tutor-sources" title="Chunks retrieved for this answer (embedding similarity)">
                RAG: {m.sources.join(' · ')}
              </p>
            )}
          </div>
        ))}
        {loading && <div className="tutor-msg assistant muted">Thinking…</div>}
      </div>

      {error && <p className="tutor-error">{error}</p>}

      <form
        className="tutor-form"
        onSubmit={(e) => {
          e.preventDefault()
          const text = input
          setInput('')
          send(text)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the current visualization…"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}
