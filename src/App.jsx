import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { TutorChatbot } from './components/TutorChatbot.jsx'
import { EmbeddingsExplorer } from './components/EmbeddingsExplorer.jsx'
import { InteractiveActivityBlock } from './components/InteractiveActivityBlock.jsx'
import { QuizBlock } from './components/QuizBlock.jsx'
import { VisualizationProvider } from './context/VisualizationProvider.jsx'
import { usePublishVisualization } from './context/useVisualization.js'

const TOPICS = ['MapReduce', 'Embeddings', 'Gradient Descent']
const MAPREDUCE_PHASES = ['Split', 'Map', 'Shuffle', 'Reduce']

const WORD_POOL = [
  'ai',
  'data',
  'data',
  'ml',
  'systems',
  'logs',
  'model',
  'model',
  'training',
  'vector',
  'vector',
  'search',
  'cloud',
  'batch',
  'batch',
  'pipeline',
  'pipeline',
  'pipeline',
]

const QUIZZES = {
  mapreduce: [
    {
      question: 'In MapReduce word count, what is emitted by each mapper?',
      choices: ['A single final count', '(word, 1) pairs', 'Only unique words'],
      answer: 1,
      explanation: 'Map emits intermediate key-value pairs like (word, 1) for each token.',
    },
    {
      question: 'What is the purpose of the shuffle phase?',
      choices: ['Sort by file size', 'Group same keys together', 'Compress dataset'],
      answer: 1,
      explanation: 'Shuffle moves and groups all identical keys so reducers can aggregate them.',
    },
    {
      question: 'If nodes increase while data size stays fixed, map work per node is usually:',
      choices: ['Higher', 'Lower', 'Unchanged in all cases'],
      answer: 1,
      explanation: 'More nodes typically means each node handles a smaller chunk of the same dataset.',
    },
  ],
  embeddings: [
    {
      question: 'In an embedding plot, closer points usually mean:',
      choices: ['Higher semantic similarity', 'Lower model confidence', 'Older data'],
      answer: 0,
      explanation: 'Distance is used as a proxy for similarity: closer vectors are more related.',
    },
    {
      question: 'If two embedding vectors point in nearly the same direction in space, cosine similarity is typically:',
      choices: ['Close to 0', 'Close to 1', 'Always negative'],
      answer: 1,
      explanation: 'Cosine similarity measures directional alignment; aligned vectors approach 1.',
    },
    {
      question: 'A real-world use of embeddings is:',
      choices: ['Image compression only', 'Semantic search and recommendation', 'CPU scheduling'],
      answer: 1,
      explanation: 'Search and recommender systems rely heavily on embedding distance.',
    },
  ],
  gradient: [
    {
      question: 'If learning rate is too high, gradient descent may:',
      choices: ['Converge faster always', 'Oscillate/diverge', 'Stop changing'],
      answer: 1,
      explanation: 'Large updates can overshoot the minimum and even blow up.',
    },
    {
      question: 'Gradient descent update direction is:',
      choices: ['Along positive gradient', 'Opposite gradient', 'Random each step'],
      answer: 1,
      explanation: 'We move opposite the gradient to decrease loss.',
    },
    {
      question: 'Very low learning rate usually leads to:',
      choices: ['Slow convergence', 'Immediate divergence', 'No training data required'],
      answer: 0,
      explanation: 'Small steps reduce loss safely but require many iterations.',
    },
  ],
}

function chunkArray(items, chunkCount) {
  const chunks = Array.from({ length: chunkCount }, () => [])
  items.forEach((item, idx) => chunks[idx % chunkCount].push(item))
  return chunks
}

function MapReduceModule() {
  const [datasetSize, setDatasetSize] = useState(12)
  const [nodeCount, setNodeCount] = useState(3)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [activityRegenerateSignal, setActivityRegenerateSignal] = useState(0)

  const words = useMemo(
    () => Array.from({ length: datasetSize }, (_, i) => WORD_POOL[i % WORD_POOL.length]),
    [datasetSize]
  )

  const nodeChunks = useMemo(() => chunkArray(words, nodeCount), [words, nodeCount])

  const mapOutput = useMemo(
    () =>
      nodeChunks.map((chunk) =>
        chunk.map((word) => ({
          key: word,
          value: 1,
        }))
      ),
    [nodeChunks]
  )

  const shuffleOutput = useMemo(() => {
    const grouped = {}
    mapOutput.flat().forEach((pair) => {
      grouped[pair.key] = [...(grouped[pair.key] ?? []), pair.value]
    })
    return grouped
  }, [mapOutput])

  const reduceOutput = useMemo(() => {
    const reduced = {}
    Object.entries(shuffleOutput).forEach(([key, values]) => {
      reduced[key] = values.reduce((acc, cur) => acc + cur, 0)
    })
    return reduced
  }, [shuffleOutput])

  useEffect(() => {
    if (!autoPlay || phaseIndex >= 3) return undefined
    const timer = window.setTimeout(() => {
      setPhaseIndex((prev) => {
        const next = Math.min(prev + 1, 3)
        if (next >= 3) setAutoPlay(false)
        return next
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [autoPlay, phaseIndex])

  usePublishVisualization(
    () => ({
      concept: 'MapReduce',
      currentStep: MAPREDUCE_PHASES[phaseIndex],
      stepIndex: phaseIndex,
      phaseSequence: MAPREDUCE_PHASES,
      parameters: { datasetSize, nodeCount },
      narrative: `Word-count toy example. Active phase: "${MAPREDUCE_PHASES[phaseIndex]}". Dataset has ${datasetSize} tokens split round-robin across ${nodeCount} mapper nodes.`,
    }),
    [phaseIndex, datasetSize, nodeCount]
  )

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>MapReduce: Word Count Pipeline</h2>
          <p>Step through how distributed nodes count words in parallel.</p>
        </div>
        <div className="controls">
          <label>
            Dataset size: {datasetSize}
            <input
              type="range"
              min="6"
              max="24"
              value={datasetSize}
              onChange={(e) => {
                setDatasetSize(Number(e.target.value))
                setPhaseIndex(0)
              }}
            />
          </label>
          <label>
            Nodes: {nodeCount}
            <input
              type="range"
              min="2"
              max="6"
              value={nodeCount}
              onChange={(e) => {
                setNodeCount(Number(e.target.value))
                setPhaseIndex(0)
              }}
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => setPhaseIndex((p) => Math.min(p + 1, 3))}>
              Next Step
            </button>
            <button type="button" onClick={() => setAutoPlay((v) => !v)}>
              {autoPlay ? 'Pause' : 'Auto Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhaseIndex(0)
                setAutoPlay(false)
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="stepper">
        {MAPREDUCE_PHASES.map((name, idx) => (
          <span key={name} className={idx <= phaseIndex ? 'active' : ''}>
            {name}
          </span>
        ))}
      </div>

      <div className="viz-grid">
        <article className="card">
          <h4>1) Input Split</h4>
          <p>{phaseIndex >= 0 ? `Dataset split into ${nodeCount} chunk(s).` : 'Prepare input.'}</p>
          <div className="tokens">
            {nodeChunks.map((chunk, idx) => (
              <div key={`split-${idx}`} className="node-block">
                <strong>Node {idx + 1}</strong>
                <div>{chunk.join(' ')}</div>
              </div>
            ))}
          </div>
        </article>

        <article className={`card ${phaseIndex < 1 ? 'muted' : ''}`}>
          <h4>2) Map</h4>
          <p>Each node emits (word, 1).</p>
          {phaseIndex >= 1 && (
            <div className="tokens">
              {mapOutput.map((pairs, idx) => (
                <div key={`map-${idx}`} className="node-block">
                  <strong>Mapper {idx + 1}</strong>
                  <div>{pairs.map((p) => `(${p.key}, ${p.value})`).join(' ')}</div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className={`card ${phaseIndex < 2 ? 'muted' : ''}`}>
          <h4>3) Shuffle</h4>
          <p>System groups same keys across all mappers.</p>
          {phaseIndex >= 2 && (
            <div className="tokens">
              {Object.entries(shuffleOutput).map(([key, values]) => (
                <div key={`shuf-${key}`} className="group-pill">
                  {key}: [{values.join(', ')}]
                </div>
              ))}
            </div>
          )}
        </article>

        <article className={`card ${phaseIndex < 3 ? 'muted' : ''}`}>
          <h4>4) Reduce</h4>
          <p>Reducers aggregate each key list into total counts.</p>
          {phaseIndex >= 3 && (
            <div className="tokens">
              {Object.entries(reduceOutput).map(([key, value]) => (
                <div key={`red-${key}`} className="group-pill strong">
                  {key}: {value}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <section className="insight">
        <h3>Real-world use</h3>
        <p>MapReduce powers large-scale batch processing in Hadoop, web log analytics, and ETL pipelines.</p>
      </section>

      <QuizBlock
        title="Check understanding"
        items={QUIZZES.mapreduce}
        quizTopicName="MapReduce"
        onBatchRegenerated={() => setActivityRegenerateSignal((v) => v + 1)}
      />
      <InteractiveActivityBlock topic="MapReduce" regenerateSignal={activityRegenerateSignal} />
    </section>
  )
}

function lossFn(x, y) {
  return x * x + 0.6 * y * y
}

function gradient(x, y) {
  return { dx: 2 * x, dy: 1.2 * y }
}

function GradientDescentModule() {
  const [learningRate, setLearningRate] = useState(0.2)
  const [running, setRunning] = useState(false)
  const [point, setPoint] = useState({ x: 3.2, y: -2.5 })
  const [history, setHistory] = useState([{ x: 3.2, y: -2.5 }])
  const [activityRegenerateSignal, setActivityRegenerateSignal] = useState(0)

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => {
      setPoint((prev) => {
        const grad = gradient(prev.x, prev.y)
        const next = {
          x: prev.x - learningRate * grad.dx,
          y: prev.y - learningRate * grad.dy,
        }
        setHistory((h) => [...h.slice(-80), next])
        return next
      })
    }, 350)
    return () => window.clearInterval(timer)
  }, [running, learningRate])

  const loss = lossFn(point.x, point.y)
  const grad = gradient(point.x, point.y)

  const svgPoint = {
    x: 210 + point.x * 45,
    y: 150 + point.y * 45,
  }

  usePublishVisualization(
    () => ({
      concept: 'Gradient Descent',
      lossSurface: 'Simulated bowl L(x,y)=x^2 + 0.6 y^2; minimum near (0,0).',
      parameters: { learningRate, training: running ? 'running' : 'paused' },
      optimizer: {
        position: { x: point.x, y: point.y },
        loss,
        gradient: grad,
      },
      narrative: `Learning rate=${learningRate.toFixed(2)}. Point at (${point.x.toFixed(3)}, ${point.y.toFixed(
        3
      )}) with loss=${loss.toFixed(3)}. ${running ? 'Animation is stepping.' : 'Animation is stopped.'} ${
        learningRate > 0.8 ? 'Large LR: student should notice wider jumps or spirals.' : ''
      }${learningRate < 0.12 ? 'Tiny LR: motion toward the green minimum should look slow.' : ''}`,
    }),
    [learningRate, running, point.x, point.y, loss, grad.dx, grad.dy]
  )

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Gradient Descent: Optimization Path</h2>
          <p>Watch how learning rate changes convergence speed and stability.</p>
        </div>
        <div className="controls">
          <label>
            Learning rate: {learningRate.toFixed(2)}
            <input
              type="range"
              min="0.02"
              max="1.2"
              step="0.02"
              value={learningRate}
              onChange={(e) => setLearningRate(Number(e.target.value))}
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => setRunning((v) => !v)}>
              {running ? 'Stop' : 'Start'}
            </button>
            <button
              type="button"
              onClick={() => {
                const g = gradient(point.x, point.y)
                const next = {
                  x: point.x - learningRate * g.dx,
                  y: point.y - learningRate * g.dy,
                }
                setPoint(next)
                setHistory((h) => [...h.slice(-80), next])
              }}
            >
              Single Step
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false)
                const start = { x: 3.2, y: -2.5 }
                setPoint(start)
                setHistory([start])
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <svg className="gd-canvas" viewBox="0 0 420 300">
        <rect x="0" y="0" width="420" height="300" rx="12" fill="var(--panel-2)" />
        {[60, 95, 130, 165, 200].map((r) => (
          <ellipse key={r} cx="210" cy="150" rx={r * 0.9} ry={r * 0.55} fill="none" stroke="#94a3b8" strokeDasharray="4 6" />
        ))}
        <circle cx="210" cy="150" r="6" fill="#16a34a" />
        <polyline
          points={history.map((h) => `${210 + h.x * 45},${150 + h.y * 45}`).join(' ')}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
        />
        <circle cx={svgPoint.x} cy={svgPoint.y} r="7" fill="#b91c1c" />
      </svg>

      <div className="stats">
        <div className="card">
          <h4>Current state</h4>
          <p>
            x={point.x.toFixed(3)}, y={point.y.toFixed(3)}, loss={loss.toFixed(3)}
          </p>
          {learningRate > 0.8 && <p className="warn">High learning rate: likely to oscillate/diverge.</p>}
          {learningRate < 0.12 && <p className="note">Low learning rate: stable but slow convergence.</p>}
        </div>
      </div>

      <section className="insight">
        <h3>Real-world use</h3>
        <p>Gradient descent is the core optimizer for training neural networks and fine-tuning LLMs.</p>
      </section>

      <QuizBlock
        title="Check understanding"
        items={QUIZZES.gradient}
        quizTopicName="Gradient Descent"
        onBatchRegenerated={() => setActivityRegenerateSignal((v) => v + 1)}
      />
      <InteractiveActivityBlock topic="Gradient Descent" regenerateSignal={activityRegenerateSignal} />
    </section>
  )
}

function App() {
  const [topic, setTopic] = useState(TOPICS[0])

  return (
    <VisualizationProvider activeTopic={topic}>
      <div className="app-shell">
        <main className="app-main">
          <header className="top">
            <h1>AI & Big Data Interactive Learning Toolkit</h1>
            <p>Explore each concept visually, step-by-step, then test yourself with quick quizzes.</p>
          </header>

          <nav className="tabs">
            {TOPICS.map((tab) => (
              <button key={tab} type="button" className={tab === topic ? 'active' : ''} onClick={() => setTopic(tab)}>
                {tab}
              </button>
            ))}
          </nav>

          {topic === 'MapReduce' && <MapReduceModule />}
          {topic === 'Embeddings' && <EmbeddingsExplorer quizItems={QUIZZES.embeddings} />}
          {topic === 'Gradient Descent' && <GradientDescentModule />}
        </main>

        <TutorChatbot />
      </div>
    </VisualizationProvider>
  )
}

export default App
