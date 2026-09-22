import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { io } from 'socket.io-client'
import './styles.css'
import introVideo from './quizverse theme.mp4'

const socket = io('http://localhost:3001')
const savedId = localStorage.getItem('quizverse-participant')

function App() {
  const [state, setState] = useState({ registrationOpen: true, round: 'lobby', participants: [], questions: [] })
  const [participant, setParticipant] = useState(null)
  const [quiz, setQuiz] = useState({ questions: [], startedAt: null, durationSeconds: 1800 })
  const [draftAnswers, setDraftAnswers] = useState({})
  const [scoreReveal, setScoreReveal] = useState(null)
  const [view, setView] = useState(savedId ? 'lobby' : 'home')
  const [form, setForm] = useState({ name: '', college: '', department: '', year: 'Final year' })
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(1800)
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('quizverse-intro-seen'))

  const closeIntro = () => {
    sessionStorage.setItem('quizverse-intro-seen', '1')
    setShowIntro(false)
  }

  useEffect(() => {
    socket.on('state:update', (next) => setState(next))
    socket.on('participant:restored', (next) => setParticipant(next))
    socket.on('participant:quiz', (next) => {
      setQuiz(next)
      setDraftAnswers((current) => participant?.draftAnswers || current)
      setSecondsLeft(Math.max(0, next.durationSeconds - Math.floor((Date.now() - Date.parse(next.startedAt)) / 1000)))
    })
    socket.on('quiz:expired', () => {
      setNotice('Time window closed. Your answers have been submitted.')
      setView('lobby')
    })
    socket.on('quiz:draft-saved', ({ questionId, answer }) => setDraftAnswers((current) => ({ ...current, [questionId]: answer })))
    socket.on('quiz:submitted', (result) => { setScoreReveal(result); setView('score') })
    if (savedId) socket.emit('participant:restore', savedId)
    return () => socket.removeAllListeners()
  }, [])

  useEffect(() => {
    if (!quiz.startedAt || state.round !== 'round1') return undefined
    const timer = setInterval(() => {
      const remaining = Math.max(0, quiz.durationSeconds - Math.floor((Date.now() - Date.parse(quiz.startedAt)) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) setView('lobby')
    }, 1000)
    return () => clearInterval(timer)
  }, [quiz.startedAt, quiz.durationSeconds, state.round])

  useEffect(() => {
    if (!participant) return
    const current = state.participants.find((item) => item.id === participant.id)
    if (current) setParticipant(current)
    if (current?.status === 'eliminated') setView('eliminated')
  }, [state.participants, participant?.id])

  const activeQuestion = quiz.questions[questionIndex]
  const liveCount = state.participants.filter((item) => item.status !== 'eliminated').length

  const register = (event) => {
    event.preventDefault()
    socket.emit('participant:register', { ...form, id: savedId }, (result) => {
      if (result.error) return setNotice(result.error)
      localStorage.setItem('quizverse-participant', result.participant.id)
      setParticipant(result.participant)
      setView('lobby')
    })
  }

  const answer = (value = selected) => {
    if (!value || !activeQuestion || !participant) return
    setDraftAnswers((current) => ({ ...current, [activeQuestion.id]: value }))
    socket.emit('participant:answer', { participantId: participant.id, questionId: activeQuestion.id, answer: value })
  }

  const submitQuiz = () => {
    if (!participant) return
    socket.emit('participant:submit-quiz', { participantId: participant.id }, (result) => {
      if (result?.error) setNotice(result.error)
    })
  }

  if (isAdmin) return <AdminPanel state={state} liveCount={liveCount} onExit={() => setIsAdmin(false)} />

  return <div className={`app phase-${state.round}`}>
    {showIntro && <IntroVideo onDone={closeIntro} />}
    <header className="topbar">
      <button className="brand" onClick={() => setView('home')} aria-label="Return home"><span className="brand-mark">QV</span><span>QUIZVERSE</span></button>
      <div className="topbar-meta"><span className="live-dot" /> LIVE EVENT <button className="admin-link" onClick={() => setView('host-login')}>Host sign in</button></div>
    </header>
    <main>
      {view === 'home' && <Home onStart={() => setView('register')} onHost={() => setView('host-login')} onRules={() => setNotice('Four rounds. One mind-bending journey. The host controls every dimension.')} />}
      {view === 'register' && <Register form={form} setForm={setForm} onSubmit={register} open={state.registrationOpen} onBack={() => setView('home')} />}
      {view === 'host-login' && <HostLogin onBack={() => setView('home')} onLogin={() => setIsAdmin(true)} />}
      {view === 'lobby' && <Lobby participant={participant} round={state.round} onRegister={() => setView('register')} />}
      {view === 'quiz' && <Quiz question={activeQuestion} selected={draftAnswers[activeQuestion?.id] || selected} setSelected={(value) => { setSelected(value); answer(value) }} onAnswer={() => { setSelected(null); setQuestionIndex((index) => Math.min(index + 1, quiz.questions.length - 1)) }} onReview={() => setView('review')} index={questionIndex} total={quiz.questions.length} secondsLeft={secondsLeft} notice={notice} />}
      {view === 'review' && <Review questions={quiz.questions} answers={draftAnswers} onSelect={(index) => { setQuestionIndex(index); setSelected(null); setView('quiz') }} onSubmit={submitQuiz} />}
      {view === 'score' && <ScoreReveal result={scoreReveal} />}
      {view === 'eliminated' && <Eliminated />}
    </main>
    {participant && state.round === 'round1' && participant.status !== 'eliminated' && view === 'lobby' && <button className="floating-cta" onClick={() => setView('quiz')}>Enter Round 1 <span>→</span></button>}
    {notice && view !== 'quiz' && <div className="toast">{notice}</div>}
  </div>
}

function IntroVideo({ onDone }) {
  return <div className="intro-overlay"><video className="intro-video" src={introVideo} autoPlay muted playsInline onEnded={onDone} /><div className="intro-shade" /><div className="intro-content"><div className="intro-mark">QV</div><div className="intro-wordmark">QUIZVERSE</div><p>ENTER THE MULTIVERSE</p></div><button className="intro-skip" onClick={onDone}>Skip intro <span>→</span></button></div>
}

function Home({ onStart, onHost, onRules }) {
  return <section className="home page-shell">
    <div className="eyebrow"><span className="eyebrow-line" /> THE 2026 TECH MULTIVERSE <span className="eyebrow-line" /></div>
    <div className="hero-copy"><p className="hero-kicker">A live challenge across</p><h1>Infinite<br /><em>Possibility.</em></h1><p className="hero-body">Think faster. Debug deeper. Outplay the expected.</p></div>
    <div className="orbit-scene" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="core"><span>QV</span></div><i className="star star-a" /><i className="star star-b" /><i className="star star-c" /></div>
    <div className="home-actions"><button className="primary-button" onClick={onStart}>Join the competition <span>↗</span></button><button className="quiet-button" onClick={onRules}>Read the field guide <span>↗</span></button></div><button className="host-entry" onClick={onHost}>Host sign in <span>→</span></button>
    <div className="home-footer"><span>01 / 04</span><span>Knowledge · Debugging · Instinct</span><span>Scroll to enter</span></div>
  </section>
}

function HostLogin({ onBack, onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = (event) => {
    event.preventDefault()
    socket.emit('admin:login', password, (result) => {
      if (result.error) return setError(result.error)
      onLogin()
    })
  }
  return <section className="page-shell form-shell host-login-shell"><button className="back-button" onClick={onBack}>← Back to entry</button><div className="form-intro"><div className="eyebrow left"><span className="eyebrow-line" /> HOST ACCESS</div><h2>Open the<br /><em>command deck.</em></h2><p>This route is reserved for the event host. Participant identities never enter the control room.</p></div><form className="glass-form" onSubmit={login}><div className="host-badge">QV <span>AUTHORIZED PERSONNEL</span></div><label className="field"><span>Host access key</span><input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Enter your access key" autoFocus required /></label><button className="primary-button full" type="submit">Sign in to dashboard <span>↗</span></button>{error && <div className="form-error">{error}</div>}<small>For event hosts only. Players should use the competition entry route.</small></form></section>
}

function Register({ form, setForm, onSubmit, open, onBack }) {
  return <section className="page-shell form-shell"><button className="back-button" onClick={onBack}>← Back to home</button><div className="form-intro"><div className="eyebrow left"><span className="eyebrow-line" /> IDENTITY CHECK</div><h2>Choose your<br /><em>universe.</em></h2><p>Claim a signal. The host will use it to find you in the multiverse.</p></div>{open ? <form className="glass-form" onSubmit={onSubmit}><Field label="Participant / team name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Peter Parker" required /><Field label="College / institution" value={form.college} onChange={(value) => setForm({ ...form, college: value })} placeholder="e.g. Stark Industries" required /><div className="form-row"><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} placeholder="Computer Science" required /><label className="field"><span>Year</span><select value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })}><option>Second year</option><option>Third year</option><option>Final year</option><option>Alumni</option></select></label></div><button className="primary-button full" type="submit">Transmit identity <span>↗</span></button><small>By entering, you agree to compete fairly across all dimensions.</small></form> : <div className="closed-panel"><span className="status-icon">×</span><h3>Registration is sealed</h3><p>The host has closed the entry gate for this event.</p></div>}</section>
}

function Field({ label, value, onChange, placeholder, required }) { return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label> }

function Lobby({ participant, round, onRegister }) {
  const hasIdentity = Boolean(participant)
  const labels = { lobby: 'The gate is dormant', round1: 'The knowledge realm is open', round2: 'The debugging dimension is open', round3: 'The ultimate challenge is open' }
  return <section className="page-shell lobby-shell"><div className="lobby-card"><div className="signal-ring"><span>{hasIdentity ? '01' : 'QV'}</span></div><div className="eyebrow"><span className="eyebrow-line" /> {hasIdentity ? 'SIGNAL RECEIVED' : 'ACCESS PORTAL'} <span className="eyebrow-line" /></div><h2>{hasIdentity ? <>You're in,<br /><em>{participant.name}.</em></> : <>The multiverse<br /><em>awaits.</em></>}</h2><p>{hasIdentity ? labels[round] : 'Register your signal to enter the live arena.'}</p>{hasIdentity ? <div className="lobby-status"><span className="pulse" /> {round === 'lobby' ? 'Waiting for the host to open the first dimension' : 'Your dimension is ready to enter'}<strong>{participant.score} pts</strong></div> : <button className="primary-button" onClick={onRegister}>Register to play <span>↗</span></button>}</div><div className="lobby-rail"><span>PARTICIPANTS ONLINE <strong>{hasIdentity ? 'LIVE' : 'OPEN'}</strong></span><span>YOUR SIGNAL <strong>{hasIdentity ? participant.id.slice(0, 8).toUpperCase() : 'UNCLAIMED'}</strong></span></div></section>
}

function Quiz({ question, selected, setSelected, onAnswer, onReview, index, total, secondsLeft }) { const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0'); const seconds = String(secondsLeft % 60).padStart(2, '0'); return <section className="page-shell quiz-shell"><div className="quiz-head"><div><div className="eyebrow left"><span className="eyebrow-line" /> ROUND 01 / KNOWLEDGE REALM</div><h2>Make the<br /><em>connection.</em></h2></div><div className="question-count"><strong>{String(index + 1).padStart(2, '0')}</strong><span>/ {String(total).padStart(2, '0')}</span></div></div>{question ? <div className="question-card"><div className="question-meta"><span>{question.topic || 'TECHNICAL SIGNAL'} · {question.difficulty || 'medium'}</span><span>{question.points} PTS</span></div><h3>{question.prompt}</h3><div className="options">{question.options.map((option, optionIndex) => <button key={option} className={selected === option ? 'option selected' : 'option'} onClick={() => setSelected(option)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div><div className="quiz-actions"><button className="quiet-button" onClick={onReview}>Review answers</button><button className="primary-button answer-button" disabled={!selected} onClick={onAnswer}>{index === total - 1 ? 'Review and submit' : 'Save and continue'} <span>↗</span></button></div><p className="draft-note">Draft saved privately. Correctness stays hidden until final submission.</p></div> : <div className="closed-panel"><h3>Signal complete</h3><p>Your answers have been transmitted to the host.</p></div>}<div className="quiz-footer"><span>TIME WINDOW <strong>{minutes}:{seconds}</strong></span><span>LIVE DRAFT · 30 MINUTES</span></div></section> }

function Review({ questions, answers, onSelect, onSubmit }) { const answered = questions.filter((question) => answers[question.id]).length; return <section className="page-shell review-shell"><div className="eyebrow"><span className="eyebrow-line" /> FINAL REVIEW <span className="eyebrow-line" /></div><h2>Lock your<br /><em>signal.</em></h2><p className="review-copy">You can still revisit any question. Correct answers remain sealed until the host receives your final submission.</p><div className="review-grid">{questions.map((question, index) => <button className={answers[question.id] ? 'review-item answered' : 'review-item'} key={question.id} onClick={() => onSelect(index)}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{answers[question.id] ? 'Answer saved' : 'Not answered'}</span><i>{answers[question.id] ? '✓' : '·'}</i></button>)}</div><div className="review-submit"><span>{answered} / {questions.length} answers ready</span><button className="primary-button" onClick={onSubmit}>Submit final answers <span>↗</span></button></div></section> }

function ScoreReveal({ result }) { const [visibleScore, setVisibleScore] = useState(0); useEffect(() => { if (!result) return undefined; let frame; const started = performance.now(); const tick = (now) => { const progress = Math.min(1, (now - started) / 1400); setVisibleScore(Math.round(result.score * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) frame = requestAnimationFrame(tick) }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame) }, [result]); if (!result) return null; const accuracy = result.total ? Math.round((result.correctCount / result.total) * 100) : 0; return <section className="page-shell score-shell"><div className="score-aurora" /><div className="signal-seal"><span>✓</span></div><div className="eyebrow"><span className="eyebrow-line" /> SIGNAL RECEIVED <span className="eyebrow-line" /></div><h2>Dimension<br /><em>decoded.</em></h2><p className="score-subtitle">Your final submission is sealed. The host has received your result.</p><div className="score-glass"><div className="score-label">ROUND 01 SCORE</div><strong>{visibleScore}</strong><span>POINTS</span><div className="score-breakdown"><div><b>{result.correctCount}</b><small>correct signals</small></div><div><b>{accuracy}%</b><small>accuracy</small></div><div><b>{result.total}</b><small>questions</small></div></div></div><div className="score-footer">Correct answers remain hidden · Results are now visible to the host</div></section> }

function Admin({ state, liveCount, onExit }) {
  const [selected, setSelected] = useState([])
  const [archived, setArchived] = useState([])
  const [showArchive, setShowArchive] = useState(false)
  const [detail, setDetail] = useState(null)
  const setRound = (round) => socket.emit('admin:round', round)
  const toggle = (id) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const loadArchive = () => {
    socket.emit('admin:archives', null, (result) => {
      if (!result.error) {
        setArchived(result.participants)
        setShowArchive(true)
      }
    })
  }
  const startEvent = () => {
    if (window.confirm('Start a new event? Current participants will move to Previous participants.')) socket.emit('admin:new-event')
  }
  const deleteArchived = (id) => {
    if (window.confirm('Permanently delete this participant and their submissions?')) {
      socket.emit('admin:delete-participant', id, () => setArchived((items) => items.filter((item) => item.id !== id)))
    }
  }
  const openDetail = (id) => socket.emit('admin:participant-detail', id, (result) => { if (!result.error) setDetail(result) })
  return <div className="admin-app"><header className="topbar"><button className="brand" onClick={onExit}><span className="brand-mark">QV</span><span>QUIZVERSE / HOST</span></button><button className="quiet-button" onClick={onExit}>Exit console</button></header><main className="admin-main"><div className="admin-title"><div><div className="eyebrow left"><span className="eyebrow-line" /> COMMAND DECK</div><h1>Event control<br /><em>in your hands.</em></h1></div><div className="admin-event"><span className="live-dot" /> EVENT {state.eventId}<br /><strong>LIVE INSTANCE</strong></div></div><div className="stats-grid"><Stat label="Current registered" value={state.participants.length} detail="this event" /><Stat label="Question bank" value={state.questionCount} detail="active questions" /><Stat label="Completed" value={state.participants.filter((item) => item.status === 'submitted').length} detail="round submissions" /><Stat label="Current phase" value={state.round === 'lobby' ? 'LOBBY' : state.round.replace('round', 'R')} detail="host controlled" /></div><div className="admin-layout"><section className="control-panel"><div className="panel-heading"><h2>Dimension controls</h2><span className="panel-tag">REALTIME</span></div><p>Broadcast a state change to every active participant.</p><div className="control-buttons"><button className={state.round === 'lobby' ? 'control active' : 'control'} onClick={() => setRound('lobby')}><span>00</span> Holding lobby <b>●</b></button><button className={state.round === 'round1' ? 'control active' : 'control'} onClick={() => setRound('round1')}><span>01</span> Knowledge realm <b>↗</b></button><button className={state.round === 'round2' ? 'control active' : 'control'} onClick={() => setRound('round2')}><span>02</span> Debugging dimension <b>↗</b></button><button className={state.round === 'round3' ? 'control active' : 'control'} onClick={() => setRound('round3')}><span>03</span> Ultimate challenge <b>↗</b></button></div><button className="lock-button" onClick={() => socket.emit('admin:registration', !state.registrationOpen)}>{state.registrationOpen ? 'Lock registration' : 'Reopen registration'} <span>{state.registrationOpen ? '⌁' : '↻'}</span></button><button className="new-event-button" onClick={startEvent}>Start new event <span>＋</span></button><button className="archive-button" onClick={loadArchive}>Previous participants <span>→</span></button></section><section className="roster-panel"><div className="panel-heading"><h2>Live roster</h2><span className="panel-tag">{state.participants.length} EXPLORERS</span></div><div className="roster-table"><div className="roster-row roster-header"><span>Explorer</span><span>Signal</span><span>Score</span><span>Status</span></div>{state.participants.length === 0 && <div className="empty-roster">No signals claimed yet.</div>}{state.participants.map((item) => <div className="roster-row" key={item.id}><label><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.name}</span></label><span className="muted">{item.college}</span><strong>{item.score}</strong><span className={`badge ${item.status}`}>{item.status}</span></div>)}</div><button className="eliminate-button" disabled={!selected.length} onClick={() => { socket.emit('admin:eliminate', selected); setSelected([]) }}>Eliminate selected <span>×</span></button></section></div>{showArchive && <section className="archive-panel"><div className="panel-heading"><h2>Previous participants</h2><button className="quiet-button" onClick={() => setShowArchive(false)}>Close</button></div>{archived.length === 0 ? <div className="empty-roster">No archived participants.</div> : archived.map((item) => <div className="archive-row" key={item.id}><span><strong>{item.name}</strong><small>{item.college} · {item.joined_at?.slice(0, 10)}</small></span><b>{item.score} pts</b><button className="delete-button" onClick={() => deleteArchived(item.id)}>Delete</button></div>)}</section>}</main></div>
}
function AdminPanel({ state, onExit }) {
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const toggle = (id) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const openDetail = (id) => socket.emit('admin:participant-detail', id, (result) => { if (!result.error) setDetail(result) })
  const setRound = (round) => socket.emit('admin:round', round)
  return <div className="admin-app"><header className="topbar"><button className="brand" onClick={onExit}><span className="brand-mark">QV</span><span>QUIZVERSE / HOST</span></button><button className="quiet-button" onClick={onExit}>Exit console</button></header><main className="admin-main"><div className="admin-title"><div><div className="eyebrow left"><span className="eyebrow-line" /> COMMAND DECK</div><h1>Event control<br /><em>in your hands.</em></h1></div><div className="admin-event"><span className="live-dot" /> EVENT {state.eventId}<br /><strong>LIVE INSTANCE</strong></div></div><div className="stats-grid"><Stat label="Current registered" value={state.participants.length} detail="this event" /><Stat label="Question bank" value={state.questionCount} detail="active questions" /><Stat label="Completed" value={state.participants.filter((item) => item.status === 'submitted').length} detail="round submissions" /><Stat label="Current phase" value={state.round} detail="host controlled" /></div><div className="admin-layout"><section className="control-panel"><div className="panel-heading"><h2>Dimension controls</h2><span className="panel-tag">REALTIME</span></div><div className="control-buttons"><button className="control" onClick={() => setRound('lobby')}>00 Holding lobby</button><button className="control" onClick={() => setRound('round1')}>01 Knowledge realm</button><button className="control" onClick={() => setRound('round2')}>02 Debugging dimension</button><button className="control" onClick={() => setRound('round3')}>03 Ultimate challenge</button></div></section><section className="roster-panel"><div className="panel-heading"><h2>Live roster</h2><span className="panel-tag">{state.participants.length} EXPLORERS</span></div>{state.participants.map((item) => <div className="roster-row clickable-row" key={item.id} onClick={() => openDetail(item.id)}><label onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.name}</span></label><span className="muted">{item.college}</span><strong>{item.score}</strong><span className={`badge ${item.status}`}>{item.status}</span></div>)}<button className="eliminate-button" disabled={!selected.length} onClick={() => { socket.emit('admin:eliminate', selected); setSelected([]) }}>Eliminate selected <span>×</span></button></section></div>{detail && <ParticipantDetail detail={detail} onClose={() => setDetail(null)} />}</main></div>
}

function ParticipantDetail({ detail, onClose }) { const correct = detail.details.filter((item) => item.correct).length; const wrong = detail.details.filter((item) => item.answer && !item.correct).length; const blank = detail.details.length - correct - wrong; return <div className="detail-overlay" onClick={onClose}><section className="detail-modal" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><div className="eyebrow left"><span className="eyebrow-line" /> SUBMISSION REPORT</div><h2>{detail.participant.name}</h2><small>{detail.participant.college} · {detail.participant.status}</small></div><button className="quiet-button" onClick={onClose}>Close</button></div><div className="detail-stats"><Stat label="Score" value={detail.participant.score} detail="points" /><Stat label="Correct" value={correct} detail="answers" /><Stat label="Wrong" value={wrong} detail="answers" /><Stat label="Blank" value={blank} detail="answers" /></div><div className="detail-list">{detail.details.map((item) => <div className={`detail-item ${item.correct ? 'is-correct' : item.answer ? 'is-wrong' : 'is-blank'}`} key={item.number}><b>Q{item.number}</b><span>{item.prompt}<small>Participant: {item.answer || 'No answer'} · Correct: {item.correctAnswer}</small></span><strong>{item.correct ? `+${item.points}` : item.answer ? 'Wrong' : 'Blank'}</strong></div>)}</div></section></div> }

function Stat({ label, value, detail }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function Eliminated() { return <section className="page-shell eliminated-shell"><div className="signal-ring broken"><span>×</span></div><div className="eyebrow"><span className="eyebrow-line" /> SIGNAL CLOSED <span className="eyebrow-line" /></div><h2>Your journey<br /><em>ends here.</em></h2><p>Thank you for competing across the QuizVerse. Your signal has been archived.</p><button className="quiet-button" onClick={() => { localStorage.removeItem('quizverse-participant'); location.reload() }}>Return to entry <span>↗</span></button></section> }

createRoot(document.getElementById('root')).render(<App />)
