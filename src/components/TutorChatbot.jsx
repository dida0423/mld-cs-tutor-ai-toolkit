import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatCompletion, getChatModelName } from '../services/openaiClient.js'
import { useVisualizationReader } from '../context/useVisualization.js'

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

function buildSystemPrompt(activeTopic, vizPayload) {
  const payloadText =
    vizPayload == null
      ? 'No structured payload yet (visualization may still be loading).'
      : JSON.stringify(vizPayload, null, 2)

  return [
    'You are an expert ML educator helping a student in an interactive lab.',
    `The student is viewing the "${activeTopic}" visualization right now.`,
    'You MUST ground explanations in the "Live visualization state" below: cite numbers, labels, and the current step when relevant.',
    'Be concise (short paragraphs or bullets). Avoid generic textbook lectures.',
    'If the state JSON is missing details you need, ask one clarifying question instead of guessing.',
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
        'Hi! Ask me about what you see on screen. I use the current tab’s parameters and step as context.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)

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

    const system = buildSystemPrompt(activeTopic, vizPayload)
    let historyForApi = []

    setMessages((prev) => {
      historyForApi = [...prev, { role: 'user', content: trimmed }]
      return historyForApi
    })
    scrollToBottom()

    try {
      const reply = await chatCompletion(
        [{ role: 'system', content: system }, ...historyForApi.map((m) => ({ role: m.role, content: m.content }))],
        { model: getChatModelName() }
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
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
