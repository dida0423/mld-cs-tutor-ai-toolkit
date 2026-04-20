import { chatCompletion, getChatModelName } from './openaiClient.js'

/**
 * Parses model output into a JSON array (handles optional ```json fences).
 */
function extractJsonArray(raw) {
  const t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const inner = fence ? fence[1].trim() : t
  const parsed = JSON.parse(inner.startsWith('[') ? inner : `[${inner}]`)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  return parsed
}

/**
 * Maps API shape to internal quiz item: choices[3], answer index 0..2.
 * API: options = three strings, correct_answer = "A"|"B"|"C"
 */
export function normalizeGeneratedQuestion(obj) {
  const options = obj.options
  if (!Array.isArray(options) || options.length !== 3) {
    throw new Error('Each question must have exactly 3 options')
  }
  const letter = String(obj.correct_answer ?? '').trim().toUpperCase()
  const map = { A: 0, B: 1, C: 2 }
  if (!(letter in map)) {
    throw new Error('correct_answer must be "A", "B", or "C"')
  }
  return {
    question: String(obj.question ?? '').trim(),
    choices: options.map((o) => String(o).trim()),
    answer: map[letter],
    explanation: String(obj.explanation ?? '').trim(),
  }
}

/**
 * Generates 3 new MCQs adapted to prior performance. Questions must not repeat excluded stems.
 *
 * @param {object} params
 * @param {string} params.topicLabel - e.g. "MapReduce"
 * @param {Array<{ question: string, choices: string[], answer: number, userIndex: number, correct: boolean }>} params.lastBatchPerformance
 * @param {string[]} params.excludedQuestionStems - all prior question texts for this topic (session)
 */
export async function generateAdaptiveQuizBatch({ topicLabel, lastBatchPerformance, excludedQuestionStems }) {
  const correctCount = lastBatchPerformance.filter((p) => p.correct).length
  let difficultyInstruction =
    'Match the prior batch difficulty: one small step in depth or context, still concise.'
  if (correctCount <= 1) {
    difficultyInstruction =
      'The student struggled. Use simpler wording, shorter stems, and more concrete, guided scenarios. Avoid trick questions.'
  } else if (correctCount >= 3) {
    difficultyInstruction =
      'The student answered all correctly. Increase challenge slightly: require one extra inference or a finer distinction, but keep stems under 2 sentences each.'
  }

  const perfLines = lastBatchPerformance
    .map((p, i) => {
      const picked = p.choices[p.userIndex]
      const right = p.choices[p.answer]
      return `Question ${i + 1}: "${p.question}"\n  Result: ${p.correct ? 'CORRECT' : 'INCORRECT'}\n  Student chose: ${picked}\n  Correct answer: ${right}`
    })
    .join('\n\n')

  const excludedSlice = excludedQuestionStems.slice(-40)
  const excludedBlock =
    excludedSlice.length > 0 ? excludedSlice.map((q, i) => `${i + 1}. ${q}`).join('\n') : '(none yet)'

  const userPrompt = [
    `Create exactly 3 multiple-choice questions about "${topicLabel}" for an interactive CS/ML lab.`,
    '',
    'Difficulty:',
    difficultyInstruction,
    '',
    'Previous batch performance (adapt to this):',
    perfLines || '(no prior batch — first generation)',
    '',
    'Do NOT repeat or closely paraphrase any of these question stems (write wholly new stems):',
    excludedBlock,
    '',
    'Output ONLY a JSON array (no markdown, no commentary) with 3 objects of this exact shape:',
    '[',
    '  {',
    '    "question": "string",',
    '    "options": ["first answer text", "second answer text", "third answer text"],',
    '    "correct_answer": "A",',
    '    "explanation": "1-2 short educational sentences"',
    '  }',
    ']',
    '',
    'Rules:',
    '- "options" must be three distinct, substantive answer strings (not the letters A/B/C alone).',
    '- "correct_answer" must be exactly "A", "B", or "C" matching the index of the correct option (A=first, B=second, C=third). Randomize the correct answer for each question.',
    '- Explanations: concise.',
    '- Questions must be distinct from each other and from the excluded list.',
  ].join('\n')

  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You write clear, fair multiple-choice questions for undergraduates. Respond with ONLY valid JSON: one array of exactly 3 objects. No markdown fences.',
      },
      { role: 'user', content: userPrompt },
    ],
    { model: getChatModelName(), maxTokens: 1400, temperature: 0.35 }
  )

  const arr = extractJsonArray(raw)
  if (arr.length !== 3) throw new Error(`Expected 3 questions, got ${arr.length}`)
  return arr.map(normalizeGeneratedQuestion)
}
