import { chatCompletion, getChatModelName } from './openaiClient.js'
import { buildMapReduceActivityRaw } from './mapReduceSimulation.js'

function extractJsonObject(raw) {
  const t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const inner = fence ? fence[1].trim() : t
  return JSON.parse(inner)
}

function normalizeText(value, fallback = '') {
  const out = String(value ?? fallback).trim()
  return out || fallback
}

function normalizeFeedback(feedback) {
  return {
    correct: normalizeText(feedback?.correct, 'Correct.'),
    incorrect: normalizeText(feedback?.incorrect, 'Try again and use the concept clues above.'),
  }
}

function normStepType(value) {
  return String(value ?? '').trim().toLowerCase()
}

/** Chunks/lines the MapReduce UI reads (models often use `input_data` instead of `data`). */
export function getMapReduceChunks(state) {
  const s = state && typeof state === 'object' ? state : {}
  if (Array.isArray(s.data) && s.data.length) {
    return s.data.map((x) => (typeof x === 'string' ? x : String(x)))
  }
  if (Array.isArray(s.input_data) && s.input_data.length) {
    return s.input_data.map((x) => (typeof x === 'string' ? x : String(x)))
  }
  if (Array.isArray(s.inputs) && s.inputs.length) {
    return s.inputs.map((x) => (typeof x === 'string' ? x : String(x)))
  }
  return []
}

/**
 * Align model JSON with the hard-coded simulation engine (aliases + defaults).
 */
function coerceInitialStateForTopic(topic, initialState, steps) {
  const next = { ...(initialState && typeof initialState === 'object' ? initialState : {}) }

  if (topic === 'MapReduce') {
    const chunks = getMapReduceChunks(next)
    if (chunks.length && (!Array.isArray(next.data) || !next.data.length)) {
      next.data = [...chunks]
    }
    if (!Array.isArray(next.nodes) || !next.nodes.length) {
      const firstDrag = steps.find((s) => String(s.interaction_type ?? '').toLowerCase() === 'drag')
      const targets = Array.isArray(firstDrag?.targets) ? firstDrag.targets : []
      if (targets.length) next.nodes = [...targets]
      else next.nodes = ['node_1', 'node_2']
    }
    if (typeof next.node_assignment !== 'object' || next.node_assignment === null) next.node_assignment = {}
    if (!Array.isArray(next.map_output)) next.map_output = []
    if (typeof next.shuffle_output !== 'object' || next.shuffle_output === null) next.shuffle_output = {}
    if (typeof next.reduce_output !== 'object' || next.reduce_output === null) next.reduce_output = {}
  }

  if (topic === 'Embeddings') {
    let points = Array.isArray(next.points) ? next.points : []
    if (points.length < 2) {
      const fromWords = next.words ?? next.tokens ?? next.vocabulary
      if (Array.isArray(fromWords) && fromWords.length >= 2) {
        points = fromWords.map((w, i) => ({
          word: String(w),
          score: Math.max(0.05, 0.92 - i * 0.04),
        }))
      } else if (Array.isArray(next.input_data) && next.input_data.length >= 2) {
        points = next.input_data.map((w, i) => ({
          word: String(w),
          score: Math.max(0.05, 0.92 - i * 0.04),
        }))
      }
    }
    next.points = points
    if (next.anchor === undefined) next.anchor = null
    if (!Array.isArray(next.closest_group)) next.closest_group = []
    if (!Array.isArray(next.far_group)) next.far_group = []
    if (!Array.isArray(next.chosen_neighbors)) next.chosen_neighbors = []
  }

  if (topic === 'Gradient Descent') {
    if (!next.point || typeof next.point !== 'object') {
      next.point = { x: 3.2, y: -2.5 }
    }
    if (next.learning_rate === undefined) next.learning_rate = 0.2
    if (!next.gradient || typeof next.gradient !== 'object') {
      next.gradient = { dx: 2 * Number(next.point.x), dy: 1.2 * Number(next.point.y) }
    }
    if (!Array.isArray(next.trajectory)) next.trajectory = [{ ...next.point }]
    if (next.direction === undefined) next.direction = null
  }

  return next
}

const ENGINE_STEP_TYPES = {
  MapReduce: new Set(['map_assign', 'map_emit', 'shuffle_group', 'reduce_aggregate']),
  Embeddings: new Set(['pick_anchor', 'group_similarity', 'pick_top_neighbors']),
  'Gradient Descent': new Set(['choose_direction', 'apply_update', 'run_iteration']),
}

/** True if this activity can run in InteractiveActivityBlock for the given topic. */
export function engineActivityRunnable(topic, activity) {
  if (!activity?.initial_state || !Array.isArray(activity.steps) || !activity.steps.length) return false
  const allowed = ENGINE_STEP_TYPES[topic]
  if (!allowed) return false
  if (!activity.steps.every((st) => allowed.has(normStepType(st.type)))) return false

  const s = activity.initial_state

  if (topic === 'MapReduce') {
    const chunks = getMapReduceChunks(s)
    if (chunks.length < 1) return false
    if (!Array.isArray(s.nodes) || s.nodes.length < 1) return false
    return true
  }

  if (topic === 'Embeddings') {
    const pts = s.points
    if (!Array.isArray(pts) || pts.length < 2) return false
    return pts.every((p) => p && typeof p === 'object' && String(p.word ?? '').length > 0)
  }

  if (topic === 'Gradient Descent') {
    return Boolean(s.point && typeof s.point === 'object')
  }

  return false
}

export function normalizeActivity(raw, topic) {
  const initialState = raw?.initial_state && typeof raw.initial_state === 'object' ? raw.initial_state : {}
  const stepsIn = Array.isArray(raw?.steps) ? raw.steps : []
  const steps = stepsIn.slice(0, 5).map((step, idx) => {
    const stepNum = idx + 1
    const kind = normalizeText(step?.interaction_type, 'select').toLowerCase()
    return {
      step_id: stepNum,
      type: normalizeText(step?.type, `step_${stepNum}`),
      instruction: normalizeText(step?.instruction, `Perform step ${stepNum}.`),
      interaction_type: ['drag', 'click', 'select'].includes(kind) ? kind : 'select',
      input_keys: Array.isArray(step?.input_keys) ? step.input_keys.map((k) => normalizeText(k)).filter(Boolean) : [],
      output_key: normalizeText(step?.output_key, ''),
      options: Array.isArray(step?.options) ? step.options.map((x) => normalizeText(x)).filter(Boolean) : [],
      targets: Array.isArray(step?.targets) ? step.targets.map((x) => normalizeText(x)).filter(Boolean) : [],
      validation: normalizeText(step?.validation, ''),
      feedback: normalizeFeedback(step?.feedback),
    }
  })

  if (steps.length < 3) {
    throw new Error('Generated activity must contain 3-5 steps.')
  }

  const activity = {
    topic: normalizeText(raw?.topic, topic),
    goal: normalizeText(raw?.goal, `Practice ${topic} through short interactive steps.`),
    initial_state: initialState,
    steps,
  }
  activity.initial_state = coerceInitialStateForTopic(topic, activity.initial_state, activity.steps)
  return activity
}

const DEFAULT_MR_DATA = ['cat dog cat', 'dog bird']

/**
 * LLM returns only fresh scenario lines for the fixed MapReduce simulation (not steps/UI).
 */
export async function generateMapReduceScenarioData({ excludedGoals = [] } = {}) {
  const prompt = [
    'Return ONLY valid JSON (no markdown). Shape:',
    '{ "goal": "one short learning goal for this run", "data": [ "line 1 of text", "line 2", ... ] }',
    '',
    'Rules:',
    '- "data" must be 2 to 6 strings. Each string is one map input chunk (a short phrase or sentence).',
    '- Use different words across chunks so shuffle has several distinct keys (word-count style).',
    '- Keep each line under 80 characters. Use lowercase words separated by spaces.',
    '- Total number of words should be less than 10.',
    '',
    'Do not reuse goals from this list:',
    excludedGoals.length ? excludedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(none)',
  ].join('\n')

  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You output ONLY JSON. You generate diverse practice text lines for a MapReduce word-count teaching demo.',
      },
      { role: 'user', content: prompt },
    ],
    { model: getChatModelName(), maxTokens: 500, temperature: 0.65 }
  )

  const obj = extractJsonObject(raw)
  const dataIn = Array.isArray(obj.data) ? obj.data : []
  const data = dataIn
    .map((x) => String(x ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 6)
  const goal = normalizeText(obj.goal, 'Simulate a MapReduce word-count run on fresh input lines.')

  if (data.length < 2) {
    throw new Error('Model did not return at least two data lines.')
  }

  return { goal, data }
}

/** Build the canonical MapReduce activity object (fixed steps; shuffle keys from data). */
export function buildMapReduceActivityFromScenario({ goal, data }) {
  const safeData = Array.isArray(data) && data.length >= 2 ? data : DEFAULT_MR_DATA
  const raw = buildMapReduceActivityRaw(goal, safeData)
  return normalizeActivity(raw, 'MapReduce')
}

export async function generateTopicActivity({ topic, excludedGoals = [] }) {
  if (topic === 'MapReduce') {
    throw new Error('MapReduce uses generateMapReduceScenarioData and buildMapReduceActivityFromScenario instead.')
  }

  const topicContract =
    topic === 'Embeddings'
      ? [
          'TOPIC CONTRACT (Embeddings — required):',
          '- initial_state MUST include "points": an array of at least 2 objects { "word": string, "score": number } (similarity scores).',
          '- Optionally "anchor": null, "closest_group": [], "far_group": [], "chosen_neighbors": [].',
          '- Do NOT use MapReduce field names (no input_data/mapper/reducer). This is embedding / vector space practice.',
          '- Step "type" values MUST be exactly these strings (one flow, 3-5 steps): "pick_anchor", "group_similarity", "pick_top_neighbors" (repeat or extend only if needed).',
          '- pick_anchor: interaction_type "select" with options that are a subset of point words.',
          '- group_similarity: interaction_type "drag", targets exactly ["closest","farther"].',
          '- pick_top_neighbors: interaction_type "select" with plausible neighbor pair options.',
          '',
        ]
      : [
          'TOPIC CONTRACT (Gradient Descent — required):',
          '- initial_state MUST include point {x,y}, learning_rate, gradient {dx,dy}, direction null, trajectory array.',
          '- Step "type" values MUST be exactly: "choose_direction", "apply_update", "run_iteration".',
          '',
        ]

  const prompt = [
    `Generate one interactive learning activity for topic "${topic}".`,
    'Output only valid JSON object. No markdown.',
    'Need 3-5 steps.',
    'This is a STATEFUL SIMULATION, not a quiz.',
    'Allowed interaction_type values: "drag", "click", "select".',
    '',
    ...topicContract,
    'Schema:',
    '{',
    '  "topic": "string",',
    '  "goal": "string",',
    '  "initial_state": {',
    '    "... state needed for this simulation ..."',
    '  },',
    '  "steps": [',
    '    {',
    '      "step_id": 1,',
    '      "type": "algorithmic step name",',
    '      "instruction": "string",',
    '      "interaction_type": "drag|click|select",',
    '      "input_keys": ["state_key_1"],',
    '      "output_key": "state_key_to_update",',
    '      "options": ["optional choices if click/select"],',
    '      "targets": ["optional targets if drag"],',
    '      "validation": "rule text for correctness",',
    '      "feedback": {',
    '        "correct": "concise positive feedback",',
    '        "incorrect": "concise corrective feedback"',
    '      }',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Steps must represent execution state transitions of the algorithm/process.',
    '- Each step should depend on previous state.',
    '- Keep steps concrete and tied to what student sees in the visualization.',
    '- Keep text concise.',
    '',
    'Do not reuse these recent goals:',
    excludedGoals.length ? excludedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n') : '(none)',
  ].join('\n')

  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You create interactive CS/ML learning activities. Return ONLY strict JSON object matching schema.',
      },
      { role: 'user', content: prompt },
    ],
    { model: getChatModelName(), maxTokens: 1500, temperature: 0.35 }
  )

  const activity = normalizeActivity(extractJsonObject(raw), topic)
  if (!engineActivityRunnable(topic, activity)) {
    throw new Error('Generated activity is not compatible with the interactive engine for this topic.')
  }
  return activity
}

export function fallbackActivity(topic) {
  const library = {
    MapReduce: {
      goal: 'Simulate a full MapReduce word-count execution.',
      initial_state: {
        data: ['cat dog cat', 'dog bird'],
        nodes: ['node_1', 'node_2'],
        node_assignment: {},
        map_output: [],
        shuffle_output: {},
        reduce_output: {},
      },
      steps: [
        {
          step_id: 1,
          type: 'map_assign',
          instruction: 'Assign each data chunk to a node.',
          interaction_type: 'drag',
          input_keys: ['data', 'nodes'],
          output_key: 'node_assignment',
          targets: ['node_1', 'node_2'],
          validation: 'Every chunk must be assigned to exactly one node.',
          feedback: {
            correct: 'Good. Every chunk is assigned so map tasks can run.',
            incorrect: 'Each chunk needs exactly one node assignment.',
          },
        },
        {
          step_id: 2,
          type: 'map_emit',
          instruction: 'Run map execution to emit (word,1) pairs from each assigned chunk.',
          interaction_type: 'click',
          options: ['Emit map output'],
          input_keys: ['node_assignment'],
          output_key: 'map_output',
          validation: 'Map output should contain one pair per token.',
          feedback: {
            correct: 'Map output generated. Each token produced (word,1).',
            incorrect: 'Run map after assignments are complete.',
          },
        },
        {
          step_id: 3,
          type: 'shuffle_group',
          instruction: 'Group emitted pairs by key (shuffle). Drag each pair to its word bucket.',
          interaction_type: 'drag',
          input_keys: ['map_output'],
          output_key: 'shuffle_output',
          targets: ['cat', 'dog', 'bird'],
          validation: 'All pairs must be grouped under the matching key.',
          feedback: {
            correct: 'Nice. Keys are grouped and ready for reducers.',
            incorrect: 'Place each pair under its exact key.',
          },
        },
        {
          step_id: 4,
          type: 'reduce_aggregate',
          instruction: 'Set final counts for each key from grouped values.',
          interaction_type: 'select',
          input_keys: ['shuffle_output'],
          output_key: 'reduce_output',
          validation: 'Each reduce count must equal grouped list length.',
          feedback: {
            correct: 'Reduce complete. You produced final word counts.',
            incorrect: 'Each reduced count should match how many values are in that key group.',
          },
        },
      ],
    },
    Embeddings: {
      goal: 'Simulate nearest-neighbor reasoning in embedding space.',
      initial_state: {
        anchor: null,
        points: [
          { word: 'king', score: 0.92 },
          { word: 'queen', score: 0.88 },
          { word: 'apple', score: 0.35 },
          { word: 'orange', score: 0.33 },
          { word: 'man', score: 0.82 },
        ],
        closest_group: [],
        far_group: [],
        chosen_neighbors: [],
      },
      steps: [
        {
          step_id: 1,
          type: 'pick_anchor',
          instruction: 'Choose an anchor word to run similarity search.',
          interaction_type: 'select',
          options: ['king', 'apple', 'orange'],
          input_keys: ['points'],
          output_key: 'anchor',
          validation: 'Anchor must be one of the candidate words.',
          feedback: {
            correct: 'Anchor selected. Now compare other vectors to this anchor.',
            incorrect: 'Pick one anchor to start the similarity simulation.',
          },
        },
        {
          step_id: 2,
          type: 'group_similarity',
          instruction: 'Drag words into Closest vs Farther buckets relative to the anchor.',
          interaction_type: 'drag',
          input_keys: ['anchor', 'points'],
          output_key: 'closest_group',
          targets: ['closest', 'farther'],
          validation: 'Higher similarity words go to closest bucket.',
          feedback: {
            correct: 'Great grouping. You separated near and far vectors.',
            incorrect: 'Use relative similarity to the anchor when grouping.',
          },
        },
        {
          step_id: 3,
          type: 'pick_top_neighbors',
          instruction: 'Select the top 2 nearest neighbors for the anchor.',
          interaction_type: 'select',
          input_keys: ['closest_group'],
          output_key: 'chosen_neighbors',
          options: ['queen, man', 'apple, orange', 'orange, man'],
          validation: 'Pick the pair with highest similarity scores.',
          feedback: {
            correct: 'Correct. You identified the highest-similarity neighbors.',
            incorrect: 'Choose the pair most semantically aligned with the anchor.',
          },
        },
      ],
    },
    'Gradient Descent': {
      goal: 'Simulate iterative gradient descent state updates.',
      initial_state: {
        point: { x: 3.2, y: -2.5 },
        learning_rate: 0.2,
        gradient: { dx: 6.4, dy: -3.0 },
        direction: null,
        trajectory: [{ x: 3.2, y: -2.5 }],
      },
      steps: [
        {
          step_id: 1,
          type: 'choose_direction',
          instruction: 'Choose the update direction for minimizing loss.',
          interaction_type: 'select',
          input_keys: ['gradient'],
          output_key: 'direction',
          options: ['negative_gradient', 'positive_gradient'],
          validation: 'Use negative gradient direction.',
          feedback: {
            correct: 'Right direction selected. Next apply the update.',
            incorrect: 'For descent, move opposite the gradient.',
          },
        },
        {
          step_id: 2,
          type: 'apply_update',
          instruction: 'Select the next point after applying one gradient descent step.',
          interaction_type: 'select',
          input_keys: ['point', 'learning_rate', 'gradient', 'direction'],
          output_key: 'point',
          options: ['(1.92, -1.90)', '(4.48, -3.10)', '(3.20, -2.50)'],
          validation: 'x_new=x-lr*dx and y_new=y-lr*dy',
          feedback: {
            correct: 'Update applied. The point moved downhill.',
            incorrect: 'Use the update rule with negative gradient.',
          },
        },
        {
          step_id: 3,
          type: 'run_iteration',
          instruction: 'Click to run two additional descent iterations and update trajectory.',
          interaction_type: 'click',
          options: ['Advance 2 iterations'],
          input_keys: ['point', 'trajectory'],
          output_key: 'trajectory',
          validation: 'Trajectory should append new downhill points.',
          feedback: {
            correct: 'Great. You advanced the optimizer trajectory.',
            incorrect: 'Run iterations after the point update step.',
          },
        },
      ],
    },
  }

  const base = library[topic] ?? library.MapReduce
  return normalizeActivity({ topic, ...base }, topic)
}
