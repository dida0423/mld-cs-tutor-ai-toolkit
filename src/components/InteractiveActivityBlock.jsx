import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildMapReduceActivityFromScenario,
  engineActivityRunnable,
  fallbackActivity,
  generateMapReduceScenarioData,
  generateTopicActivity,
  getMapReduceChunks,
  normalizeActivity,
} from '../services/activityGeneration.js'

/** v2: simulation schema (initial_state + typed steps). v1 cleared on load if present. */
const ACTIVITY_CACHE_KEY = 'mld_activity_cache_v2'
/** MapReduce: LLM only refreshes { goal, data }; steps are fixed in code. */
const MAP_REDUCE_INPUT_CACHE_KEY = 'mld_mapreduce_sim_input_v1'
const PROGRESS_CACHE_KEY = 'mld_activity_progress_v2'
const LEGACY_ACTIVITY_KEY = 'mld_activity_cache_v1'
const LEGACY_PROGRESS_KEY = 'mld_activity_progress_v1'

function readStore(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore storage errors */
  }
}

function clearLegacyActivityCache() {
  try {
    window.localStorage.removeItem(LEGACY_ACTIVITY_KEY)
    window.localStorage.removeItem(LEGACY_PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

/** Reject cached blobs from older builds or malformed model JSON. */
function isSimulationActivityValid(topic, activity) {
  if (!activity || typeof activity !== 'object') return false
  if (!activity.initial_state || typeof activity.initial_state !== 'object') return false
  if (!Array.isArray(activity.steps) || activity.steps.length < 3) return false
  if (!engineActivityRunnable(topic, activity)) return false
  for (const s of activity.steps) {
    const it = String(s.interaction_type ?? '').toLowerCase()
    if (!['drag', 'click', 'select'].includes(it)) return false
    if (it === 'drag') {
      const targets = Array.isArray(s.targets) ? s.targets : []
      if (targets.length < 1) return false
    }
    if (it === 'select') {
      const opts = Array.isArray(s.options) ? s.options : []
      const st = normalize(s.type)
      /* reduce_aggregate uses the custom reduce grid, not option chips */
      if (opts.length < 1 && st !== 'reduce_aggregate') return false
    }
  }
  return true
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

/** Default click labels when the model omits `options` for known step types. */
function effectiveStepOptions(step) {
  if (!step) return []
  const raw = Array.isArray(step.options) ? step.options : []
  if (raw.length > 0) return raw
  const t = normalize(step.type)
  const it = String(step.interaction_type ?? '').toLowerCase()
  if (it === 'click') {
    if (t === 'map_emit') return ['Emit map output']
    if (t === 'run_iteration') return ['Advance 2 iterations']
  }
  return []
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function computeGradient(point) {
  return { dx: 2 * point.x, dy: 1.2 * point.y }
}

export function InteractiveActivityBlock({ topic, regenerateSignal = 0 }) {
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [stepStates, setStepStates] = useState({})
  const [simState, setSimState] = useState({})
  const prevSignalRef = useRef(regenerateSignal)
  const undoStackRef = useRef([])
  const skipUndoPushRef = useRef(false)
  const [canUndo, setCanUndo] = useState(false)

  const currentStep = activity?.steps?.[stepIndex] ?? null
  const stepState = stepStates[stepIndex] ?? {}
  const complete = activity ? stepIndex >= activity.steps.length : false

  const persistActivity = useCallback((nextActivity) => {
    const cache = readStore(ACTIVITY_CACHE_KEY)
    cache[topic] = nextActivity
    writeStore(ACTIVITY_CACHE_KEY, cache)
  }, [topic])

  const persistProgress = useCallback((nextStepIndex, nextStates, nextSimState) => {
    const cache = readStore(PROGRESS_CACHE_KEY)
    cache[topic] = {
      stepIndex: nextStepIndex,
      stepStates: nextStates,
      simState: nextSimState ?? cache[topic]?.simState,
    }
    writeStore(PROGRESS_CACHE_KEY, cache)
  }, [topic])

  const pushUndoSnapshot = useCallback(() => {
    if (topic !== 'MapReduce' || skipUndoPushRef.current) return
    undoStackRef.current.push({
      stepIndex,
      simState: deepClone(simState),
      stepStates: deepClone(stepStates),
    })
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
    setCanUndo(true)
  }, [topic, stepIndex, simState, stepStates])

  const generateAndCacheNewActivity = useCallback(async () => {
    setLoading(true)
    setError(null)
    undoStackRef.current = []
    setCanUndo(false)
    try {
      if (topic === 'MapReduce') {
        const inputCache = readStore(MAP_REDUCE_INPUT_CACHE_KEY)
        const historyGoals = inputCache?.goal ? [inputCache.goal] : []
        let goal = 'Simulate a simple, short MapReduce word-count run on fresh input lines.'
        let data = null
        try {
          const scenario = await generateMapReduceScenarioData({ excludedGoals: historyGoals })
          goal = scenario.goal
          data = scenario.data
        } catch (e) {
          const fb = fallbackActivity('MapReduce')
          goal = fb.goal
          data = fb.initial_state?.data ?? ['cat dog cat', 'dog bird']
          setError(`Using sample input lines (${e?.message ?? 'could not reach model'}).`)
        }
        writeStore(MAP_REDUCE_INPUT_CACHE_KEY, { goal, data })
        const generated = buildMapReduceActivityFromScenario({ goal, data })
        setActivity(generated)
        const init = deepClone(generated.initial_state ?? {})
        setSimState(init)
        setStepIndex(0)
        setStepStates({})
        persistProgress(0, {}, init)
        return
      }

      const cache = readStore(ACTIVITY_CACHE_KEY)
      const historyGoals = cache[topic]?.goal ? [cache[topic].goal] : []
      const generated = await generateTopicActivity({ topic, excludedGoals: historyGoals })
      setActivity(generated)
      setSimState(deepClone(generated.initial_state ?? {}))
      persistActivity(generated)
      const init = deepClone(generated.initial_state ?? {})
      setStepIndex(0)
      setStepStates({})
      persistProgress(0, {}, init)
    } catch (e) {
      const fallback = fallbackActivity(topic)
      setActivity(fallback)
      setSimState(deepClone(fallback.initial_state ?? {}))
      persistActivity(fallback)
      const init = deepClone(fallback.initial_state ?? {})
      setStepIndex(0)
      setStepStates({})
      persistProgress(0, {}, init)
      setError(
        `Could not generate a new activity (${e?.message ?? 'error'}). Loaded a guided fallback activity for ${topic}.`
      )
    } finally {
      setLoading(false)
    }
  }, [persistActivity, persistProgress, topic])

  useEffect(() => {
    clearLegacyActivityCache()

    const progressCache = readStore(PROGRESS_CACHE_KEY)
    const cachedProgress = progressCache[topic]

    if (topic === 'MapReduce') {
      const input = readStore(MAP_REDUCE_INPUT_CACHE_KEY)
      const validInput = input && Array.isArray(input.data) && input.data.length >= 2
      if (validInput) {
        const reconciled = buildMapReduceActivityFromScenario({ goal: input.goal, data: input.data })
        const sameData =
          cachedProgress?.simState &&
          Array.isArray(cachedProgress.simState.data) &&
          JSON.stringify(cachedProgress.simState.data) === JSON.stringify(reconciled.initial_state.data)
        setActivity(reconciled)
        undoStackRef.current = []
        setCanUndo(false)
        if (sameData) {
          setSimState(deepClone(cachedProgress.simState))
          setStepIndex(Number(cachedProgress?.stepIndex ?? 0))
          setStepStates(cachedProgress?.stepStates ?? {})
        } else {
          const init = deepClone(reconciled.initial_state ?? {})
          setSimState(init)
          setStepIndex(0)
          setStepStates({})
          persistProgress(0, {}, init)
        }
        return
      }
      void generateAndCacheNewActivity()
      return
    }

    const cache = readStore(ACTIVITY_CACHE_KEY)
    const cachedActivity = cache[topic]

    let reconciled = null
    if (cachedActivity) {
      try {
        reconciled = normalizeActivity(cachedActivity, topic)
      } catch {
        reconciled = null
      }
    }

    if (reconciled && isSimulationActivityValid(topic, reconciled)) {
      setActivity(reconciled)
      persistActivity(reconciled)
      const restoredSim =
        cachedProgress?.simState && typeof cachedProgress.simState === 'object'
          ? deepClone(cachedProgress.simState)
          : deepClone(reconciled.initial_state ?? {})
      setSimState(restoredSim)
      const restoredIndex = Number(cachedProgress?.stepIndex ?? 0)
      const restoredStates = cachedProgress?.stepStates ?? {}
      setStepIndex(restoredIndex)
      setStepStates(restoredStates)
      return
    }

    if (cachedActivity && (!reconciled || !isSimulationActivityValid(topic, reconciled))) {
      delete cache[topic]
      writeStore(ACTIVITY_CACHE_KEY, cache)
      delete progressCache[topic]
      writeStore(PROGRESS_CACHE_KEY, progressCache)
    }

    void generateAndCacheNewActivity()
  }, [generateAndCacheNewActivity, persistActivity, persistProgress, topic])

  useEffect(() => {
    if (prevSignalRef.current !== regenerateSignal) {
      prevSignalRef.current = regenerateSignal
      void generateAndCacheNewActivity()
    }
  }, [generateAndCacheNewActivity, regenerateSignal])

  const progressText = useMemo(() => {
    if (!activity) return 'Step 0 / 0'
    const idx = Math.min(stepIndex + 1, activity.steps.length)
    return `Step ${idx} / ${activity.steps.length}`
  }, [activity, stepIndex])

  function updateStepState(patch) {
    if (topic === 'MapReduce' && !skipUndoPushRef.current) {
      pushUndoSnapshot()
    }
    setStepStates((prev) => ({
      ...prev,
      [stepIndex]: { ...(prev[stepIndex] ?? {}), ...patch },
    }))
  }

  function handleUndoMapReduce() {
    if (topic !== 'MapReduce') return
    const stack = undoStackRef.current
    if (!stack.length) return
    const prev = stack.pop()
    setCanUndo(stack.length > 0)
    skipUndoPushRef.current = true
    setStepIndex(prev.stepIndex)
    setSimState(deepClone(prev.simState))
    setStepStates(deepClone(prev.stepStates))
    queueMicrotask(() => {
      skipUndoPushRef.current = false
    })
  }

  function handleClearCurrentStep() {
    if (topic !== 'MapReduce') return
    if (!skipUndoPushRef.current) {
      pushUndoSnapshot()
    }
    setStepStates((prev) => ({
      ...prev,
      [stepIndex]: {},
    }))
  }

  useEffect(() => {
    if (!activity) return
    persistProgress(stepIndex, stepStates, simState)
  }, [activity, persistProgress, simState, stepIndex, stepStates])

  function mapReduceMapOutput(state) {
    const out = []
    const assignment = state.node_assignment ?? {}
    ;getMapReduceChunks(state).forEach((chunk, idx) => {
      const chunkKey = `chunk_${idx + 1}`
      const node = assignment[chunkKey]
      if (!node) return
      chunk.split(/\s+/).filter(Boolean).forEach((word) => {
        out.push({ key: word.toLowerCase(), value: 1, node, pairId: `${word}-${idx}-${out.length}` })
      })
    })
    return out
  }

  function runStateTransition(step, state, stateForStep) {
    const next = deepClone(state)
    const stepType = normalize(step.type)

    if (topic === 'MapReduce') {
      if (stepType === 'map_assign') {
        next.node_assignment = { ...(stateForStep.itemToTarget ?? {}) }
      } else if (stepType === 'map_emit') {
        next.map_output = mapReduceMapOutput(next)
      } else if (stepType === 'shuffle_group') {
        const itemToTarget = stateForStep.itemToTarget ?? {}
        const grouped = {}
        for (const pair of next.map_output ?? []) {
          const target = itemToTarget[pair.pairId]
          if (!target) continue
          grouped[target] = [...(grouped[target] ?? []), pair.value]
        }
        next.shuffle_output = grouped
      } else if (stepType === 'reduce_aggregate') {
        next.reduce_output = { ...(stateForStep.reduceSelections ?? {}) }
      }
    } else if (topic === 'Embeddings') {
      if (stepType === 'pick_anchor') {
        next.anchor = stateForStep.selectedOption
      } else if (stepType === 'group_similarity') {
        const mapping = stateForStep.itemToTarget ?? {}
        const close = []
        const far = []
        Object.entries(mapping).forEach(([word, bucket]) => {
          if (bucket === 'closest') close.push(word)
          if (bucket === 'farther') far.push(word)
        })
        next.closest_group = close
        next.far_group = far
      } else if (stepType === 'pick_top_neighbors') {
        next.chosen_neighbors = String(stateForStep.selectedOption ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      }
    } else if (topic === 'Gradient Descent') {
      if (stepType === 'choose_direction') {
        next.direction = stateForStep.selectedOption
      } else if (stepType === 'apply_update') {
        const point = state.point
        const lr = Number(state.learning_rate ?? 0.2)
        const grad = computeGradient(point)
        const p = {
          x: Number((point.x - lr * grad.dx).toFixed(2)),
          y: Number((point.y - lr * grad.dy).toFixed(2)),
        }
        next.point = p
        next.gradient = computeGradient(p)
        next.trajectory = [...(state.trajectory ?? []), p]
      } else if (stepType === 'run_iteration') {
        let p = { ...state.point }
        const lr = Number(state.learning_rate ?? 0.2)
        const tr = [...(state.trajectory ?? [])]
        for (let i = 0; i < 2; i += 1) {
          const g = computeGradient(p)
          p = {
            x: Number((p.x - lr * g.dx).toFixed(2)),
            y: Number((p.y - lr * g.dy).toFixed(2)),
          }
          tr.push(p)
        }
        next.point = p
        next.gradient = computeGradient(p)
        next.trajectory = tr
      }
    }
    return next
  }

  function validateStep(step, state, stateForStep) {
    const stepType = normalize(step.type)
    if (topic === 'MapReduce') {
      if (stepType === 'map_assign') {
        const mapping = stateForStep.itemToTarget ?? {}
        const chunks = getMapReduceChunks(state)
        const expectedKeys = chunks.map((_, idx) => `chunk_${idx + 1}`)
        return expectedKeys.every((k) => Boolean(mapping[k])) && Object.values(mapping).every((n) => (state.nodes ?? []).includes(n))
      }
      if (stepType === 'map_emit') {
        const mapping = state.node_assignment ?? {}
        const chunks = getMapReduceChunks(state)
        const assigned = chunks.every((_, idx) => Boolean(mapping[`chunk_${idx + 1}`]))
        if (!assigned) return false
        const opts = effectiveStepOptions(step)
        if (opts.length === 0) return true
        return opts.some((o) => normalize(stateForStep.selectedOption) === normalize(o))
      }
      if (stepType === 'shuffle_group') {
        const mapping = stateForStep.itemToTarget ?? {}
        return (state.map_output ?? []).every((pair) => normalize(mapping[pair.pairId]) === normalize(pair.key))
      }
      if (stepType === 'reduce_aggregate') {
        const sels = stateForStep.reduceSelections ?? {}
        return Object.entries(state.shuffle_output ?? {}).every(([k, vals]) => Number(sels[k]) === vals.length)
      }
    }
    if (topic === 'Embeddings') {
      if (stepType === 'pick_anchor') return Boolean(stateForStep.selectedOption)
      if (stepType === 'group_similarity') {
        const mapping = stateForStep.itemToTarget ?? {}
        const rows = state.points ?? []
        const sorted = rows
          .slice()
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .map((r) => r.word)
        const top2 = new Set(sorted.slice(0, 2))
        return rows.every((r) => {
          const bucket = mapping[r.word]
          return top2.has(r.word) ? bucket === 'closest' : bucket === 'farther'
        })
      }
      if (stepType === 'pick_top_neighbors') return normalize(stateForStep.selectedOption) === 'queen, man'
    }
    if (topic === 'Gradient Descent') {
      if (stepType === 'choose_direction') return normalize(stateForStep.selectedOption) === 'negative_gradient'
      if (stepType === 'apply_update') return normalize(stateForStep.selectedOption) === normalize('(1.92, -1.90)')
      if (stepType === 'run_iteration') {
        if (!state.point) return false
        const opts = effectiveStepOptions(step)
        if (opts.length === 0) return true
        return opts.some((o) => normalize(stateForStep.selectedOption) === normalize(o))
      }
    }
    return false
  }

  function handleCheckStep() {
    if (!currentStep) return
    const correct = validateStep(currentStep, simState, stepState)
    updateStepState({
      checked: true,
      correct,
      feedback: correct ? currentStep.feedback.correct : currentStep.feedback.incorrect,
    })
    if (correct) {
      setSimState((prev) => runStateTransition(currentStep, prev, stepState))
    }
  }

  function handleNextStep() {
    if (!activity) return
    if (topic === 'MapReduce' && !skipUndoPushRef.current) {
      pushUndoSnapshot()
    }
    const next = Math.min(stepIndex + 1, activity.steps.length)
    setStepIndex(next)
  }

  function handleDropOnTarget(target, option) {
    if (!currentStep || String(currentStep.interaction_type ?? '').toLowerCase() !== 'drag') return
    updateStepState({
      itemToTarget: { ...(stepState.itemToTarget ?? {}), [option]: target },
      checked: false,
      correct: false,
      feedback: null,
    })
  }

  function dragItemsForCurrentStep() {
    if (!currentStep) return []
    const stepType = normalize(currentStep.type)
    if (topic === 'MapReduce' && stepType === 'map_assign') {
      return getMapReduceChunks(simState).map((chunk, idx) => ({ id: `chunk_${idx + 1}`, label: `${idx + 1}: ${chunk}` }))
    }
    if (topic === 'MapReduce' && stepType === 'shuffle_group') {
      return (simState.map_output ?? []).map((pair) => ({ id: pair.pairId, label: `(${pair.key},1)` }))
    }
    if (topic === 'Embeddings' && stepType === 'group_similarity') {
      return (simState.points ?? []).map((p) => ({ id: p.word, label: p.word }))
    }
    return []
  }

  const dragItems = dragItemsForCurrentStep()

  const chipOptions = useMemo(() => effectiveStepOptions(currentStep), [currentStep])

  const showOptionChips =
    currentStep &&
    (String(currentStep.interaction_type ?? '').toLowerCase() === 'click' ||
      String(currentStep.interaction_type ?? '').toLowerCase() === 'select') &&
    normalize(currentStep.type) !== 'reduce_aggregate' &&
    chipOptions.length > 0

  const dragTargets = Array.isArray(currentStep?.targets) ? currentStep.targets : []

  return (
    <section className="activity-block">
      <div className="activity-header">
        <h3>Interactive activity</h3>
        <div className="activity-header-row">
          <p className="muted">{progressText}</p>
          {topic === 'MapReduce' && activity && !complete && (
            <div className="activity-utility-buttons">
              <button type="button" className="activity-utility-btn" disabled={!canUndo} onClick={handleUndoMapReduce}>
                Undo
              </button>
              <button type="button" className="activity-utility-btn" onClick={handleClearCurrentStep}>
                Clear step
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && <p className="muted">Generating activity…</p>}
      {error && <p className="tutor-error">{error}</p>}

      {!loading && activity && (
        <>
          <p className="activity-goal">
            <strong>Goal:</strong> {activity.goal}
          </p>
          <div className="activity-state">
            <strong>Simulation state</strong>
            <pre>{JSON.stringify(simState, null, 2)}</pre>
          </div>

          {complete ? (
            <div className="activity-card">
              <p className="feedback ok">Activity complete. Nice work applying the concept step-by-step.</p>
              <button type="button" className="quiz-generate-btn" onClick={() => generateAndCacheNewActivity()}>
                Next Activity
              </button>
            </div>
          ) : (
            <div className="activity-card">
              <p className="quiz-question">{currentStep.instruction}</p>

              {showOptionChips && (
                <div className="quiz-options">
                  {chipOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`chip ${normalize(stepState.selectedOption) === normalize(opt) ? 'ok' : ''}`}
                      onClick={() =>
                        updateStepState({
                          selectedOption: opt,
                          checked: false,
                          correct: false,
                          feedback: null,
                        })
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {String(currentStep.interaction_type ?? '').toLowerCase() === 'drag' && (
                <div className="drag-layout">
                  <div className="drag-options">
                    {dragItems.map((item) => (
                      <div
                        key={item.id}
                        className="drag-chip"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.id)
                        }}
                      >
                        {item.label}
                      </div>
                    ))}
                  </div>
                  <div className="drag-targets">
                    {dragTargets.length === 0 && (
                      <p className="muted">No drop targets for this step. Try refreshing or generating a new activity.</p>
                    )}
                    {dragTargets.map((target) => (
                      <div
                        key={target}
                        className="drag-target"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const dropped = e.dataTransfer.getData('text/plain')
                          handleDropOnTarget(target, dropped)
                        }}
                      >
                        <strong>{target}</strong>
                        <span>
                          {dragItems
                            .filter((item) => stepState.itemToTarget?.[item.id] === target)
                            .map((item) => item.label)
                            .join(', ') || 'Drop items here'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topic === 'MapReduce' && normalize(currentStep.type) === 'reduce_aggregate' && (
                <div className="reduce-grid">
                  {Object.entries(simState.shuffle_output ?? {}).map(([key, values]) => (
                    <label key={key} className="reduce-row">
                      <span>
                        {key} from [{values.join(', ')}]
                      </span>
                      <select
                        value={stepState.reduceSelections?.[key] ?? ''}
                        onChange={(e) =>
                          updateStepState({
                            reduceSelections: {
                              ...(stepState.reduceSelections ?? {}),
                              [key]: Number(e.target.value),
                            },
                            checked: false,
                            correct: false,
                            feedback: null,
                          })
                        }
                      >
                        <option value="">Select count</option>
                        {Array.from({ length: Math.min(40, Math.max((values?.length ?? 0) + 3, 8)) }, (_, n) => n).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              <div className="button-row">
                <button type="button" onClick={handleCheckStep}>
                  Check Step
                </button>
                <button
                  type="button"
                  disabled={!stepState.checked || !stepState.correct}
                  onClick={handleNextStep}
                >
                  {stepIndex + 1 >= activity.steps.length ? 'Finish Activity' : 'Next Step'}
                </button>
              </div>

              {stepState.checked && (
                <p className={`feedback ${stepState.correct ? 'ok' : 'bad'}`}>{stepState.feedback}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
