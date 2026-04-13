import { useState } from 'react'
import { chatCompletion, getChatModelName } from '../services/openaiClient.js'

/**
 * Multiple-choice checks with static feedback plus optional LLM follow-up when answers are wrong.
 */
export function QuizBlock({ title, items, quizTopicName = 'this topic', enableAiFeedback = true }) {
  const [answers, setAnswers] = useState({})
  const [aiNotes, setAiNotes] = useState({})
  const [aiLoading, setAiLoading] = useState({})

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

  return (
    <section className="quiz">
      <h3>{title}</h3>
      {items.map((item, qIdx) => {
        const selected = answers[qIdx]
        const showFeedback = selected !== undefined
        const isCorrect = selected === item.answer

        return (
          <div key={item.question} className="quiz-card">
            <p className="quiz-question">{item.question}</p>
            <div className="quiz-options">
              {item.choices.map((choice, cIdx) => (
                <button
                  key={choice}
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
    </section>
  )
}
