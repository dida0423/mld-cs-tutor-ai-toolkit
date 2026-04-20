import { useEffect, useMemo, useState } from 'react'
import { createEmbeddings, getEmbeddingModelName } from '../services/openaiClient.js'
import { cosineSimilarity } from '../utils/vectorMath.js'
import { fit2DToSvg, pca2ScoresFromRows } from '../utils/pca2d.js'
import { usePublishVisualization } from '../context/useVisualization.js'
import { QuizBlock } from './QuizBlock.jsx'
import { InteractiveActivityBlock } from './InteractiveActivityBlock.jsx'

const DEFAULT_CORPUS = [
  'king',
  'queen',
  'man',
  'woman',
  'apple',
  'orange',
  'fruit',
  'semantic search',
  'machine learning',
  'neural network',
  'gradient descent',
  'database',
]

/**
 * Fetches OpenAI embeddings, projects with PCA (dual Gram method), and ranks neighbors by cosine similarity.
 */
export function EmbeddingsExplorer({ quizItems }) {
  const [corpus, setCorpus] = useState(DEFAULT_CORPUS)
  const [vectors, setVectors] = useState([])
  const [queryText, setQueryText] = useState('semantic search')
  const [queryVector, setQueryVector] = useState(null)
  const [compareA, setCompareA] = useState('king')
  const [compareB, setCompareB] = useState('queen')
  const [compareCosine, setCompareCosine] = useState(null)
  const [corpusFetchError, setCorpusFetchError] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [addText, setAddText] = useState('')
  const [activityRegenerateSignal, setActivityRegenerateSignal] = useState(0)

  const modelName = getEmbeddingModelName()

  const layout = useMemo(() => {
    if (!vectors.length || vectors.length !== corpus.length) {
      return { points: [], varExplained: null }
    }
    const rows = queryVector ? [...vectors, queryVector] : vectors
    const { x, y, varExplained } = pca2ScoresFromRows(rows)
    const fitted = fit2DToSvg(x, y, 420, 300, 26)
    const points = corpus
      .map((text, i) => ({
        text,
        x: fitted[i].x,
        y: fitted[i].y,
        embedding: vectors[i],
      }))
      .concat(
        queryVector
          ? [
              {
                text: '(your query)',
                x: fitted[corpus.length].x,
                y: fitted[corpus.length].y,
                embedding: queryVector,
                isQuery: true,
              },
            ]
          : []
      )
    return { points, varExplained }
  }, [corpus, vectors, queryVector])

  const layoutPoints = layout.points
  const varExplained = layout.varExplained

  useEffect(() => {
    let cancelled = false
    const texts = corpus

    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setCorpusFetchError(null)
      try {
        const next = await createEmbeddings(texts, { model: modelName })
        if (!cancelled) setVectors(next)
      } catch (e) {
        if (!cancelled) setCorpusFetchError(e?.message ?? String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [corpus, modelName])

  const corpusLoading = corpus.length > 0 && vectors.length !== corpus.length && corpusFetchError == null

  const nearestToQuery = useMemo(() => {
    if (!queryVector || !vectors.length) return []
    return corpus
      .map((text, i) => ({
        text,
        cosine: cosineSimilarity(queryVector, vectors[i]),
      }))
      .sort((a, b) => b.cosine - a.cosine)
      .slice(0, 4)
  }, [queryVector, vectors, corpus])

  const focusLabel = useMemo(() => {
    if (!queryVector || !nearestToQuery.length) return null
    return nearestToQuery[0].text
  }, [queryVector, nearestToQuery])

  const nearestSummary = nearestToQuery.map((n) => `${n.text}:${n.cosine.toFixed(3)}`).join(' | ')
  const varianceKey = varExplained ? `${varExplained[0].toFixed(4)}|${varExplained[1].toFixed(4)}` : ''

  usePublishVisualization(
    () => ({
      concept: 'Embeddings',
      embeddingModel: modelName,
      corpusSize: corpus.length,
      pcaVarianceExplainedApprox: varExplained
        ? { pc1: varExplained[0], pc2: varExplained[1] }
        : null,
      queryText: queryText || null,
      queryEmbedded: Boolean(queryVector),
      nearestCosineSummary: nearestSummary || null,
      compareCosine,
      loading: corpusLoading || actionBusy,
      corpusError: corpusFetchError,
      actionError,
    }),
    [
      modelName,
      corpus.length,
      queryText,
      queryVector,
      nearestSummary,
      compareCosine,
      corpusLoading,
      actionBusy,
      corpusFetchError,
      actionError,
      varianceKey,
    ]
  )

  async function embedQuery() {
    const t = queryText.trim()
    if (!t) return
    setActionBusy(true)
    setActionError(null)
    try {
      const [vec] = await createEmbeddings([t], { model: modelName })
      setQueryVector(vec)
    } catch (e) {
      setActionError(e?.message ?? String(e))
    } finally {
      setActionBusy(false)
    }
  }

  async function runCompare() {
    const a = compareA.trim()
    const b = compareB.trim()
    if (!a || !b) return
    setActionBusy(true)
    setActionError(null)
    try {
      const [va, vb] = await createEmbeddings([a, b], { model: modelName })
      setCompareCosine(cosineSimilarity(va, vb))
    } catch (e) {
      setActionError(e?.message ?? String(e))
    } finally {
      setActionBusy(false)
    }
  }

  function addToCorpus() {
    const t = addText.trim()
    if (!t) return
    if (corpus.some((c) => c.toLowerCase() === t.toLowerCase())) return
    setCorpus((c) => [...c, t])
    setAddText('')
  }

  const plotForTutor = layoutPoints.filter((p) => !p.isQuery)
  const queryPoint = layoutPoints.find((p) => p.isQuery)
  const busy = corpusLoading || actionBusy

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Embeddings: real vectors + PCA projection</h2>
          <p>
            Vectors come from the OpenAI embeddings API; cosine similarity uses full dimensionality. The 2D plot is a
            PCA projection for visualization only.
          </p>
        </div>
        <div className="controls">
          <label>
            Add to corpus
            <div className="button-row">
              <input value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="e.g., recommender system" />
              <button type="button" onClick={addToCorpus} disabled={busy}>
                Add
              </button>
            </div>
          </label>
          <label>
            Query text (embed, then rank corpus by cosine)
            <div className="button-row">
              <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="sentence or phrase" />
              <button type="button" onClick={embedQuery} disabled={busy}>
                Embed query
              </button>
            </div>
          </label>
          <label>
            Compare two strings (cosine similarity)
            <div className="compare-row">
              <input value={compareA} onChange={(e) => setCompareA(e.target.value)} />
              <input value={compareB} onChange={(e) => setCompareB(e.target.value)} />
              <button type="button" onClick={runCompare} disabled={busy}>
                Compare
              </button>
            </div>
          </label>
          {compareCosine != null && (
            <p className="compare-result">
              Cosine similarity: <strong>{compareCosine.toFixed(4)}</strong>
            </p>
          )}
          {corpusFetchError && <p className="tutor-error">{corpusFetchError}</p>}
          {actionError && <p className="tutor-error">{actionError}</p>}
          {corpusLoading && <p className="muted">Loading corpus embeddings…</p>}
        </div>
      </header>

      <svg className="embed-canvas" viewBox="0 0 420 300" role="img" aria-label="Embedding PCA plot">
        <rect x="0" y="0" width="420" height="300" rx="12" fill="var(--panel-2)" />
        {queryPoint &&
          nearestToQuery.slice(0, 3).map((n) => {
            const target = plotForTutor.find((p) => p.text === n.text)
            if (!target) return null
            return (
              <line
                key={`ln-${n.text}`}
                x1={queryPoint.x}
                y1={queryPoint.y}
                x2={target.x}
                y2={target.y}
                stroke="#6ea8fe"
                strokeDasharray="6 4"
              />
            )
          })}
        {plotForTutor.map((p) => {
          const isFocus = focusLabel && p.text === focusLabel && queryVector
          return (
            <g key={p.text}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isFocus ? 11 : 8}
                fill={isFocus ? '#1d4ed8' : '#334155'}
              />
              <text x={p.x + 10} y={p.y - 8} fontSize="11" fill="#0f172a">
                {p.text.length > 22 ? `${p.text.slice(0, 20)}…` : p.text}
              </text>
            </g>
          )
        })}
        {queryPoint && (
          <g>
            <circle cx={queryPoint.x} cy={queryPoint.y} r="10" fill="#c026d3" stroke="#fff" strokeWidth="2" />
            <text x={queryPoint.x + 12} y={queryPoint.y - 10} fontSize="11" fill="#701a75">
              query
            </text>
          </g>
        )}
      </svg>

      <div className="card">
        <h4>Nearest neighbors (cosine vs. embedded query)</h4>
        {!queryVector ? (
          <p className="muted">Embed a query to see ranked neighbors in the full vector space.</p>
        ) : (
          <ul className="neighbor-list">
            {nearestToQuery.map((n) => (
              <li key={n.text}>
                <strong>{n.text}</strong> — {n.cosine.toFixed(4)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="insight">
        <h3>Real-world use</h3>
        <p>Embeddings drive semantic search, recommendation ranking, and LLM retrieval pipelines.</p>
      </section>

      <QuizBlock
        title="Check understanding"
        items={quizItems}
        quizTopicName="Embeddings"
        onBatchRegenerated={() => setActivityRegenerateSignal((v) => v + 1)}
      />
      <InteractiveActivityBlock topic="Embeddings" regenerateSignal={activityRegenerateSignal} />
    </section>
  )
}
