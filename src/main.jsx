import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { io } from 'socket.io-client'
import './styles.css'
import introVideo from './quizverse theme.mp4'

// Always talk to the origin that served the app. Vite proxies /socket.io and
// /api to the Node server in development; in production the Node server serves
// both. This keeps the host deck alive behind HTTPS, LAN addresses and tunnels,
// where a hardcoded port 3001 is unreachable.
const socket = io()
const savedId = localStorage.getItem('quizverse-participant')

function App() {
  const [state, setState] = useState({ 
    registrationOpen: true, 
    round: 'lobby', 
    participants: [], 
    questions: [],
    eventId: 'event-1',
    questionCount: 0,
    winners: null,
    winnersReleasedAt: null,
    winnerRecommendations: []
  })
  const [participant, setParticipant] = useState(null)
  
  // Round 1 State
  const [quiz, setQuiz] = useState({ questions: [], startedAt: null, durationSeconds: 1800 })
  const [draftAnswers, setDraftAnswers] = useState({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(1800)

  // Round 2 State (Codebase Debugging)
  const [r2Quiz, setR2Quiz] = useState({ questions: [], startedAt: null, durationSeconds: 1800 })
  const [r2Drafts, setR2Drafts] = useState({})
  const [r2TestResults, setR2TestResults] = useState({})
  const [r2Index, setR2Index] = useState(0)
  const [r2SecondsLeft, setR2SecondsLeft] = useState(1800)

  // Round 3 State (Rapid Fire)
  const [rapidQuiz, setRapidQuiz] = useState({ questions: [], startedAt: null, durationSeconds: 900, draftAnswers: {}, draftCodes: {}, testResults: {} })
  const [rapidIndex, setRapidIndex] = useState(0)
  const [rapidSelected, setRapidSelected] = useState(null)
  const [rapidSecondsLeft, setRapidSecondsLeft] = useState(900)

  const [scoreReveal, setScoreReveal] = useState(null)
  const [showWinnerCelebration, setShowWinnerCelebration] = useState(false)
  const revealHandledRef = useRef(null)
  const rapidTimeoutSubmittedRef = useRef(false)
  const [view, setView] = useState(savedId ? 'lobby' : 'home')
  const [form, setForm] = useState({ name: '', college: '', department: '', year: 'Final year' })
  const [notice, setNotice] = useState('')
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('quizverse-host-auth') === '1')
  const [online, setOnline] = useState(socket.connected)
  const [hostSessionExpired, setHostSessionExpired] = useState(false)
  const [showIntro, setShowIntro] = useState(() => {
    if (sessionStorage.getItem('quizverse-host-auth') === '1' || savedId) return false
    return !sessionStorage.getItem('quizverse-intro-seen')
  })
  const [showRules, setShowRules] = useState(false)

  const showToast = (msg, duration = 4000) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), duration)
  }

  const expireHostSession = () => {
    sessionStorage.removeItem('quizverse-host-auth')
    sessionStorage.removeItem('quizverse-host-token')
    setHostSessionExpired(true)
  }

  const closeIntro = () => {
    sessionStorage.setItem('quizverse-intro-seen', '1')
    setShowIntro(false)
  }

  useEffect(() => {
    // Initial fetch fallback for instant state load
    fetch('/api/state')
      .then((res) => res.json())
      .then((data) => {
        if (data) setState(data)
      })
      .catch(() => {})

    socket.on('connect', () => {
      setOnline(true)
      socket.emit('state:request')
      if (savedId) {
        socket.emit('participant:restore', savedId)
      }
      // Re-authenticate every reconnect: the server only tracks admin on
      // the current socket, so a fresh connection must present the token.
      // A timeout here also catches a stale server that never answers.
      if (sessionStorage.getItem('quizverse-host-auth') === '1') {
        socket.timeout(2500).emit('admin:verify', sessionStorage.getItem('quizverse-host-token'), (err, result) => {
          if (err || result?.error) expireHostSession()
        })
      }
    })

    socket.on('state:update', (next) => {
      if (next) {
        setState(next)
        if (!next.winnersReleasedAt) setShowWinnerCelebration(false)
      }
    })

    socket.on('winners:released', ({ winners, releasedAt }) => {
      setState((current) => ({ ...current, winners, winnersReleasedAt: releasedAt }))
      setShowWinnerCelebration(true)
    })

    socket.on('disconnect', () => setOnline(false))
    
    socket.on('participant:restored', (next) => {
      setParticipant(next)
      if (next?.draftAnswers) setDraftAnswers(next.draftAnswers)
      if (next?.quizQuestions?.length) {
        setQuiz((curr) => ({
          ...curr,
          questions: next.quizQuestions,
          startedAt: next.quizStartedAt || curr.startedAt
        }))
      }
      if (next?.r2DraftCodes) setR2Drafts(next.r2DraftCodes)
      if (next?.r2TestResults) setR2TestResults(next.r2TestResults)
      if (next?.r2Questions?.length) {
        setR2Quiz((curr) => ({
          ...curr,
          questions: next.r2Questions,
          startedAt: next.r2StartedAt || curr.startedAt
        }))
      }
      if (next?.r3Questions?.length) {
        setRapidQuiz((curr) => ({
          ...curr,
          questions: next.r3Questions,
          startedAt: next.r3StartedAt || curr.startedAt,
          draftAnswers: next.r3DraftAnswers || {},
          draftCodes: next.r3DraftCodes || {},
          testResults: next.r3TestResults || {}
        }))
      }
    })

    socket.on('participant:quiz', (next) => {
      setQuiz(next)
      if (participant?.draftAnswers) setDraftAnswers(participant.draftAnswers)
      const elapsed = Math.floor((Date.now() - Date.parse(next.startedAt || new Date().toISOString())) / 1000)
      setSecondsLeft(Math.max(0, next.durationSeconds - elapsed))
    })

    socket.on('participant:r2-quiz', (next) => {
      setR2Quiz(next)
      if (next.draftCodes) {
        setR2Drafts((current) => ({ ...next.draftCodes, ...current }))
      }
      const elapsed = Math.floor((Date.now() - Date.parse(next.startedAt || new Date().toISOString())) / 1000)
      setR2SecondsLeft(Math.max(0, next.durationSeconds - elapsed))
    })

    socket.on('quiz:expired', () => {
      showToast('Round 1 time closed. Your responses were submitted automatically.')
      setView('lobby')
    })

    socket.on('quiz:draft-saved', ({ questionId, answer }) => {
      setDraftAnswers((current) => ({ ...current, [questionId]: answer }))
    })

    socket.on('r2:draft-saved', ({ questionId, code }) => {
      setR2Drafts((current) => ({ ...current, [questionId]: code }))
    })

    socket.on('quiz:submitted', (result) => { 
      const revealKey = `round1:${result.score}:${result.total}`
      if (revealHandledRef.current === revealKey) return
      revealHandledRef.current = revealKey
      setScoreReveal({ ...result, round: 'round1' })
      setParticipant((prev) => prev ? ({ 
        ...prev, 
        quizSubmittedAt: new Date().toISOString(), 
        status: 'submitted', 
        score: result.score, 
        roundScores: { ...(prev.roundScores || {}), round1: result.score } 
      }) : prev)
      setView('score') 
    })

    socket.on('r2:submitted', (result) => {
      if (result?.round !== 'round2' && result?.round !== undefined) return
      const revealKey = `round2:${result.score}:${result.totalScore}`
      if (revealHandledRef.current === revealKey) return
      revealHandledRef.current = revealKey
      setScoreReveal({ ...result, round: 'round2' })
      setParticipant((prev) => prev ? ({ 
        ...prev, 
        r2SubmittedAt: new Date().toISOString(), 
        status: 'submitted', 
        score: result.totalScore, 
        roundScores: { ...(prev.roundScores || {}), round2: result.score } 
      }) : prev)
      setView('score')
    })

    socket.on('participant:rapid-fire', (next) => {
      rapidTimeoutSubmittedRef.current = false
      setRapidQuiz(next)
      setRapidSelected(next.draftAnswers?.[next.questions?.[0]?.id] || null)
      setRapidSecondsLeft(Math.max(0, next.durationSeconds - Math.floor((Date.now() - Date.parse(next.startedAt || new Date().toISOString())) / 1000)))
    })

    socket.on('rapid-fire:answer-saved', ({ questionId, answer }) => {
      setRapidQuiz((current) => ({ ...current, draftAnswers: { ...(current.draftAnswers || {}), [questionId]: answer } }))
    })

    socket.on('rapid-fire:draft-saved', ({ questionId, code, testResults }) => {
      setRapidQuiz((current) => ({
        ...current,
        draftCodes: { ...(current.draftCodes || {}), [questionId]: code },
        testResults: testResults ? { ...(current.testResults || {}), [questionId]: testResults } : current.testResults
      }))
    })

    socket.on('rapid-fire:submitted', (result) => {
      const revealKey = `round3:${result.score}:${result.totalScore}`
      if (revealHandledRef.current === revealKey) return
      revealHandledRef.current = revealKey
      setScoreReveal(result)
      setParticipant((prev) => prev ? ({
        ...prev,
        r3SubmittedAt: new Date().toISOString(),
        status: 'submitted',
        score: result.totalScore,
        roundScores: { ...(prev.roundScores || {}), round3: result.score }
      }) : prev)
      setView('score')
    })

    if (socket.connected) {
      socket.emit('state:request')
      if (savedId) {
        socket.emit('participant:restore', savedId)
      }
      if (sessionStorage.getItem('quizverse-host-auth') === '1') {
        socket.timeout(2500).emit('admin:verify', sessionStorage.getItem('quizverse-host-token'), (err, result) => {
          if (err || result?.error) expireHostSession()
        })
      }
    }

    // Refresh synchronization on tab focus / visibility
    const handleSync = () => {
      if (!document.hidden) {
        socket.emit('state:request')
        if (savedId) socket.emit('participant:restore', savedId)
        if (sessionStorage.getItem('quizverse-host-auth') === '1') {
          socket.timeout(2500).emit('admin:verify', sessionStorage.getItem('quizverse-host-token'), (err, result) => {
            if (err || result?.error) expireHostSession()
          })
        }
      }
    }
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
      socket.removeAllListeners()
    }
  }, [])

  // Round 1 Timer
  useEffect(() => {
    if (!quiz.startedAt || state.round !== 'round1') return undefined
    const timer = setInterval(() => {
      const remaining = Math.max(0, quiz.durationSeconds - Math.floor((Date.now() - Date.parse(quiz.startedAt)) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) setView('lobby')
    }, 1000)
    return () => clearInterval(timer)
  }, [quiz.startedAt, quiz.durationSeconds, state.round])

  // Round 2 Timer (30 minutes)
  useEffect(() => {
    if (!r2Quiz.startedAt || state.round !== 'round2') return undefined
    const timer = setInterval(() => {
      const remaining = Math.max(0, r2Quiz.durationSeconds - Math.floor((Date.now() - Date.parse(r2Quiz.startedAt)) / 1000))
      setR2SecondsLeft(remaining)
      if (remaining === 0) setView('lobby')
    }, 1000)
    return () => clearInterval(timer)
  }, [r2Quiz.startedAt, r2Quiz.durationSeconds, state.round])

  useEffect(() => {
    if (!rapidQuiz.startedAt || state.round !== 'round3') return undefined
    const timer = setInterval(() => {
      const remaining = Math.max(0, rapidQuiz.durationSeconds - Math.floor((Date.now() - Date.parse(rapidQuiz.startedAt)) / 1000))
      setRapidSecondsLeft(remaining)
      if (remaining === 0 && !rapidTimeoutSubmittedRef.current) {
        rapidTimeoutSubmittedRef.current = true
        submitRapidFire()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [rapidQuiz.startedAt, rapidQuiz.durationSeconds, state.round])

  useEffect(() => {
    if (!participant) return
    const current = state.participants.find((item) => item.id === participant.id)
    if (current) setParticipant(current)
    if (current?.status === 'eliminated') setView('eliminated')
  }, [state.participants, participant?.id])

  const completedRound1 = Boolean(participant?.quizSubmittedAt || (participant?.status === 'submitted' && participant?.roundScores?.round1 !== undefined && participant?.quizQuestions?.length > 0))
  const completedRound2 = Boolean(participant?.r2SubmittedAt)
  const completedRound3 = Boolean(participant?.r3SubmittedAt)

  const activeQuestion = quiz.questions[questionIndex]
  const activeR2Question = r2Quiz.questions[r2Index]
  const activeRapidQuestion = rapidQuiz.questions[rapidIndex]

  const register = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return showToast('Please enter your name or handle')
    socket.emit('participant:register', { ...form, id: savedId }, (result) => {
      if (result?.error) return showToast(result.error)
      localStorage.setItem('quizverse-participant', result.participant.id)
      setParticipant(result.participant)
      setView('lobby')
      showToast(`Welcome to the Multiverse, ${result.participant.name}!`)
    })
  }

  // Round 1 Actions
  const answer = (value = selected) => {
    if (completedRound1 || !value || !activeQuestion || !participant) return
    setDraftAnswers((current) => ({ ...current, [activeQuestion.id]: value }))
    socket.emit('participant:answer', { 
      participantId: participant.id, 
      questionId: activeQuestion.id, 
      answer: value 
    })
  }

  const submitQuiz = () => {
    if (!participant || completedRound1) return
    socket.emit('participant:submit-quiz', { participantId: participant.id }, (result) => {
      if (result?.error) showToast(result.error)
    })
  }

  // Round 2 Actions
  const saveR2Code = (code, testResults) => {
    if (completedRound2 || !activeR2Question || !participant) return
    setR2Drafts((current) => ({ ...current, [activeR2Question.id]: code }))
    if (testResults) {
      setR2TestResults((current) => ({ ...current, [activeR2Question.id]: testResults }))
    }
    socket.emit('participant:r2-draft', {
      participantId: participant.id,
      questionId: activeR2Question.id,
      code,
      testResults
    })
  }

  const submitRound2 = () => {
    if (!participant || completedRound2) return
    socket.emit('participant:submit-r2', { 
      participantId: participant.id, 
      submissions: r2Drafts 
    }, (result) => {
      if (result?.error) showToast(result.error)
    })
  }

  const saveRapidAnswer = (value) => {
    if (completedRound3 || !participant || !activeRapidQuestion) return
    setRapidSelected(value)
    setRapidQuiz((current) => ({ ...current, draftAnswers: { ...(current.draftAnswers || {}), [activeRapidQuestion.id]: value } }))
    socket.emit('participant:rapid-fire-answer', { participantId: participant.id, questionId: activeRapidQuestion.id, answer: value })
  }

  const saveRapidCode = (code, testResults) => {
    if (completedRound3 || !participant || !activeRapidQuestion) return
    setRapidQuiz((current) => ({
      ...current,
      draftCodes: { ...(current.draftCodes || {}), [activeRapidQuestion.id]: code },
      testResults: testResults ? { ...(current.testResults || {}), [activeRapidQuestion.id]: testResults } : current.testResults
    }))
    socket.emit('participant:rapid-fire-draft', { participantId: participant.id, questionId: activeRapidQuestion.id, code, testResults })
  }

  const submitRapidFire = () => {
    if (!participant || completedRound3) return
    socket.emit('participant:submit-rapid-fire', { participantId: participant.id }, (result) => {
      if (result?.error) showToast(result.error)
    })
  }

  const handleEnterRound1 = () => {
    setQuestionIndex(0)
    setSelected(null)
    setView('quiz')
  }

  const handleEnterRound2 = () => {
    setR2Index(0)
    setView('r2-quiz')
  }

  const handleAnalyzeRound1 = () => {
    setQuestionIndex(0)
    setSelected(null)
    setView('quiz')
  }

  const handleAnalyzeRound2 = () => {
    setR2Index(0)
    setView('r2-quiz')
  }

  const handleEnterRapidFire = () => {
    setRapidIndex(0)
    setRapidSelected(rapidQuiz.draftAnswers?.[rapidQuiz.questions?.[0]?.id] || null)
    setView('rapid-fire')
  }

  const handleAnalyzeRapidFire = () => {
    setRapidIndex(0)
    setRapidSelected(rapidQuiz.draftAnswers?.[rapidQuiz.questions?.[0]?.id] || null)
    setView('rapid-fire')
  }

  if (isAdmin) {
    return (
      <AdminPanel 
        state={state} 
        online={online} 
        sessionExpired={hostSessionExpired}
        onExit={() => {
          sessionStorage.removeItem('quizverse-host-auth')
          sessionStorage.removeItem('quizverse-host-token')
          setIsAdmin(false)
          setView(hostSessionExpired ? 'host-login' : 'home')
          setHostSessionExpired(false)
        }} 
      />
    )
  }

  return (
    <div className={`app phase-${state.round}`}>
      {showIntro && <IntroVideo onDone={closeIntro} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      <header className="topbar">
        <button className="brand" onClick={() => setView(participant ? 'lobby' : 'home')} aria-label="Return to lobby or home">
          <div className="brand-mark">QV</div>
          <span>QUIZVERSE</span>
        </button>

        <div className="topbar-meta">
          <div className="live-badge">
            <span className="live-dot" />
            <span>LIVE EVENT</span>
          </div>
          <button className="admin-link" onClick={() => setView('host-login')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Host Sign In</span>
          </button>
        </div>
      </header>

      <main>
        {view === 'home' && (
          <Home 
            onStart={() => setView(participant ? 'lobby' : 'register')} 
            onHost={() => setView('host-login')} 
            onRules={() => setShowRules(true)} 
            hasIdentity={Boolean(participant)}
          />
        )}

        {view === 'register' && (
          <Register 
            form={form} 
            setForm={setForm} 
            onSubmit={register} 
            open={state.registrationOpen} 
            onBack={() => setView('home')} 
          />
        )}

        {view === 'host-login' && (
          <HostLogin 
            onBack={() => setView('home')} 
            onLogin={() => setIsAdmin(true)} 
            onSetState={setState}
          />
        )}

        {view === 'lobby' && (
          <Lobby 
            participant={participant} 
            round={state.round} 
            onRegister={() => setView('register')} 
            onEnterRound1={handleEnterRound1}
            onEnterRound2={handleEnterRound2}
            onAnalyzeRound1={handleAnalyzeRound1}
            onAnalyzeRound2={handleAnalyzeRound2}
            onEnterRapidFire={handleEnterRapidFire}
            onAnalyzeRapidFire={handleAnalyzeRapidFire}
            completedRound1={completedRound1}
            completedRound2={completedRound2}
            completedRound3={completedRound3}
          />
        )}

        {/* Round 1 Quiz Screen */}
        {view === 'quiz' && (
          <Quiz 
            question={activeQuestion} 
            selected={draftAnswers[activeQuestion?.id] || selected} 
            setSelected={(value) => { 
              if (completedRound1) return
              setSelected(value)
              answer(value) 
            }} 
            onAnswer={() => { 
              setSelected(null)
              setQuestionIndex((index) => Math.min(index + 1, quiz.questions.length - 1)) 
            }} 
            onPrev={() => {
              setSelected(null)
              setQuestionIndex((index) => Math.max(0, index - 1))
            }}
            onNext={() => {
              setSelected(null)
              setQuestionIndex((index) => Math.min(index + 1, quiz.questions.length - 1))
            }}
            onReview={() => setView('review')} 
            onBackToLobby={() => setView('lobby')}
            index={questionIndex} 
            total={quiz.questions.length} 
            secondsLeft={secondsLeft} 
            isCompleted={completedRound1}
          />
        )}

        {/* Round 1 Review Screen */}
        {view === 'review' && (
          <Review 
            questions={quiz.questions} 
            answers={draftAnswers} 
            onSelect={(index) => { 
              setQuestionIndex(index)
              setSelected(null)
              setView('quiz') 
            }} 
            onSubmit={submitQuiz} 
            onBackToLobby={() => setView('lobby')}
            isCompleted={completedRound1}
          />
        )}

        {/* Round 2 Debugging Screen */}
        {view === 'r2-quiz' && (
          <Round2Debugger 
            question={activeR2Question} 
            code={r2Drafts[activeR2Question?.id] || activeR2Question?.initial_code || ''} 
            onSaveCode={saveR2Code}
            index={r2Index}
            total={r2Quiz.questions.length}
            secondsLeft={r2SecondsLeft}
            onNext={() => setR2Index((idx) => Math.min(idx + 1, r2Quiz.questions.length - 1))}
            onPrev={() => setR2Index((idx) => Math.max(0, idx - 1))}
            onReview={() => setView('r2-review')}
            onBackToLobby={() => setView('lobby')}
            testResults={r2TestResults[activeR2Question?.id]}
            setTestResults={(res) => setR2TestResults((curr) => ({ ...curr, [activeR2Question.id]: res }))}
            isCompleted={completedRound2}
          />
        )}

        {/* Round 2 Review Screen */}
        {view === 'r2-review' && (
          <Round2Review 
            questions={r2Quiz.questions} 
            results={r2TestResults}
            onSelect={(index) => {
              setR2Index(index)
              setView('r2-quiz')
            }}
            onSubmit={submitRound2}
            onBackToLobby={() => setView('lobby')}
            isCompleted={completedRound2}
          />
        )}

        {view === 'rapid-fire' && (
          <RapidFire
            question={activeRapidQuestion}
            selected={rapidQuiz.draftAnswers?.[activeRapidQuestion?.id] || rapidSelected}
            setSelected={saveRapidAnswer}
            code={rapidQuiz.draftCodes?.[activeRapidQuestion?.id] || activeRapidQuestion?.initial_code || ''}
            onSaveCode={saveRapidCode}
            testResults={rapidQuiz.testResults?.[activeRapidQuestion?.id]}
            setTestResults={(result) => setRapidQuiz((current) => ({ ...current, testResults: { ...(current.testResults || {}), [activeRapidQuestion.id]: result } }))}
            index={rapidIndex}
            total={rapidQuiz.questions.length}
            secondsLeft={rapidSecondsLeft}
            onNext={() => {
              const nextIndex = Math.min(rapidIndex + 1, rapidQuiz.questions.length - 1)
              setRapidIndex(nextIndex)
              setRapidSelected(rapidQuiz.draftAnswers?.[rapidQuiz.questions[nextIndex]?.id] || null)
            }}
            onPrev={() => {
              const previousIndex = Math.max(0, rapidIndex - 1)
              setRapidIndex(previousIndex)
              setRapidSelected(rapidQuiz.draftAnswers?.[rapidQuiz.questions[previousIndex]?.id] || null)
            }}
            onReview={() => setView('rapid-review')}
            onSubmit={submitRapidFire}
            onBackToLobby={() => setView('lobby')}
            isCompleted={completedRound3}
          />
        )}

        {view === 'rapid-review' && (
          <RapidFireReview
            questions={rapidQuiz.questions}
            answers={rapidQuiz.draftAnswers || {}}
            testResults={rapidQuiz.testResults || {}}
            onSelect={(index) => {
              setRapidIndex(index)
              setRapidSelected(rapidQuiz.draftAnswers?.[rapidQuiz.questions[index]?.id] || null)
              setView('rapid-fire')
            }}
            onSubmit={submitRapidFire}
            onBackToLobby={() => setView('lobby')}
            isCompleted={completedRound3}
          />
        )}

        {view === 'score' && (
          <ScoreReveal 
            result={scoreReveal} 
            onReturnHome={() => setView('lobby')} 
            onAnalyze={() => {
              if (scoreReveal?.round === 'round2') {
                handleAnalyzeRound2()
              } else if (scoreReveal?.round === 'round3') {
                handleAnalyzeRapidFire()
              } else {
                handleAnalyzeRound1()
              }
            }}
          />
        )}

        {view === 'eliminated' && <Eliminated />}
      </main>



      {notice && view !== 'quiz' && view !== 'r2-quiz' && <div className="toast">{notice}</div>}
      {showWinnerCelebration && state.winners && state.winnersReleasedAt && <WinnerCelebration winners={state.winners} participantId={participant?.id} />}
    </div>
  )
}

function WinnerCelebration({ winners, participantId }) {
  const confetti = Array.from({ length: 56 }, (_, index) => index)
  const winner = winners.find((item) => item.participantId === participantId)
  return (
    <div className="winner-celebration" role="status" aria-live="polite">
      <div className="sparkle-field" aria-hidden="true">
        {confetti.map((index) => <i key={index} style={{ '--sparkle-index': index, left: `${(index * 17) % 100}%` }} />)}
      </div>
      <div className="party-cracker party-cracker-left" aria-hidden="true">🎉</div>
      <div className="party-cracker party-cracker-right" aria-hidden="true">🎉</div>
      <div className="winner-announcement">
        <div className="eyebrow"><span className="eyebrow-line" /><span>WINNERS RELEASED</span><span className="eyebrow-line" /></div>
        <h2>{winner ? <>You placed<br /><em>{winner.place === 1 ? '1st' : winner.place === 2 ? '2nd' : '3rd'}.</em></> : <>The podium<br /><em>is live.</em></>}</h2>
        <p>{winner ? `Congratulations, ${winner.name}. Your final score is ${winner.score} points.` : 'Celebrate the competitors who claimed the Rapid Fire podium.'}</p>
        <div className="winner-podium">
          {winners.map((item) => (
            <div className={`winner-place winner-place-${item.place}`} key={item.participantId}>
              <strong>{item.place === 1 ? '1ST' : item.place === 2 ? '2ND' : '3RD'}</strong>
              <span>{item.name}</span>
              <small>{item.score} PTS</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IntroVideo({ onDone }) {
  return (
    <div className="intro-overlay">
      <video className="intro-video" src={introVideo} autoPlay muted playsInline onEnded={onDone} />
      <div className="intro-shade" />
      <div className="intro-content">
        <div className="intro-mark">QV</div>
        <div className="intro-wordmark">QUIZVERSE</div>
        <p>THE TECH MULTIVERSE CHALLENGE</p>
      </div>
      <button className="intro-skip" onClick={onDone}>
        <span>Skip intro</span>
        <span>→</span>
      </button>
    </div>
  )
}

function Home({ onStart, onHost, onRules, hasIdentity }) {
  return (
    <section className="home page-shell">
      <div className="home-grid">
        <div className="hero-copy">
          <div className="eyebrow left">
            <span className="eyebrow-line" />
            <span>THE 2026 MULTIVERSE TOURNAMENT</span>
          </div>

          <p className="hero-kicker">A live arena across</p>
          <h1>Infinite<br /><em>Possibility.</em></h1>
          <p className="hero-body">
            Test your algorithmic instinct in Round 1 Knowledge Realm, fix broken code in Round 2 Debugging Dimension, then survive a 15-minute Rapid Fire sprint.
          </p>

          <div className="home-actions">
            <button className="primary-button" onClick={onStart}>
              <span>{hasIdentity ? 'Return to Live Arena' : 'Join the Competition'}</span>
              <span>↗</span>
            </button>
            <button className="quiet-button" onClick={onRules}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span>Field Guide & Rules</span>
            </button>
          </div>

          <button className="host-entry" onClick={onHost}>
            <span>Host Command Deck Access</span>
            <span>→</span>
          </button>

          <div className="hero-feature-pills">
            <div className="feature-pill"><b>01</b> Knowledge Realm</div>
            <div className="feature-pill"><b>02</b> Debugging Dimension</div>
            <div className="feature-pill"><b>03</b> Code Multiverse</div>
            <div className="feature-pill"><b>04</b> Grand Final</div>
          </div>
        </div>

        <div className="orbit-container" aria-hidden="true">
          <div className="orbit-scene">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="core">
              <span>QV</span>
            </div>
            <i className="star star-a" />
            <i className="star star-b" />
            <i className="star star-c" />
          </div>
        </div>
      </div>

      <div className="home-footer">
        <span>LIVE MULTIVERSE SYNC</span>
        <span>Round 1: MCQ · Round 2: Debugging · Rapid Fire: 15m</span>
        <span>Version 2.0 // Realtime</span>
      </div>
    </section>
  )
}

function RulesModal({ onClose }) {
  return (
    <div className="rules-modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow left">
              <span className="eyebrow-line" />
              <span>COMPETITION RULES</span>
            </div>
            <h2>Multiverse Field Guide</h2>
          </div>
          <button className="quiet-button" onClick={onClose}>Close ✕</button>
        </div>

        <div className="rules-grid">
          <div className="rule-card">
            <strong>01. Round 1: Knowledge Realm</strong>
            <p>Fast-paced conceptual MCQ challenges across algorithms, architectures, and systems. 30-minute time window.</p>
          </div>
          <div className="rule-card">
            <strong>02. Round 2: Debugging Dimension</strong>
            <p>Error-finding codebase arena. Identify and fix logical or syntax bugs in real JavaScript functions. Run test cases and submit within 30 minutes.</p>
          </div>
          <div className="rule-card">
            <strong>03. Real-Time Auto-Save</strong>
            <p>Code and drafts sync automatically. You can navigate, test, and revise any challenge before final lock.</p>
          </div>
          <div className="rule-card">
            <strong>04. Host Coordination</strong>
            <p>The host opens dimensions sequentially. Only surviving participants who completed Round 1 progress to Round 2.</p>
          </div>
        </div>

        <button className="primary-button full" onClick={onClose}>
          <span>Understood, Let's Compete</span>
          <span>↗</span>
        </button>
      </div>
    </div>
  )
}

function HostLogin({ onBack, onLogin, onSetState }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = (event) => {
    event.preventDefault()
    setLoading(true)
    socket.emit('admin:login', password, (result) => {
      setLoading(false)
      if (result?.error) return setError(result.error)
      sessionStorage.setItem('quizverse-host-auth', '1')
      sessionStorage.setItem('quizverse-host-token', result.hostToken || '1')
      if (result?.state && onSetState) onSetState(result.state)
      onLogin()
    })
  }

  return (
    <section className="page-shell form-shell host-login-shell">
      <div className="form-intro">
        <button className="back-button" onClick={onBack}>← Back to Home</button>
        <div className="eyebrow left">
          <span className="eyebrow-line" />
          <span>HOST AUTHENTICATION</span>
        </div>
        <h2>Open the<br /><em>Command Deck.</em></h2>
            <p>Control tournament rounds, launch Rapid Fire, evaluate live submissions, and view candidate reports.</p>
      </div>

      <form className="glass-form" onSubmit={login}>
        <div className="host-badge">
          <span>QV // HOST DECK</span>
        </div>

        <label className="field">
          <span>Host Access Key</span>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => { setPassword(e.target.value); setError('') }} 
            placeholder="Enter host password" 
            autoFocus 
            required 
          />
        </label>

        <button className="primary-button full" type="submit" disabled={loading}>
          <span>{loading ? 'Authenticating...' : 'Sign In to Host Console'}</span>
          <span>↗</span>
        </button>

        {error && <div className="form-error">{error}</div>}
        <small>Unauthorized attempts are logged. Participants should register via the player portal.</small>
      </form>
    </section>
  )
}

function Register({ form, setForm, onSubmit, open, onBack }) {
  return (
    <section className="page-shell form-shell">
      <div className="form-intro">
        <button className="back-button" onClick={onBack}>← Back to Home</button>
        <div className="eyebrow left">
          <span className="eyebrow-line" />
          <span>IDENTITY BEACON</span>
        </div>
        <h2>Choose your<br /><em>Universe.</em></h2>
        <p>Claim your identifier in the tech multiverse. The host uses this beacon to track your scores in real-time.</p>
      </div>

      {open ? (
        <form className="glass-form" onSubmit={onSubmit}>
          <Field 
            label="Participant / Handle Name" 
            value={form.name} 
            onChange={(val) => setForm({ ...form, name: val })} 
            placeholder="e.g. Peter Parker or CyberKnight" 
            required 
          />
          <Field 
            label="College / Institution" 
            value={form.college} 
            onChange={(val) => setForm({ ...form, college: val })} 
            placeholder="e.g. MIT / Stark Industries" 
            required 
          />

          <div className="form-row">
            <Field 
              label="Department" 
              value={form.department} 
              onChange={(val) => setForm({ ...form, department: val })} 
              placeholder="e.g. Computer Science" 
              required 
            />
            <label className="field">
              <span>Academic Year</span>
              <select 
                value={form.year} 
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              >
                <option>First year</option>
                <option>Second year</option>
                <option>Third year</option>
                <option>Final year</option>
                <option>Alumni / Pro</option>
              </select>
            </label>
          </div>

          <button className="primary-button full" type="submit">
            <span>Transmit Identity & Enter</span>
            <span>↗</span>
          </button>
          <small>By entering, you agree to compete fairly across all dimensions.</small>
        </form>
      ) : (
        <div className="closed-panel">
          <div className="status-icon">✕</div>
          <h3>Registration Gate Sealed</h3>
          <p>The host has closed the entry portal for this live event session.</p>
        </div>
      )}
    </section>
  )
}

function Field({ label, value, onChange, placeholder, required }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder={placeholder} 
        required={required} 
      />
    </label>
  )
}

function Lobby({ 
  participant, 
  round, 
  onRegister, 
  onEnterRound1, 
  onEnterRound2, 
  onAnalyzeRound1, 
  onAnalyzeRound2,
  onEnterRapidFire,
  onAnalyzeRapidFire,
  completedRound1,
  completedRound2,
  completedRound3
}) {
  const hasIdentity = Boolean(participant)
  const roundLabels = {
    lobby: 'Holding Arena · Stand by for host launch',
    round1: completedRound1 
      ? 'Round 01: Knowledge Realm — Submitted & Sealed'
      : 'Round 01: Knowledge Realm is currently OPEN!',
    round2: completedRound2
      ? 'Round 02: Debugging Dimension — Submitted & Sealed'
      : 'Round 02: Debugging Dimension is currently OPEN!',
    round3: completedRound3
      ? 'Round 03: Rapid Fire — Submitted & Sealed'
      : 'Round 03: Rapid Fire is currently OPEN!'
  }

  return (
    <section className="page-shell lobby-shell">
      <div className="lobby-card">
        <div className="signal-ring">
          <span>{hasIdentity ? (round === 'round3' ? '03' : round === 'round2' ? '02' : '01') : 'QV'}</span>
        </div>

        <div className="eyebrow">
          <span className="eyebrow-line" />
          <span>{hasIdentity ? 'SIGNAL ACTIVE & CONNECTED' : 'AWAITING IDENTIFIER'}</span>
          <span className="eyebrow-line" />
        </div>

        <h2>
          {hasIdentity ? (
            <>Welcome,<br /><em>{participant.name}.</em></>
          ) : (
            <>The Multiverse<br /><em>Awaits You.</em></>
          )}
        </h2>

        <p>{hasIdentity ? roundLabels[round] || 'Dimension Active' : 'Register your beacon to enter the live arena.'}</p>

        {hasIdentity ? (
          <div>
            <div className="lobby-status">
              <span className="pulse" />
              <span>
                {round === 'lobby' 
                  ? 'Stand by for host dimension broadcast...' 
                  : round === 'round1' 
                    ? (completedRound1 ? 'Round 1 Completed & Evaluated' : 'Round 1 MCQ Portal Active')
                    : round === 'round2' 
                      ? (completedRound2 ? 'Round 2 Completed & Evaluated' : 'Round 2 Codebase Debugger Active')
                      : round === 'round3'
                        ? (completedRound3 ? 'Rapid Fire Completed & Evaluated' : 'Rapid Fire · 15 Minutes · 20 Questions')
                        : 'Tournament in progress'}
              </span>
              <strong>{participant.score} PTS</strong>
            </div>

            {/* Round 1 in Lobby */}
            {round === 'round1' && participant.status !== 'eliminated' && (
              !completedRound1 ? (
                <button className="primary-button full" style={{ marginTop: '24px' }} onClick={onEnterRound1}>
                  <span>Enter Round 1: Knowledge Realm</span>
                  <span>→</span>
                </button>
              ) : (
                <div className="completed-round-box" style={{ marginTop: '24px' }}>
                  <div className="completed-badge">
                    <span>✓</span>
                    <strong>Round 1 Completed & Sealed</strong>
                  </div>
                  <p style={{ margin: '12px 0 16px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Your Round 1 responses have been recorded on the command deck. Points: <strong style={{ color: 'var(--cyan)' }}>{participant.roundScores?.round1 || participant.score || 0} PTS</strong>.
                  </p>
                  <button className="quiet-button full" onClick={onAnalyzeRound1} style={{ width: '100%', borderColor: 'var(--cyan)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span>Review & Analyze My Round 1 Answers</span>
                    <span>→</span>
                  </button>
                  <small style={{ display: 'block', marginTop: '12px', color: 'var(--gold)' }}>
                    ⏳ Please wait in the lobby for the host to broadcast Round 2.
                  </small>
                </div>
              )
            )}

            {/* Round 2 in Lobby */}
            {round === 'round2' && participant.status !== 'eliminated' && (
              !completedRound2 ? (
                <div style={{ marginTop: '24px' }}>
                  <button className="primary-button full" onClick={onEnterRound2}>
                    <span>Enter Round 2: Debugging Dimension (30m)</span>
                    <span>⚡ →</span>
                  </button>
                  {completedRound1 && (
                    <button className="quiet-button full" style={{ marginTop: '10px', width: '100%' }} onClick={onAnalyzeRound1}>
                      <span>Review Round 1 Answers</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="completed-round-box" style={{ marginTop: '24px' }}>
                  <div className="completed-badge">
                    <span>✓</span>
                    <strong>Round 2 Completed & Sealed</strong>
                  </div>
                  <p style={{ margin: '12px 0 16px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Your codebase fixes are securely submitted. Total score: <strong style={{ color: 'var(--cyan)' }}>{participant.score || 0} PTS</strong>.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <button className="quiet-button full" onClick={onAnalyzeRound2} style={{ width: '100%', borderColor: 'var(--cyan)' }}>
                      <span>Review & Analyze My Round 2 Codebase</span>
                      <span>→</span>
                    </button>
                    {completedRound1 && (
                      <button className="quiet-button full" onClick={onAnalyzeRound1} style={{ width: '100%' }}>
                        <span>Review Round 1 Answers</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Lobby / Holding State */}
            {round === 'round3' && participant.status !== 'eliminated' && (
              !completedRound3 ? (
                <div style={{ marginTop: '24px' }}>
                  <button className="primary-button full rapid-fire-launch" onClick={onEnterRapidFire}>
                    <span>Enter Rapid Fire · 15 Minutes</span>
                    <span>200 PTS / Q →</span>
                  </button>
                  <p className="rapid-fire-note">10 MCQs + 10 debugging challenges. Questions are new for your run.</p>
                </div>
              ) : (
                <div className="completed-round-box" style={{ marginTop: '24px' }}>
                  <div className="completed-badge"><span>✓</span><strong>Rapid Fire Completed & Sealed</strong></div>
                  <p style={{ margin: '12px 0 16px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Rapid Fire score: <strong style={{ color: 'var(--cyan)' }}>{participant.roundScores?.round3 || 0} PTS</strong>.
                  </p>
                  <button className="quiet-button full" onClick={onAnalyzeRapidFire} style={{ width: '100%', borderColor: 'var(--cyan)' }}>
                    <span>Review Rapid Fire</span><span>→</span>
                  </button>
                </div>
              )
            )}

            {/* Lobby / Holding State */}
            {round === 'lobby' && (completedRound1 || completedRound2) && (
              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {completedRound1 && (
                  <button className="quiet-button full" onClick={onAnalyzeRound1} style={{ width: '100%' }}>
                    <span>Review & Analyze Round 1 Answers ({participant.roundScores?.round1 || 0} pts)</span>
                    <span>→</span>
                  </button>
                )}
                {completedRound2 && (
                  <button className="quiet-button full" onClick={onAnalyzeRound2} style={{ width: '100%' }}>
                    <span>Review & Analyze Round 2 Codebase ({participant.roundScores?.round2 || 0} pts)</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button className="primary-button" style={{ marginTop: '24px' }} onClick={onRegister}>
            <span>Register Beacon to Play</span>
            <span>↗</span>
          </button>
        )}
      </div>

      <div className="lobby-rail">
        <span>STATUS: <strong>{hasIdentity ? (completedRound2 ? 'ROUND 2 COMPLETED' : completedRound1 ? 'ROUND 1 COMPLETED' : 'CONNECTED (LIVE)') : 'OPEN'}</strong></span>
                <span>SCORE: <strong>{hasIdentity ? `${participant.score} PTS (R1: ${participant.roundScores?.round1 || 0}, R2: ${participant.roundScores?.round2 || 0}, RF: ${participant.roundScores?.round3 || 0})` : '0 PTS'}</strong></span>
        <span>BEACON: <strong>{hasIdentity ? participant.id.slice(0, 8).toUpperCase() : 'UNCLAIMED'}</strong></span>
      </div>
    </section>
  )
}

/* ==========================================================================
   ROUND 1 COMPONENT
   ========================================================================== */
function Quiz({ 
  question, 
  selected, 
  setSelected, 
  onAnswer, 
  onPrev,
  onNext,
  onReview, 
  onBackToLobby,
  index, 
  total, 
  secondsLeft,
  isCompleted,
  rapidFire = false
}) {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')
  const progressPercent = total > 0 ? ((index + 1) / total) * 100 : 0
  const isTimeLow = secondsLeft < 300
  const isTimeCritical = secondsLeft < 60

  return (
    <section className="page-shell quiz-shell">
      {/* Top action and mode banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <button className="back-button" style={{ marginBottom: 0 }} onClick={onBackToLobby}>
          ← Back to Lobby
        </button>
        {isCompleted && (
          <div className="analysis-pill">
            <span className="live-dot" style={{ background: 'var(--cyan)' }} />
            <span>ANALYSIS MODE · {rapidFire ? 'RAPID FIRE SUBMITTED' : 'ROUND 1 SUBMITTED'}</span>
          </div>
        )}
      </div>

      <div className="quiz-hud">
        <div className="quiz-progress-bar">
          <div className="quiz-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="quiz-head">
          <div>
            <div className="quiz-meta-pills">
              <span className="eyebrow left">
                <span className="eyebrow-line" />
                <span>{rapidFire ? 'RAPID FIRE / MCQ SPRINT' : 'ROUND 01 / KNOWLEDGE REALM'}</span>
              </span>
              {!isCompleted ? (
                <div className={`quiz-timer-pill ${isTimeCritical ? 'danger' : isTimeLow ? 'warning' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>{minutes}:{seconds}</span>
                </div>
              ) : (
                <div className="quiz-timer-pill" style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)' }}>
                  <span>✓ SEALED</span>
                </div>
              )}
            </div>
            <h2>{isCompleted ? <>Review Your<br /><em>{rapidFire ? 'Rapid Fire.' : 'Signals.'}</em></> : rapidFire ? <>Answer Fast<br /><em>Stay Sharp.</em></> : <>Make the<br /><em>Connection.</em></>}</h2>
          </div>

          <div className="question-count">
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <span>/ {String(total).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      {question ? (
        <div className="question-card">
          <div className="question-meta">
            <span>{rapidFire ? 'RAPID FIRE MCQ' : question.topic || 'TECHNICAL SIGNAL'} · {question.difficulty || 'medium'}</span>
            <span>+{rapidFire ? 200 : question.points || 100} PTS</span>
          </div>

          <h3>{question.prompt}</h3>

          <div className="options">
            {question.options.map((option, optIdx) => {
              const letter = String.fromCharCode(65 + optIdx)
              const isSelected = selected === option
              return (
                <button 
                  key={option} 
                  className={`option ${isSelected ? 'selected' : ''}`}
                  disabled={isCompleted}
                  onClick={() => !isCompleted && setSelected(option)}
                  style={isCompleted ? { cursor: 'default', opacity: isSelected ? 1 : 0.6 } : {}}
                >
                  <span>{letter}</span>
                  <div>{option}</div>
                  {isCompleted && isSelected && (
                    <strong style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--cyan)' }}>Your Choice</strong>
                  )}
                </button>
              )
            })}
          </div>

          <div className="quiz-actions">
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="quiet-button" onClick={onReview}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Review All ({total})</span>
              </button>
              <button className="quiet-button" disabled={index === 0} onClick={onPrev}>
                <span>← Prev</span>
              </button>
            </div>

            {isCompleted ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                {index < total - 1 ? (
                  <button className="primary-button" onClick={onNext}>
                    <span>Next Question</span>
                    <span>→</span>
                  </button>
                ) : (
                  <button className="primary-button" onClick={onBackToLobby}>
                    <span>Return to Lobby</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            ) : (
              <button 
                className="primary-button" 
                disabled={!selected} 
                onClick={onAnswer}
              >
                <span>{index === total - 1 ? 'Review and Submit' : 'Save and Next'}</span>
                <span>↗</span>
              </button>
            )}
          </div>

          <p className="draft-note">
            {isCompleted ? `✓ ${rapidFire ? 'Rapid Fire' : 'Round 1'} locked and evaluated. Responses are in read-only analysis mode.` : '✓ Draft auto-saved securely. Answers remain private until final submission.'}
          </p>
        </div>
      ) : (
        <div className="closed-panel">
          <h3>Signal Completed</h3>
          <p>Your responses have been transmitted to the host command center.</p>
          <button className="primary-button" style={{ marginTop: '20px' }} onClick={onBackToLobby}>
            <span>Return to Lobby</span>
          </button>
        </div>
      )}

      <div className="quiz-footer">
        <span>{isCompleted ? 'STATUS: ' : 'REMAINING TIME: '}<strong>{isCompleted ? (rapidFire ? 'RAPID FIRE COMPLETED' : 'ROUND 1 COMPLETED') : `${minutes}:${seconds}`}</strong></span>
        <span>{rapidFire ? '200 PTS PER HIT' : 'ALL DIMENSIONS SYNCED'}</span>
      </div>
    </section>
  )
}

function RapidFire({ question, selected, setSelected, code, onSaveCode, testResults, setTestResults, index, total, secondsLeft, onNext, onPrev, onReview, onSubmit, onBackToLobby, isCompleted }) {
  if (!question) {
    return (
      <section className="page-shell rapid-fire-shell">
        <div className="closed-panel">
          <h3>Rapid Fire is preparing</h3>
          <p>Stay on this page while the host syncs your 20-question sprint.</p>
        </div>
      </section>
    )
  }

  const isDebug = question.rapidFireSection === 'debug'
  const commonProps = {
    question,
    index,
    total,
    secondsLeft,
    onNext,
    onPrev,
    onReview,
    onBackToLobby,
    isCompleted,
    rapidFire: true
  }

  return isDebug ? (
    <Round2Debugger {...commonProps} code={code} onSaveCode={onSaveCode} testResults={testResults} setTestResults={setTestResults} rapidFire />
  ) : (
    <Quiz {...commonProps} selected={selected} setSelected={setSelected} onAnswer={() => index === total - 1 ? onReview() : onNext()} rapidFire />
  )
}

function RapidFireReview({ questions, answers, testResults, onSelect, onSubmit, onBackToLobby, isCompleted }) {
  const [confirming, setConfirming] = useState(false)
  const answeredCount = questions.filter((question) => question.rapidFireSection === 'debug'
    ? testResults[question.id]?.passRatio === 1
    : Boolean(answers[question.id])).length

  return (
    <section className="page-shell review-shell rapid-review-shell">
      <div className="review-back-row">
        <button className="back-button" style={{ marginBottom: 0 }} onClick={onBackToLobby}>← Back to Lobby</button>
        {isCompleted && <div className="analysis-pill"><span className="live-dot" /> ANALYSIS MODE · RAPID FIRE SUBMITTED</div>}
      </div>

      <div className="eyebrow">
        <span className="eyebrow-line" />
        <span>RAPID FIRE REVIEW · 20 QUESTIONS</span>
        <span className="eyebrow-line" />
      </div>
      <h2>{isCompleted ? <>Audit Your<br /><em>Rapid Fire.</em></> : <>Lock Your<br /><em>Answers.</em></>}</h2>
      <p className="review-copy">Check both the MCQ answers and debugging test results before submitting the 15-minute sprint.</p>

      <div className="review-grid">
        {questions.map((question, index) => {
          const isDebug = question.rapidFireSection === 'debug'
          const result = testResults[question.id]
          const complete = isDebug ? result?.passRatio === 1 : Boolean(answers[question.id])
          return (
            <button key={question.id} className={`review-item ${complete ? 'answered' : ''}`} onClick={() => onSelect(index)}>
              <div>
                <strong>Q{String(index + 1).padStart(2, '0')}</strong>
                <span>{isDebug ? 'Debug' : 'MCQ'} · {complete ? 'Ready' : 'Not answered'}</span>
              </div>
              <i>{complete ? '✓' : '·'}</i>
            </button>
          )
        })}
      </div>

      <div className="review-submit">
        <span>{answeredCount} of {questions.length} questions answered</span>
        {isCompleted ? (
          <button className="primary-button" onClick={onBackToLobby}><span>Return to Lobby</span><span>→</span></button>
        ) : confirming ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="quiet-button" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="primary-button btn-success" onClick={onSubmit}><span>Confirm Rapid Fire Submit</span><span>✓</span></button>
          </div>
        ) : (
          <button className="primary-button" onClick={() => setConfirming(true)}><span>Submit Rapid Fire</span><span>↗</span></button>
        )}
      </div>
    </section>
  )
}

function Review({ questions, answers, onSelect, onSubmit, onBackToLobby, isCompleted }) {
  const answered = questions.filter((q) => answers[q.id]).length
  const [confirming, setConfirming] = useState(false)

  return (
    <section className="page-shell review-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <button className="back-button" style={{ marginBottom: 0 }} onClick={onBackToLobby}>
          ← Back to Lobby
        </button>
        {isCompleted && (
          <div className="analysis-pill">
            <span className="live-dot" style={{ background: 'var(--cyan)' }} />
            <span>ANALYSIS MODE · ROUND 1 SUBMITTED</span>
          </div>
        )}
      </div>

      <div className="eyebrow">
        <span className="eyebrow-line" />
        <span>ROUND 1 SUBMISSION AUDIT</span>
        <span className="eyebrow-line" />
      </div>

      <h2>{isCompleted ? <>Audit Your<br /><em>Signal.</em></> : <>Lock your<br /><em>Signal.</em></>}</h2>
      <p className="review-copy">
        {isCompleted 
          ? 'Your responses are finalized. Click any question card to inspect your submitted answers.'
          : 'Review your responses below. Click any question card to jump directly to it and modify your answer.'}
      </p>

      <div className="review-grid">
        {questions.map((q, idx) => {
          const isAnswered = Boolean(answers[q.id])
          return (
            <button 
              key={q.id} 
              className={`review-item ${isAnswered ? 'answered' : ''}`}
              onClick={() => onSelect(idx)}
            >
              <div>
                <strong>Q{String(idx + 1).padStart(2, '0')}</strong>
                <span>{isAnswered ? (isCompleted ? 'Submitted' : 'Answer Saved') : 'Unanswered'}</span>
              </div>
              <i>{isAnswered ? '✓' : '·'}</i>
            </button>
          )
        })}
      </div>

      <div className="review-submit">
        <span>{answered} of {questions.length} questions completed</span>
        
        {isCompleted ? (
          <button className="primary-button" onClick={onBackToLobby}>
            <span>Return to Lobby Portal</span>
            <span>→</span>
          </button>
        ) : (
          confirming ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="quiet-button" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="primary-button" onClick={onSubmit}>
                <span>Confirm & Lock Submission</span>
                <span>✓</span>
              </button>
            </div>
          ) : (
            <button className="primary-button" onClick={() => setConfirming(true)}>
              <span>Submit Final Answers</span>
              <span>↗</span>
            </button>
          )
        )}
      </div>
    </section>
  )
}

/* ==========================================================================
   ROUND 2 COMPONENT: CODEBASE ERROR FINDER & TEST RUNNER
   ========================================================================== */
function Round2Debugger({ 
  question, 
  code, 
  onSaveCode, 
  index, 
  total, 
  secondsLeft, 
  onNext, 
  onPrev, 
  onReview, 
  onBackToLobby,
  testResults, 
  setTestResults,
  isCompleted,
  rapidFire = false
}) {
  const [currentCode, setCurrentCode] = useState(code)
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState('tests') // 'tests' | 'console'

  useEffect(() => {
    setCurrentCode(code)
  }, [code, question?.id])

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')
  const progressPercent = total > 0 ? ((index + 1) / total) * 100 : 0
  const isTimeLow = secondsLeft < 600
  const isTimeCritical = secondsLeft < 120

  const handleCodeChange = (e) => {
    const nextVal = e.target.value
    setCurrentCode(nextVal)
    if (!isCompleted) {
      onSaveCode(nextVal, testResults)
    }
  }

  // Handle Tab key in code editor
  const handleKeyDown = (e) => {
    if (isCompleted) return
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const nextCode = currentCode.substring(0, start) + '  ' + currentCode.substring(end)
      setCurrentCode(nextCode)
      onSaveCode(nextCode, testResults)
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2
      }, 0)
    }
  }

  // Execute Python code using Skulpt
  const runCodeTests = () => {
    if (!question) return
    setIsRunning(true)

    setTimeout(() => {
      const consoleLogs = []
      let executionError = null

      const outputFunc = (text) => {
        consoleLogs.push(text)
      }

      try {
        const testCases = Array.isArray(question.test_cases) && question.test_cases.length
          ? question.test_cases
          : [{ args: [] }]
        const invocations = testCases.map((testCase) => {
          const args = Array.isArray(testCase.args) ? JSON.stringify(testCase.args) : '[]'
          return `\n\nif '${question.function_name || 'solution'}' in globals():\n    ${question.function_name || 'solution'}(*${args})`
        }).join('')
        const executableCode = `${currentCode}${invocations}`

        Sk.configure({
          output: outputFunc,
          read: (filename) => {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][filename] === undefined) {
              throw new Error('File not found: ' + filename)
            }
            return Sk.builtinFiles['files'][filename]
          }
        })

        const promise = Sk.misceval.asyncToPromise(() =>
          Sk.importMainWithBody('<stdin>', false, executableCode, true)
        )

        promise.then(
          () => {
            const evaluated = {
              error: null,
              results: [{ index: 1, input: 'Run', expected: 'No error', actual: consoleLogs.join('\n') || 'Code executed successfully', pass: true }],
              passedCount: 1,
              totalCount: 1,
              passRatio: 1,
              consoleLogs
            }
            setTestResults(evaluated)
            if (!isCompleted) {
              onSaveCode(currentCode, evaluated)
            }
            setIsRunning(false)
          },
          (err) => {
            executionError = err.toString()
            const evaluated = {
              error: executionError,
              results: [{ index: 1, input: 'Run', expected: 'No error', actual: 'Error: ' + executionError, pass: false }],
              passedCount: 0,
              totalCount: 1,
              passRatio: 0,
              consoleLogs
            }
            setTestResults(evaluated)
            if (!isCompleted) {
              onSaveCode(currentCode, evaluated)
            }
            setIsRunning(false)
          }
        )
      } catch (err) {
        const evaluated = {
          error: err.message,
          results: [{ index: 1, input: 'Run', expected: 'No error', actual: 'Error: ' + err.message, pass: false }],
          passedCount: 0,
          totalCount: 1,
          passRatio: 0,
          consoleLogs
        }
        setTestResults(evaluated)
        if (!isCompleted) {
          onSaveCode(currentCode, evaluated)
        }
        setIsRunning(false)
      }
    }, 150)
  }

  const resetToDefault = () => {
    if (isCompleted) return
    if (window.confirm('Reset code to the original buggy starting state?')) {
      setCurrentCode(question.initial_code || '')
      onSaveCode(question.initial_code || '', null)
      setTestResults(null)
    }
  }

  if (!question) {
    return (
      <section className="page-shell">
        <div className="closed-panel">
          <h3>No challenge active</h3>
          <p>Please wait for the host or select another question.</p>
          {onBackToLobby && (
            <button className="primary-button" style={{ marginTop: '20px' }} onClick={onBackToLobby}>
              <span>Return to Lobby</span>
            </button>
          )}
        </div>
      </section>
    )
  }

  const allPassed = testResults?.passedCount === 1

  return (
    <section className="code-workspace-shell">
      {/* Top action and mode banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <button className="back-button" style={{ marginBottom: 0 }} onClick={onBackToLobby}>
          ← Back to Lobby
        </button>
        {isCompleted && (
          <div className="analysis-pill">
            <span className="live-dot" style={{ background: 'var(--cyan)' }} />
            <span>ANALYSIS MODE · {rapidFire ? 'RAPID FIRE SUBMITTED' : 'ROUND 2 SUBMITTED'}</span>
          </div>
        )}
      </div>

      <div className="quiz-hud">
        <div className="quiz-progress-bar">
          <div className="quiz-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="quiz-head">
          <div>
            <div className="quiz-meta-pills">
              <span className="eyebrow left">
                <span className="eyebrow-line" />
                <span>{rapidFire ? 'RAPID FIRE / DEBUG SPRINT' : 'ROUND 02 / DEBUGGING DIMENSION'}</span>
              </span>
              {!isCompleted ? (
                <div className={`quiz-timer-pill ${isTimeCritical ? 'danger' : isTimeLow ? 'warning' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>{minutes}:{seconds}</span>
                </div>
              ) : (
                <div className="quiz-timer-pill" style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)' }}>
                  <span>✓ SEALED</span>
                </div>
              )}
            </div>
            <h2>{isCompleted ? <>Review Your<br /><em>{rapidFire ? 'Rapid Fire.' : 'Codebase.'}</em></> : rapidFire ? <>Fix Fast<br /><em>Ship Clean.</em></> : <>Find & Fix<br /><em>the Glitch.</em></>}</h2>
          </div>

          <div className="question-count">
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <span>/ {String(total).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      <div className="code-workspace-layout">
        {/* Left Pane: Challenge Prompt & Test Results */}
        <div className="code-left-pane">
          <div className="question-meta">
            <span>{question.topic} · {question.difficulty}</span>
            <span>+{question.points} PTS</span>
          </div>

          <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
            {question.title || question.prompt?.split('\n')[0] || 'Debugging challenge'}
          </h3>

          <div className="problem-prompt-box">
            {question.prompt}
          </div>

          {/* Test Case & Console Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
            <button 
              className={`quiet-button ${activeTab === 'tests' ? 'selected' : ''}`}
              style={{ padding: '6px 14px', fontSize: '0.85rem', borderColor: activeTab === 'tests' ? 'var(--cyan)' : 'transparent' }}
              onClick={() => setActiveTab('tests')}
            >
              <span>Execution Result ({testResults?.passedCount ?? 0}/1)</span>
            </button>
            <button 
              className={`quiet-button ${activeTab === 'console' ? 'selected' : ''}`}
              style={{ padding: '6px 14px', fontSize: '0.85rem', borderColor: activeTab === 'console' ? 'var(--cyan)' : 'transparent' }}
              onClick={() => setActiveTab('console')}
            >
              <span>Output Console {testResults?.consoleLogs?.length ? `(${testResults.consoleLogs.length})` : ''}</span>
            </button>
          </div>

          <div className="test-results-container">
            {activeTab === 'tests' && (
              <>
                {testResults ? (
                  <>
                    <div className={`test-summary-header ${allPassed ? 'all-pass' : 'has-fail'}`}>
                      <span>
                        {allPassed ? '✓ CODE RUNS WITHOUT ERROR' : '✕ CODE HAS ERRORS'}
                      </span>
                      <b>{allPassed ? 'Correct' : 'Incorrect'}</b>
                    </div>

                    {testResults.error && (
                      <div className="form-error" style={{ margin: '8px 0' }}>
                        {testResults.error}
                      </div>
                    )}

                    {testResults.results.map((r) => (
                      <div key={r.index} className={`test-case-item ${r.pass ? 'is-pass' : 'is-fail'}`}>
                        <div className="test-case-top">
                          <b>Execution Result</b>
                          <span className={r.pass ? 'test-pass-badge' : 'test-fail-badge'}>
                            {r.pass ? '✓ PASS' : '✕ FAIL'}
                          </span>
                        </div>
                        <div className="test-diff-grid">
                          <span>Status:</span>
                          <code style={{ color: r.pass ? '#10b981' : '#f43f5e' }}>{r.pass ? 'Code executed successfully' : 'Code has errors'}</code>
                          <span>Output:</span>
                          <code>{r.actual}</code>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="empty-roster" style={{ padding: '24px' }}>
                    Click <strong>"Run & Test Code"</strong> to test your solution against test cases.
                  </div>
                )}
              </>
            )}

            {activeTab === 'console' && (
              <div style={{ background: '#020713', padding: '12px', borderRadius: '8px', minHeight: '120px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                {testResults?.consoleLogs?.length ? (
                  testResults.consoleLogs.map((log, idx) => (
                    <div key={idx} style={{ color: '#9cb3ce', marginBottom: '4px' }}>&gt; {log}</div>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>No console output generated.</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Interactive Code Editor */}
        <div className="code-right-pane">
          <div className="editor-header">
            <span>LANGUAGE: <strong>PYTHON</strong></span>
            <div className="editor-header-actions">
              {!isCompleted && (
                <button className="quiet-button" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={resetToDefault}>
                  <span>↺ Reset Code</span>
                </button>
              )}
            </div>
          </div>

          <div className="code-editor-wrapper">
            <textarea 
              className="code-editor-textarea"
              value={currentCode}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              readOnly={isCompleted}
              placeholder="// Fix the Python code error here..."
            />
          </div>

          <div className="editor-bottom-bar">
            <button 
              className="quiet-button" 
              onClick={onReview}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Review All Questions ({total})</span>
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="quiet-button" 
                disabled={index === 0} 
                onClick={onPrev}
              >
                <span>← Prev</span>
              </button>

              <button 
                className="primary-button" 
                disabled={isRunning} 
                onClick={runCodeTests}
              >
                <span>{isRunning ? 'Running Tests...' : 'Run & Test Code'}</span>
                <span>▶</span>
              </button>

              {index < total - 1 ? (
                <button 
                  className="primary-button" 
                  onClick={onNext}
                >
                  <span>Next</span>
                  <span>→</span>
                </button>
              ) : (
                <button 
                  className="primary-button btn-success" 
                  onClick={onReview}
                >
                  <span>{isCompleted ? 'Review Codebase' : 'Review & Submit'}</span>
                  <span>↗</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Round2Review({ questions, results, onSelect, onSubmit, onBackToLobby, isCompleted }) {
  const [confirming, setConfirming] = useState(false)
  const total = questions.length
  
  let fullySolvedCount = 0
  for (const q of questions) {
    if (results[q.id]?.passRatio === 1) fullySolvedCount++
  }

  return (
    <section className="page-shell review-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <button className="back-button" style={{ marginBottom: 0 }} onClick={onBackToLobby}>
          ← Back to Lobby
        </button>
        {isCompleted && (
          <div className="analysis-pill">
            <span className="live-dot" style={{ background: 'var(--cyan)' }} />
            <span>ANALYSIS MODE · ROUND 2 SUBMITTED</span>
          </div>
        )}
      </div>

      <div className="eyebrow">
        <span className="eyebrow-line" />
        <span>ROUND 2 DEBUGGING AUDIT</span>
        <span className="eyebrow-line" />
      </div>

      <h2>{isCompleted ? <>Audit Your<br /><em>Codebase.</em></> : <>Lock your<br /><em>Codebase.</em></>}</h2>
      <p className="review-copy">
        {isCompleted 
          ? 'Your codebase has been recorded and evaluated. Click any challenge to inspect your fixes and test results.'
          : 'Review the test validation status for each debugging challenge below before submitting your final codebase to the host.'}
      </p>

      <div className="review-grid">
        {questions.map((q, idx) => {
          const res = results[q.id]
          const isFullPass = res?.passRatio === 1
          const isPartial = res && res.passRatio > 0 && res.passRatio < 1
          const isAttempted = res && res.passRatio === 0

          let statusClass = ''
          let label = 'Not Started'
          let icon = '·'

          if (isFullPass) {
            statusClass = 'pass-full'
            label = 'All Tests Passed ✓'
            icon = '✓'
          } else if (isPartial) {
            statusClass = 'pass-partial'
            label = `${res.passedCount}/${res.totalCount} Passed`
            icon = '⚡'
          } else if (isAttempted) {
            statusClass = 'answered'
            label = '0 Tests Passed'
            icon = '✕'
          }

          return (
            <button 
              key={q.id} 
              className={`review-item ${statusClass}`}
              onClick={() => onSelect(idx)}
            >
              <div>
                <strong>Q{String(idx + 1).padStart(2, '0')}</strong>
                <span>{label}</span>
              </div>
              <i>{icon}</i>
            </button>
          )
        })}
      </div>

      <div className="review-submit">
        <span>{fullySolvedCount} of {total} challenges fully debugged</span>

        {isCompleted ? (
          <button className="primary-button" onClick={onBackToLobby}>
            <span>Return to Lobby Portal</span>
            <span>→</span>
          </button>
        ) : (
          confirming ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="quiet-button" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="primary-button btn-success" onClick={onSubmit}>
                <span>Confirm & Submit Round 2 Codebase</span>
                <span>✓</span>
              </button>
            </div>
          ) : (
            <button className="primary-button" onClick={() => setConfirming(true)}>
              <span>Submit Final Round 2 Codebase</span>
              <span>↗</span>
            </button>
          )
        )}
      </div>
    </section>
  )
}

function ScoreReveal({ result, onReturnHome, onAnalyze }) {
  const [visibleScore, setVisibleScore] = useState(0)
  const isRound2 = result?.round === 'round2'
  const isRapidFire = result?.round === 'round3'

  useEffect(() => {
    if (!result) return undefined
    let frame
    const started = performance.now()
    const targetScore = result.score || 0
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 1600)
      setVisibleScore(Math.round(targetScore * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [result])

  if (!result) return null

  return (
    <section className="page-shell score-shell">
      <div className="score-aurora" />
      
      <div className="signal-seal">
        <span>✓</span>
      </div>

      <div className="eyebrow">
        <span className="eyebrow-line" />
        <span>{isRapidFire ? 'RAPID FIRE LOCKED' : isRound2 ? 'ROUND 02 CODEBASE LOCKED' : 'ROUND 01 SUBMISSION SEALED'}</span>
        <span className="eyebrow-line" />
      </div>

      <h2>Dimension<br /><em>Decoded.</em></h2>
      <p className="score-subtitle">
        {isRapidFire
          ? 'Your 20-question Rapid Fire sprint has been evaluated and synced to the host command deck.'
          : isRound2 
          ? 'Your debugged codebase has been evaluated and synced to the host command deck.' 
          : 'Your Round 1 responses have been locked and recorded on the host command deck.'}
      </p>

      <div className="score-glass">
        <div className="score-label">{isRapidFire ? 'RAPID FIRE SCORE' : isRound2 ? 'ROUND 02 SCORE' : 'ROUND 01 SCORE'}</div>
        <strong>{visibleScore}</strong>
        <span>POINTS EARNED</span>

        <div className="score-breakdown">
          {isRapidFire ? (
            <>
              <div><b>{result.correctCount || 0}</b><small>Correct Hits</small></div>
              <div><b>{result.totalScore || visibleScore}</b><small>Multiverse Total</small></div>
              <div><b>{result.total || 0}</b><small>Rapid Fire Questions</small></div>
            </>
          ) : isRound2 ? (
            <>
              <div>
                <b>{result.solvedCount || 0}</b>
                <small>Solved Bugs</small>
              </div>
              <div>
                <b>{result.totalScore || visibleScore}</b>
                <small>Multiverse Total</small>
              </div>
              <div>
                <b>{result.totalQuestions || 0}</b>
                <small>Challenges</small>
              </div>
            </>
          ) : (
            <>
              <div>
                <b>{result.correctCount || 0}</b>
                <small>Correct Signals</small>
              </div>
              <div>
                <b>{result.total ? Math.round((result.correctCount / result.total) * 100) : 0}%</b>
                <small>Accuracy Rate</small>
              </div>
              <div>
                <b>{result.total || 0}</b>
                <small>Total Questions</small>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="score-footer">
        Results transmitted in real-time · Stand by for subsequent dimension announcements
      </div>

      <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
        <button className="quiet-button" onClick={onReturnHome}>
          <span>Return to Lobby Portal</span>
          <span>→</span>
        </button>
        {onAnalyze && (
          <button className="primary-button" onClick={onAnalyze}>
            <span>{isRapidFire ? 'Review Rapid Fire' : isRound2 ? 'Review & Analyze Codebase' : 'Review & Analyze Answers'}</span>
            <span>🔍</span>
          </button>
        )}
      </div>
    </section>
  )
}

function AdminPanel({ state, online, sessionExpired, onExit }) {
  const [selected, setSelected] = useState([])
  const [archived, setArchived] = useState([])
  const [showArchive, setShowArchive] = useState(false)
  const [detail, setDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [winnerSelections, setWinnerSelections] = useState({ 1: '', 2: '', 3: '' })
  const noticeTimer = useRef(null)

  // Every broadcast is acknowledged by the server so a rejected or lost
  // command can never look like a dead button.
  const flash = (message) => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 4500)
  }

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    if (state.winners?.length === 3) {
      setWinnerSelections(Object.fromEntries(state.winners.map((winner) => [winner.place, winner.participantId])))
    }
  }, [state.winners])

  const offlineMessage = 'Host deck is offline. Check the server connection and try again.'
  const timeoutMessage = 'The server did not respond. If the server was just updated, refresh this page.'

  // Ack every command with a timeout: a silent drop (stale server, dead
  // socket) surfaces as a visible error instead of a button that does nothing.
  const command = (event, payload, onResult) => {
    if (!online) return flash(offlineMessage)
    socket.timeout(4000).emit(event, payload, (err, result) => {
      if (err) return flash(timeoutMessage)
      onResult(result || {})
    })
  }

  const setRound = (round, label) => {
    command('admin:round', round, (result) => {
      if (result.error) return flash(result.error)
      flash(`Broadcasting ${label} to every participant.`)
    })
  }

  const releaseWinners = () => {
    const selections = [1, 2, 3]
      .filter((place) => winnerSelections[place])
      .map((place) => ({ place, participantId: winnerSelections[place] }))
    if (!selections.length) return flash('Select at least one podium winner.')
    if (!window.confirm('Release the selected 1st, 2nd, and 3rd place winners to everyone?')) return
    command('admin:release-winners', selections, (result) => {
      if (result.error) return flash(result.error)
      flash('Winners released. The celebration is live for every participant.')
    })
  }

  const toggleRegistration = () => {
    command('admin:registration', !state.registrationOpen, (result) => {
      if (result.error) return flash(result.error)
      flash(result.registrationOpen ? 'Registration portal reopened.' : 'Registration portal locked.')
    })
  }

  const eliminateSelected = () => {
    if (!selected.length) return
    if (!window.confirm(`Eliminate ${selected.length} selected participant(s)?`)) return
    const count = selected.length
    command('admin:eliminate', selected, (result) => {
      if (result.error) return flash(result.error)
      setSelected([])
      flash(`${count} participant(s) eliminated.`)
    })
  }

  const toggle = (id) => {
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  }

  const toggleSelectAll = () => {
    if (selected.length === filteredParticipants.length) {
      setSelected([])
    } else {
      setSelected(filteredParticipants.map((p) => p.id))
    }
  }

  const loadArchive = () => {
    command('admin:archives', null, (result) => {
      if (result.error) return flash(result.error)
      setArchived(result.participants || [])
      setShowArchive(true)
    })
  }

  const startEvent = () => {
    if (!window.confirm('Start a new event instance? Current participants will move to Previous Participants.')) return
    command('admin:new-event', null, (result) => {
      if (result.error) return flash(result.error)
      flash(`New event instance ${result.eventId} is live and the roster has been reset.`)
    })
  }

  const deleteArchived = (id) => {
    if (!window.confirm('Permanently delete this participant record?')) return
    socket.timeout(4000).emit('admin:delete-participant', id, (err, result) => {
      if (err || result?.error) return flash(err ? timeoutMessage : result.error)
      setArchived((items) => items.filter((item) => item.id !== id))
    })
  }

  const openDetail = (id) => {
    socket.timeout(4000).emit('admin:participant-detail', id, (err, result) => {
      if (err || result?.error) return flash(err ? timeoutMessage : result.error)
      setDetail(result)
    })
  }

  const connectedCount = (state.participants || []).filter((p) => p.isConnected).length
  const submittedCount = (state.participants || []).filter((p) => p.status === 'submitted').length

  const filteredParticipants = useMemo(() => {
    return (state.participants || []).filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                            p.college.toLowerCase().includes(search.toLowerCase())
      let matchesFilter = true
      if (filter === 'live') matchesFilter = Boolean(p.isConnected)
      else if (filter !== 'all') matchesFilter = p.status === filter
      return matchesSearch && matchesFilter
    })
  }, [state.participants, search, filter])

  const eligibleWinners = useMemo(() => (state.participants || [])
    .filter((participant) => participant.status !== 'eliminated' && participant.r3SubmittedAt)
    .sort((left, right) => {
      const scoreDifference = (right.score || 0) - (left.score || 0)
      if (scoreDifference) return scoreDifference
      return Date.parse(left.r3SubmittedAt) - Date.parse(right.r3SubmittedAt)
    }), [state.participants])

  return (
    <div className="admin-app">
      <header className="topbar">
        <button className="brand" onClick={onExit}>
          <div className="brand-mark">QV</div>
          <span>QUIZVERSE // HOST DECK</span>
        </button>

        <button className="quiet-button" onClick={onExit}>
          <span>Exit Console</span>
          <span>✕</span>
        </button>
      </header>

      <main className="admin-main">
        <div className="admin-title">
          <div>
            <div className="eyebrow left">
              <span className="eyebrow-line" />
              <span>COMMAND CENTER</span>
            </div>
            <h1>Event Control<br /><em>in Real-Time.</em></h1>
          </div>

          <div className="admin-event">
            <span className="live-dot" /> INSTANCE: <strong>{state.eventId}</strong><br />
            {online 
              ? <span>ALL DIMENSIONS CONNECTED</span>
              : <span className="host-offline">● HOST DECK OFFLINE · RECONNECTING…</span>}
          </div>
        </div>

        <div className="stats-grid">
          <Stat 
            label="Live Connected" 
            value={`${connectedCount} / ${state.participants.length}`} 
            detail="Explorers online now" 
          />
          <Stat 
            label="Question Bank" 
            value={state.questionCount || state.questions?.length || 0} 
            detail="Active challenges" 
          />
          <Stat 
            label="Completed Submissions" 
            value={submittedCount} 
            detail="Final answers locked" 
          />
          <Stat 
            label="Active Dimension" 
            value={String(state.round || 'lobby').toUpperCase()} 
            detail="Host controlled phase" 
          />
        </div>

        <div className="admin-layout">
          <section className="control-panel">
            <div className="panel-heading">
              <h2>Dimension Controls</h2>
              <span className="panel-tag">REALTIME BROADCAST</span>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.95rem' }}>
              Broadcast active dimension changes to all participant screens instantly:
            </p>

            <div className="control-buttons">
              <button 
                className={`control ${state.round === 'lobby' ? 'active' : ''}`} 
                onClick={() => setRound('lobby', 'the Holding Lobby')}
              >
                <span>00</span>
                <div>Holding Lobby</div>
                <b>{state.round === 'lobby' ? '● ACTIVE' : 'SWITCH'}</b>
              </button>

              <button 
                className={`control ${state.round === 'round1' ? 'active' : ''}`} 
                onClick={() => setRound('round1', 'Round 1 · Knowledge Realm')}
              >
                <span>01</span>
                <div>Knowledge Realm (MCQ)</div>
                <b>{state.round === 'round1' ? '● ACTIVE' : 'LAUNCH ↗'}</b>
              </button>

              <button 
                className={`control ${state.round === 'round2' ? 'active' : ''}`} 
                onClick={() => setRound('round2', 'Round 2 · Debugging Dimension')}
              >
                <span>02</span>
                <div>Debugging Dimension (Code)</div>
                <b>{state.round === 'round2' ? '● ACTIVE' : 'LAUNCH ↗'}</b>
              </button>

              <button 
                className={`control ${state.round === 'round3' ? 'active' : ''}`} 
                onClick={() => setRound('round3', 'Round 3 · Rapid Fire')}
              >
                <span>03</span>
                <div>Rapid Fire (10 MCQ + 10 Code)</div>
                <b>{state.round === 'round3' ? '● ACTIVE' : 'LAUNCH ↗'}</b>
              </button>
            </div>

            <button 
              className="admin-action-btn lock-button" 
              onClick={toggleRegistration}
            >
              <span>{state.registrationOpen ? 'Lock Registration Portal' : 'Reopen Registration Portal'}</span>
              <span>{state.registrationOpen ? '🔒' : '🔓'}</span>
            </button>

            <button className="admin-action-btn new-event-button" onClick={startEvent}>
              <span>Start New Event Instance</span>
              <span>＋</span>
            </button>

            <button className="admin-action-btn archive-button" onClick={loadArchive}>
              <span>View Previous Participants Archive</span>
              <span>📁</span>
            </button>
          </section>

          <section className="roster-panel">
            <div className="panel-heading">
              <h2>Live Participant Roster</h2>
              <span className="panel-tag">{connectedCount} LIVE · {filteredParticipants.length} SHOWN</span>
            </div>

            <div className="roster-toolbar">
              <input 
                className="search-input" 
                placeholder="Search participant or institution..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
              />
              <select 
                className="search-input" 
                style={{ width: 'auto' }} 
                value={filter} 
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All Explorers ({state.participants.length})</option>
                <option value="live">● Online / Connected ({connectedCount})</option>
                <option value="active">Active In Quiz</option>
                <option value="submitted">Submitted & Sealed</option>
                <option value="eliminated">Eliminated</option>
              </select>
            </div>

            <div className="roster-table">
              <div className="roster-header">
                <span onClick={toggleSelectAll} style={{ cursor: 'pointer' }}>
                  Explorer {selected.length ? `(${selected.length})` : ''}
                </span>
                <span>Institution</span>
                <span>Live Connection</span>
                <span>Scores (R1/R2/RF)</span>
                <span>Status</span>
              </div>

              {filteredParticipants.length === 0 ? (
                <div className="empty-roster">No participants match your criteria.</div>
              ) : (
                filteredParticipants.map((item) => (
                  <div 
                    className="roster-row clickable-row" 
                    key={item.id} 
                    onClick={() => openDetail(item.id)}
                  >
                    <label onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selected.includes(item.id)} 
                        onChange={() => toggle(item.id)} 
                      />
                      <span>{item.name}</span>
                    </label>
                    <span className="muted">{item.college}</span>
                    <span>
                      {item.isConnected ? (
                        <span className="live-badge" style={{ padding: '3px 10px', fontSize: '0.75rem', gap: '6px' }}>
                          <span className="live-dot" /> Live
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                          ○ Offline
                        </span>
                      )}
                    </span>
                    <strong>{item.score} pts <small style={{ color: 'var(--text-muted)' }}>({item.roundScores?.round1 || 0}/{item.roundScores?.round2 || 0}/{item.roundScores?.round3 || 0})</small></strong>
                    <span className={`badge ${item.status}`}>{item.status}</span>
                  </div>
                ))
              )}
            </div>

            <button 
              className="admin-action-btn eliminate-button" 
              disabled={!selected.length} 
              onClick={eliminateSelected}
            >
              <span>Eliminate Selected ({selected.length})</span>
              <span>✕</span>
            </button>
          </section>
        </div>

        <section className="winner-control-panel">
          <div className="panel-heading">
            <div>
              <h2>Podium Release</h2>
              <p className="winner-control-copy">Recommendations use total score, then earlier Rapid Fire completion time. The host makes the final selection.</p>
            </div>
            <span className="panel-tag">HOST DECISION</span>
          </div>

          {state.winnersReleasedAt ? (
            <div className="winner-released-state">Winners released at {new Date(state.winnersReleasedAt).toLocaleTimeString()}</div>
          ) : (
            <>
              <div className="winner-recommendations">
                {(state.winnerRecommendations || []).map((winner) => (
                  <div className="winner-recommendation" key={winner.participantId}>
                    <strong>Recommended {winner.place === 1 ? '1st' : winner.place === 2 ? '2nd' : '3rd'}</strong>
                    <span>{winner.name}</span>
                    <small>{winner.score} total pts · Rapid Fire completed {new Date(winner.r3SubmittedAt).toLocaleTimeString()}</small>
                  </div>
                ))}
                {!state.winnerRecommendations?.length && <div className="empty-roster">Recommendations appear after Rapid Fire submissions.</div>}
              </div>

              <div className="winner-select-grid">
                {[1, 2, 3].map((place) => (
                  <label className="winner-select" key={place}>
                    <span>{place === 1 ? '1st Place' : place === 2 ? '2nd Place' : '3rd Place'}</span>
                    <select value={winnerSelections[place]} onChange={(event) => setWinnerSelections((current) => ({ ...current, [place]: event.target.value }))}>
                      <option value="">Choose participant</option>
                      {eligibleWinners.map((participant) => <option value={participant.id} key={participant.id}>{participant.name} · {participant.score} pts</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {eligibleWinners.length < 3 && (
                <p className="winner-release-requirement">
                  Select one or more eligible Rapid Fire participants to enable the release.
                </p>
              )}
              <button className="admin-action-btn winner-release-button" onClick={releaseWinners} disabled={!Object.values(winnerSelections).some(Boolean)}>
                <span>Release Winners & Start Celebration</span><span>✦</span>
              </button>
            </>
          )}
        </section>

        {showArchive && (
          <section className="archive-panel">
            <div className="panel-heading">
              <h2>Previous Participants Archive</h2>
              <button className="quiet-button" onClick={() => setShowArchive(false)}>Close ✕</button>
            </div>

            {archived.length === 0 ? (
              <div className="empty-roster">No archived participants on record.</div>
            ) : (
              archived.map((item) => (
                <div className="archive-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.college} · {item.joined_at?.slice(0, 10) || 'Previous Event'}</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <b>{item.score} pts</b>
                    <button className="delete-button" onClick={() => deleteArchived(item.id)}>
                      Delete Record
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {detail && <ParticipantDetail detail={detail} onClose={() => setDetail(null)} />}
      </main>

      {notice && <div className="toast">{notice}</div>}

      {sessionExpired && (
        <div className="session-expired-overlay">
          <div className="session-expired-card">
            <span className="session-expired-icon">⚠</span>
            <h3>Host session expired</h3>
            <p>
              The connection to the server was re-established, but this console is no longer
              authenticated. Sign in again to keep controlling the event.
            </p>
            <button className="primary-button" onClick={onExit}>
              <span>Sign in again</span>
              <span>↗</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ParticipantDetail({ detail, onClose }) {
  const r1Details = detail.r1Details || []
  const r2Details = detail.r2Details || []
  const r3Details = detail.r3Details || []

  const r1Correct = r1Details.filter((item) => item.correct).length
  const r1Wrong = r1Details.filter((item) => item.answer && !item.correct).length
  const r2Solved = r2Details.filter((item) => item.passRatio === 1).length

  return (
    <div className="detail-overlay" onClick={onClose}>
      <section className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow left">
              <span className="eyebrow-line" />
              <span>CANDIDATE SUBMISSION REPORT</span>
            </div>
            <h2>{detail.participant.name}</h2>
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {detail.participant.college} · Total: <b>{detail.participant.score} pts</b> (R1: {detail.participant.roundScores?.round1 || 0}, R2: {detail.participant.roundScores?.round2 || 0}, RF: {detail.participant.roundScores?.round3 || 0}) · Status: {detail.participant.status}
            </small>
          </div>
          <button className="quiet-button" onClick={onClose}>Close ✕</button>
        </div>

        <div className="detail-stats">
          <Stat label="Total Points" value={detail.participant.score} detail="Points Earned" />
          <Stat label="Round 1 Correct" value={`${r1Correct}/${r1Details.length}`} detail="MCQ Signals" />
          <Stat label="Round 2 Solved" value={`${r2Solved}/${r2Details.length}`} detail="Debugged Code" />
          <Stat label="Rapid Fire" value={`${r3Details.filter((item) => item.correct).length}/${r3Details.length}`} detail="200 point hits" />
          <Stat label="Status" value={detail.participant.status.toUpperCase()} detail="Current State" />
        </div>

        {/* Round 2 Code Submissions Breakdown */}
        {r2Details.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--cyan)', marginBottom: '12px' }}>
              Round 2: Debugging Dimension Code Submissions
            </h3>
            <div className="detail-list">
              {r2Details.map((item) => (
                <div 
                  className={`detail-item ${item.passRatio === 1 ? 'is-correct' : item.passRatio > 0 ? 'is-wrong' : 'is-blank'}`} 
                  key={item.number}
                >
                  <b>Q{item.number}</b>
                  <span>
                    <strong>{item.title}</strong>
                    <pre style={{ background: '#020713', padding: '10px', borderRadius: '6px', color: '#a5f3fc', fontSize: '0.82rem', overflowX: 'auto', marginTop: '6px' }}>
                      {item.code}
                    </pre>
                  </span>
                  <strong>{item.points} / {item.maxPoints} PTS</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Round 1 MCQ Breakdown */}
        {r1Details.length > 0 && (
          <div style={{ marginTop: '28px' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--gold)', marginBottom: '12px' }}>
              Round 1: Knowledge Realm MCQ Submissions
            </h3>
            <div className="detail-list">
              {r1Details.map((item) => (
                <div 
                  className={`detail-item ${item.correct ? 'is-correct' : item.answer ? 'is-wrong' : 'is-blank'}`} 
                  key={item.number}
                >
                  <b>Q{item.number}</b>
                  <span>
                    <strong>{item.prompt}</strong>
                    <small>
                      Participant: <b>{item.answer || 'No answer'}</b> · Correct: <b style={{ color: '#10b981' }}>{item.correctAnswer}</b>
                    </small>
                  </span>
                  <strong>{item.correct ? `+${item.points} PTS` : item.answer ? 'WRONG' : 'BLANK'}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, detail }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function Eliminated() {
  return (
    <section className="page-shell eliminated-shell">
      <div className="signal-ring" style={{ borderColor: 'var(--warn)', boxShadow: '0 0 45px var(--warn-glow)' }}>
        <span style={{ color: 'var(--warn)' }}>✕</span>
      </div>

      <div className="eyebrow" style={{ color: 'var(--warn)' }}>
        <span className="eyebrow-line" style={{ background: 'var(--warn)' }} />
        <span>SIGNAL TERMINATED</span>
        <span className="eyebrow-line" style={{ background: 'var(--warn)' }} />
      </div>

      <h2>Your Journey<br /><em>Concludes Here.</em></h2>
      <p>Thank you for competing in the QuizVerse multiverse challenge. Your transmission has been archived.</p>

      <button 
        className="quiet-button" 
        style={{ marginTop: '24px' }}
        onClick={() => { 
          localStorage.removeItem('quizverse-participant')
          location.reload() 
        }}
      >
        <span>Return to Registration Portal</span>
        <span>↗</span>
      </button>
    </section>
  )
}

createRoot(document.getElementById('root')).render(<App />)
