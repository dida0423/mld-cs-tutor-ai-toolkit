function normalizeFeedback(feedback) {
  const correct = String(feedback?.correct ?? 'Correct.').trim() || 'Correct.'
  const incorrect =
    String(feedback?.incorrect ?? 'Try again and use the concept clues above.').trim() ||
    'Try again and use the concept clues above.'
  return { correct, incorrect }
}

/** Unique lowercase word keys across all chunks (shuffle / reduce buckets). */
export function computeShuffleTargetsFromData(data) {
  const keys = new Set()
  for (const line of data ?? []) {
    for (const w of String(line).split(/\s+/).filter(Boolean)) {
      keys.add(w.toLowerCase())
    }
  }
  const out = [...keys].sort()
  return out.length ? out : ['token']
}

const NODES = ['node_1', 'node_2']

/**
 * Fixed MapReduce flow (assign → emit → shuffle → reduce). Shuffle targets are derived from `data`.
 * Returns a raw activity object suitable for `normalizeActivity(..., 'MapReduce')`.
 */
export function buildMapReduceActivityRaw(goal, data) {
  const lines = Array.isArray(data) ? data.map((x) => String(x).trim()).filter(Boolean) : []
  const shuffleTargets = computeShuffleTargetsFromData(lines)

  return {
    topic: 'MapReduce',
    goal: goal || 'Simulate a full MapReduce word-count execution on new input.',
    initial_state: {
      data: lines,
      nodes: [...NODES],
      node_assignment: {},
      map_output: [],
      shuffle_output: {},
      reduce_output: {},
    },
    steps: [
      {
        step_id: 1,
        type: 'map_assign',
        instruction: 'Assign each data chunk to a worker node.',
        interaction_type: 'drag',
        input_keys: ['data', 'nodes'],
        output_key: 'node_assignment',
        targets: [...NODES],
        validation: 'Every chunk must be assigned to exactly one node.',
        feedback: normalizeFeedback({
          correct: 'Good. Every chunk is assigned so map tasks can run.',
          incorrect: 'Each chunk needs exactly one node assignment.',
        }),
      },
      {
        step_id: 2,
        type: 'map_emit',
        instruction: 'Run the map phase to emit (word, 1) pairs from assigned chunks.',
        interaction_type: 'click',
        options: ['Emit map output'],
        input_keys: ['node_assignment'],
        output_key: 'map_output',
        validation: 'Map output should contain one pair per token.',
        feedback: normalizeFeedback({
          correct: 'Map output generated. Each token produced (word,1).',
          incorrect: 'Run map after assignments are complete.',
        }),
      },
      {
        step_id: 3,
        type: 'shuffle_group',
        instruction: 'Shuffle: drag each emitted pair to the bucket for its word key.',
        interaction_type: 'drag',
        input_keys: ['map_output'],
        output_key: 'shuffle_output',
        targets: shuffleTargets,
        validation: 'All pairs must be grouped under the matching key.',
        feedback: normalizeFeedback({
          correct: 'Nice. Keys are grouped and ready for reducers.',
          incorrect: 'Place each pair under its exact key.',
        }),
      },
      {
        step_id: 4,
        type: 'reduce_aggregate',
        instruction: 'Reduce: set the final count for each word key.',
        interaction_type: 'select',
        input_keys: ['shuffle_output'],
        output_key: 'reduce_output',
        validation: 'Each reduce count must equal grouped list length.',
        feedback: normalizeFeedback({
          correct: 'Reduce complete. You produced final word counts.',
          incorrect: 'Each reduced count should match how many values are in that key group.',
        }),
      },
    ],
  }
}
