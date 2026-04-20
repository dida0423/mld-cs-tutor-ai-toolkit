import { useCallback, useMemo, useState } from 'react'
import { chatCompletion, getChatModelName } from '../services/openaiClient.js'
import { generateAdaptiveQuizBatch } from '../services/quizGeneration.js'

/**
 * Adaptive quiz: 3 questions per batch, immediate feedback, then "Generate New Questions"
 * via OpenAI (difficulty adapts to last batch; avoids repeating prior stems in-session).
 */
export function QuizBlock({
  title,
  items: initialItems,
  quizTopicName = 'this topic',
  enableAiFeedback = true,
  onBatchRegenerated,
}) {
  const [batchId, setBatchId] = useState(0)
  const [items, setItems] = useState(() => initialItems.map((q) => ({ ...q })))
  const [answers, setAnswers] = useState({})
  const [aiNotes, setAiNotes] = useState({})
  const [aiLoading, setAiLoading] = useState({})
  const [generateError, setGenerateError] = useState(null)
  const [generateLoading, setGenerateLoading] = useState(false)

  /** All question stems shown in this topic session (initial + generated), to avoid repeats. */
  const [seenStems, setSeenStems] = useState(() => initialItems.map((q) => q.question))

  const answeredCount = Object.keys(answers).length
  const allAnswered = items.length > 0 && answeredCount >= items.length

  const performanceSummary = useMemo(() => {
    return items.map((item, i) => ({
      question: item.question,
      choices: item.choices,
      answer: item.answer,
      userIndex: answers[i],
      correct: answers[i] === item.answer,
    }))
  }, [items, answers])

  async function requestAiHelp(qIdx, item, wrongIdx) {
    setAiLoading((prev) => ({ ...prev, [qIdx]: true }))
    try {
      const wrongText = item.choices[wrongIdx]
      const correctText = item.choices[item.answer]
      const prompt = [
        `You are tutoring a student working on "${quizTopicName}".`,
        `Quiz question: ${item.question}`,
        `Correct answer: ${correctText}`,
        `Student chose: ${wrongText}`,
        '',
        'Explain briefly why that choice is tempting but incorrect, restate the key idea, and end with one very short follow-up question the student can answer mentally.',
        'Keep it under 120 words.',
      ].join('\n')

      const reply = await chatCompletion(
        [
          { role: 'system', content: 'You write clear, encouraging micro-explanations for learners.' },
          { role: 'user', content: prompt },
        ],
        { model: getChatModelName(), maxTokens: 400 }
      )
      setAiNotes((prev) => ({ ...prev, [qIdx]: reply }))
    } catch (e) {
      setAiNotes((prev) => ({
        ...prev,
        [qIdx]: `Could not reach the AI tutor (${e?.message ?? 'error'}). Check OPENAI_API_KEY and restart the dev server.`,
      }))
    } finally {
      setAiLoading((prev) => ({ ...prev, [qIdx]: false }))
    }
  }

  const handleGenerateNew = useCallback(async () => {
    if (!allAnswered) return
    setGenerateError(null)
    setGenerateLoading(true)
    try {
      const next = await generateAdaptiveQuizBatch({
        topicLabel: quizTopicName,
        lastBatchPerformance: performanceSummary,
        excludedQuestionStems: seenStems,
      })
      setItems(next)
      setAnswers({})
      setAiNotes({})
      setBatchId((b) => b + 1)
      setSeenStems((prev) => [...prev, ...next.map((q) => q.question)])
      if (onBatchRegenerated) onBatchRegenerated(next)
    } catch (e) {
      setGenerateError(e?.message ?? String(e))
    } finally {
      setGenerateLoading(false)
    }
  }, [allAnswered, performanceSummary, quizTopicName, seenStems, onBatchRegenerated])

  return (
    <section className="quiz">
      <h3>{title}</h3>

      {items.map((item, qIdx) => {
        const selected = answers[qIdx]
        const showFeedback = selected !== undefined
        const isCorrect = selected === item.answer

        return (
          <div key={`${batchId}-${qIdx}-${item.question.slice(0, 24)}`} className="quiz-card">
            <p className="quiz-question">{item.question}</p>
            <div className="quiz-options">
              {item.choices.map((choice, cIdx) => (
                <button
                  key={`${choice}-${cIdx}`}
                  type="button"
                  className={`chip ${selected === cIdx ? (cIdx === item.answer ? 'ok' : 'bad') : ''}`}
                  onClick={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      [qIdx]: cIdx,
                    }))
                  }
                >
                  {choice}
                </button>
              ))}
            </div>
            {showFeedback && (
              <>
                <p className={`feedback ${isCorrect ? 'ok' : 'bad'}`}>
                  {isCorrect ? 'Correct.' : 'Not quite.'} {item.explanation}
                </p>
                {!isCorrect && enableAiFeedback && (
                  <div className="quiz-ai">
                    <button
                      type="button"
                      className="quiz-ai-btn"
                      disabled={aiLoading[qIdx]}
                      onClick={() => requestAiHelp(qIdx, item, selected)}
                    >
                      {aiLoading[qIdx] ? 'Asking AI…' : 'AI: explain my mistake'}
                    </button>
                    {aiNotes[qIdx] && <p className="quiz-ai-note">{aiNotes[qIdx]}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {allAnswered && (
        <div className="quiz-generate-wrap">
          <button
            type="button"
            className="quiz-generate-btn"
            disabled={generateLoading}
            onClick={handleGenerateNew}
          >
            {generateLoading ? 'Generating…' : 'Generate New Questions'}
          </button>
          {generateError && <p className="tutor-error quiz-generate-error">{generateError}</p>}
          <p className="quiz-generate-hint muted">
            Next batch adapts to your results ({performanceSummary.filter((p) => p.correct).length}/3 correct) and avoids
            repeating earlier stems this session.
          </p>
        </div>
      )}
    </section>
  )
}
