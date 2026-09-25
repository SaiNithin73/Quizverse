import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { databaseStatus, deleteParticipant, initDatabase, listArchivedParticipants, saveEvent, saveParticipant, saveSubmission, startNewEvent } from './database.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
// Number() guards against a non-numeric or zero PORT value silently binding
// to a random ephemeral port.
const port = Number(process.env.PORT) || 3001
const hostPassword = process.env.QUIZVERSE_HOST_PASSWORD || 'Sai nithin 26'
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

const state = {
  registrationOpen: true,
  round: 'lobby',
  eventId: 'event-1',
  questions: [],
  r2Questions: [],
  participants: new Map(),
  archivedParticipants: [],
  startedAt: null,
  winners: null,
  winnersReleasedAt: null,
  completed: new Set()
}

const difficultyRank = { easy: 0, medium: 1, moderate: 1, hard: 2 }
const hostTokens = new Set()
const knownRounds = new Set(['lobby', 'round1', 'round2', 'round3'])
const hostAuthError = { error: 'Host session expired. Sign in to the host deck again.' }
const round1QuestionCount = 50
const shuffle = (items) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

function assignQuiz(participant) {
  const grouped = new Map()
  for (const question of state.questions) {
    const rank = difficultyRank[String(question.difficulty || 'medium').toLowerCase()] ?? 1
    if (!grouped.has(rank)) grouped.set(rank, [])
    grouped.get(rank).push(question)
  }
  const ordered = [...grouped.keys()].sort((left, right) => left - right).flatMap((rank) => shuffle(grouped.get(rank)))
  const selected = ordered.slice(0, round1QuestionCount)
  participant.quizQuestions = selected.map(({ answer, explanation, ...question }) => question)
  participant.quizStartedAt = new Date().toISOString()
  return selected
}

const round2QuestionCount = 30

function assignRound2(participant) {
  const allQuestions = state.r2Questions
  if (!allQuestions.length) return []

  const easy = allQuestions.filter(q => q.difficulty === 'easy')
  const moderate = allQuestions.filter(q => q.difficulty === 'moderate' || q.difficulty === 'medium')

  const shuffledEasy = shuffle(easy)
  const shuffledModerate = shuffle(moderate)

  const easyCount = Math.min(15, shuffledEasy.length)
  const moderateCount = Math.min(15, shuffledModerate.length)
  const remaining = round2QuestionCount - easyCount - moderateCount

  let selected = [...shuffledEasy.slice(0, easyCount), ...shuffledModerate.slice(0, moderateCount)]

  if (remaining > 0) {
    const usedIds = new Set(selected.map(q => q.id))
    const extras = shuffle(allQuestions.filter(q => !usedIds.has(q.id)))
    selected = [...selected, ...extras.slice(0, remaining)]
  }

  selected = shuffle(selected)

  participant.r2Questions = selected.map(({ answer, explanation, ...q }) => q)
  participant.r2StartedAt = new Date().toISOString()
  if (!participant.r2DraftCodes) participant.r2DraftCodes = {}
  for (const q of selected) {
    if (!participant.r2DraftCodes[q.id]) {
      participant.r2DraftCodes[q.id] = q.initial_code || ''
    }
  }
  return participant.r2Questions
}

const participantQuiz = (participant) => ({
  questions: participant.quizQuestions || [],
  startedAt: participant.quizStartedAt,
  durationSeconds: 30 * 60
})

const participantR2Quiz = (participant) => ({
  questions: (participant.r2Questions || []).map(({ answer, explanation, ...q }) => q),
  draftCodes: participant.r2DraftCodes || {},
  startedAt: participant.r2StartedAt,
  durationSeconds: 45 * 60
})

const rapidFireQuestionCount = 10
const rapidFireDurationSeconds = 15 * 60

function assignRapidFire(participant) {
  const usedIds = new Set([
    ...(participant.quizQuestions || []).map((question) => question.id),
    ...(participant.r2Questions || []).map((question) => question.id)
  ])
  const availableMcq = shuffle(state.questions.filter((question) => !usedIds.has(question.id)))
  const availableDebug = shuffle(state.r2Questions.filter((question) => !usedIds.has(question.id)))

  if (availableMcq.length < rapidFireQuestionCount || availableDebug.length < rapidFireQuestionCount) {
    return false
  }

  const mcqQuestions = availableMcq.slice(0, rapidFireQuestionCount).map((question) => ({ ...question, rapidFireSection: 'mcq' }))
  const debugQuestions = availableDebug.slice(0, rapidFireQuestionCount).map((question) => ({ ...question, rapidFireSection: 'debug' }))
  participant.r3Questions = [...mcqQuestions, ...debugQuestions].map(({ answer, explanation, ...question }) => question)
  participant.r3StartedAt = new Date().toISOString()
  participant.r3DraftAnswers = {}
  participant.r3DraftCodes = {}
  participant.r3TestResults = {}
  for (const question of debugQuestions) participant.r3DraftCodes[question.id] = question.initial_code || ''
  return true
}

const participantRapidFireQuiz = (participant) => ({
  questions: participant.r3Questions || [],
  draftAnswers: participant.r3DraftAnswers || {},
  draftCodes: participant.r3DraftCodes || {},
  testResults: participant.r3TestResults || {},
  startedAt: participant.r3StartedAt,
  durationSeconds: rapidFireDurationSeconds
})

const databaseReady = await initDatabase(state)

const winnerRecommendations = () => [...state.participants.values()]
  .filter((participant) => participant.status !== 'eliminated' && participant.r3SubmittedAt)
  .sort((left, right) => {
    const scoreDifference = (right.score || 0) - (left.score || 0)
    if (scoreDifference) return scoreDifference
    return Date.parse(left.r3SubmittedAt) - Date.parse(right.r3SubmittedAt)
  })
  .slice(0, 3)
  .map((participant, index) => ({
    place: index + 1,
    participantId: participant.id,
    name: participant.name,
    score: participant.score || 0,
    rapidFireScore: participant.roundScores?.round3 || 0,
    r3SubmittedAt: participant.r3SubmittedAt
  }))

const publicState = () => ({
  registrationOpen: state.registrationOpen,
  round: state.round,
  startedAt: state.startedAt,
  questionCount: state.round === 'round2' ? state.r2Questions.length : state.questions.length,
  questions: state.questions,
  r2Questions: state.r2Questions,
  participants: [...state.participants.values()].map(({ socketId, ...participant }) => ({
    ...participant,
    isConnected: Boolean(socketId && io.sockets.sockets.has(socketId))
  })),
  eventId: state.eventId,
  winners: state.winners,
  winnersReleasedAt: state.winnersReleasedAt,
  winnerRecommendations: winnerRecommendations()
})

const broadcast = () => io.emit('state:update', publicState())

app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'quizverse', database: databaseStatus() }))
app.get('/api/state', (_req, res) => res.json(publicState()))
app.use(express.static(path.join(currentDirectory, 'dist')))
app.get('/', (_req, res) => res.sendFile(path.join(currentDirectory, 'dist', 'index.html')))

io.on('connection', (socket) => {
  socket.emit('state:update', publicState())

  socket.on('state:request', () => {
    socket.emit('state:update', publicState())
  })

  socket.on('admin:login', (password, callback) => {
    if (password !== hostPassword) return callback?.({ error: 'That host key is not recognized.' })
    socket.data.isAdmin = true
    // Issue a token so the host stays authenticated across reconnects;
    // socket.data is lost whenever the socket re-establishes.
    const hostToken = randomUUID()
    hostTokens.add(hostToken)
    callback?.({ ok: true, state: publicState(), hostToken })
    socket.emit('state:update', publicState())
  })

  socket.on('admin:verify', (token, callback) => {
    if (typeof token === 'function') { callback = token; token = null }
    if (!token || !hostTokens.has(token)) {
      return callback?.({ error: 'Host session expired. Please sign in to the host deck again.' })
    }
    socket.data.isAdmin = true
    callback?.({ ok: true, state: publicState() })
    socket.emit('state:update', publicState())
  })

  socket.on('participant:register', async (details, callback) => {
    if (!state.registrationOpen) return callback?.({ error: 'Registration is closed.' })
    const id = details.id || randomUUID()
    const participant = {
      id,
      eventId: state.eventId,
      name: details.name?.trim() || 'Unknown Explorer',
      college: details.college?.trim() || 'Independent',
      department: details.department?.trim() || 'Open Track',
      year: details.year || 'Final year',
      score: 0,
      status: 'ready',
      roundScores: { round1: 0, round2: 0, round3: 0 },
      quizQuestions: [],
      draftAnswers: {},
      quizStartedAt: null,
      quizSubmittedAt: null,
      r2Questions: [],
      r2DraftCodes: {},
      r2StartedAt: null,
      r2SubmittedAt: null,
      r2TestResults: {},
      r3Questions: [],
      r3DraftAnswers: {},
      r3DraftCodes: {},
      r3TestResults: {},
      r3StartedAt: null,
      r3SubmittedAt: null,
      joinedAt: new Date().toISOString(),
      socketId: socket.id
    }
    state.participants.set(id, participant)
    if (state.round === 'round1') assignQuiz(participant)
    if (state.round === 'round2') assignRound2(participant)
    if (state.round === 'round3') assignRapidFire(participant)
    socket.data.participantId = id
    await saveParticipant(participant)
    callback?.({ participant: { ...participant, socketId: undefined } })
    if (state.round === 'round1' && participant.quizQuestions.length) {
      socket.emit('participant:quiz', participantQuiz(participant))
    }
    if (state.round === 'round2') {
      socket.emit('participant:r2-quiz', participantR2Quiz(participant))
    }
    if (state.round === 'round3' && participant.r3Questions.length) {
      socket.emit('participant:rapid-fire', participantRapidFireQuiz(participant))
    }
    broadcast()
  })

  socket.on('participant:restore', (id) => {
    const participant = state.participants.get(id)
    if (participant) {
      participant.socketId = socket.id
      socket.data.participantId = id
      if (state.round === 'round1' && !participant.quizQuestions?.length) assignQuiz(participant)
      if (state.round === 'round2' && !participant.r2Questions?.length) assignRound2(participant)
      if (state.round === 'round3' && !participant.r3Questions?.length) assignRapidFire(participant)
      saveParticipant(participant)
      socket.emit('participant:restored', participant)
      if (state.round === 'round1' && participant.quizQuestions.length) {
        socket.emit('participant:quiz', participantQuiz(participant))
      }
      if (state.round === 'round2' && participant.r2Questions.length) {
        socket.emit('participant:r2-quiz', participantR2Quiz(participant))
      }
      if (state.round === 'round3' && participant.r3Questions.length) {
        socket.emit('participant:rapid-fire', participantRapidFireQuiz(participant))
      }
      broadcast()
    }
  })

  // Round 1 answer draft
  socket.on('participant:answer', async ({ participantId, questionId, answer }) => {
    const participant = state.participants.get(participantId)
    const question = state.questions.find((item) => item.id === questionId)
    const quizQuestion = participant?.quizQuestions?.find((item) => item.id === questionId)
    if (!participant || !question || !quizQuestion || participant.quizSubmittedAt || state.round !== 'round1') return
    if (!participant.quizStartedAt || Date.now() - Date.parse(participant.quizStartedAt) > 30 * 60 * 1000) {
      participant.status = 'submitted'
      await saveParticipant(participant)
      socket.emit('quiz:expired')
      return
    }
    participant.draftAnswers = { ...participant.draftAnswers, [questionId]: answer }
    await saveParticipant(participant)
    socket.emit('quiz:draft-saved', { questionId, answer })
  })

  // Round 1 final submit
  socket.on('participant:submit-quiz', async ({ participantId }, callback) => {
    const participant = state.participants.get(participantId)
    if (!participant) return callback?.({ error: 'Participant session not found. Please return to the lobby.' })
    if (participant.quizSubmittedAt) return callback?.({ error: 'Round 1 has already been submitted.' })
    if (state.round !== 'round1') return callback?.({ error: 'Round 1 is not currently open.' })
    const answers = participant.draftAnswers || {}
    let score = 0
    let correctCount = 0
    for (const question of participant.quizQuestions) {
      const source = state.questions.find((item) => item.id === question.id)
      const answer = answers[question.id]
      if (!source || answer === undefined) continue
      const correct = answer === source.answer
      const points = correct ? source.points : 0
      score += points
      correctCount += correct ? 1 : 0
      await saveSubmission({ participantId, questionId: question.id, answer, correct, points })
    }
    participant.score = score
    participant.roundScores = { ...(participant.roundScores || {}), round1: score }
    participant.status = 'submitted'
    participant.quizSubmittedAt = new Date().toISOString()
    state.completed.add(participantId)
    await saveParticipant(participant)
    socket.emit('quiz:submitted', { score, correctCount, total: participant.quizQuestions.length })
    broadcast()
    callback?.({ ok: true })
  })

  // Round 2 Code Draft Save
  socket.on('participant:r2-draft', async ({ participantId, questionId, code, testResults }) => {
    const participant = state.participants.get(participantId)
    if (!participant || participant.r2SubmittedAt || state.round !== 'round2') return
    if (!participant.r2DraftCodes) participant.r2DraftCodes = {}
    if (!participant.r2TestResults) participant.r2TestResults = {}
    participant.r2DraftCodes[questionId] = code
    if (testResults) participant.r2TestResults[questionId] = testResults
    await saveParticipant(participant)
    socket.emit('r2:draft-saved', { questionId, code })
  })

  // Round 2 Submit Final Codebase
  socket.on('participant:submit-r2', async ({ participantId, submissions }, callback) => {
    const participant = state.participants.get(participantId)
    if (!participant) return callback?.({ error: 'Participant session not found.' })
    if (participant.r2SubmittedAt) return callback?.({ error: 'Round 2 has already been submitted.' })
    if (state.round !== 'round2') return callback?.({ error: 'Round 2 is not currently open.' })

    let round2Score = 0
    const assignedQuestions = participant.r2Questions || []
    let totalQuestions = assignedQuestions.length
    let solvedCount = 0
    const testSummary = {}

    for (const q of assignedQuestions) {
      const source = state.r2Questions.find((item) => item.id === q.id)
      const execution = participant.r2TestResults?.[q.id]
      const isCorrect = execution?.passRatio === 1

      const earnedPoints = isCorrect ? (source?.points || 100) : 0
      round2Score += earnedPoints
      if (isCorrect) solvedCount += 1

      testSummary[q.id] = {
        passRatio: isCorrect ? 1 : 0,
        passed: isCorrect ? 1 : 0,
        total: 1,
        points: earnedPoints
      }
    }

    participant.roundScores = { ...(participant.roundScores || {}), round2: round2Score }
    participant.score = (participant.roundScores.round1 || 0) + round2Score
    participant.status = 'submitted'
    participant.r2SubmittedAt = new Date().toISOString()
    participant.r2TestResults = testSummary
    await saveParticipant(participant)

    const result = {
      score: round2Score,
      totalScore: participant.score,
      solvedCount,
      totalQuestions,
      testSummary
    }

    socket.emit('r2:submitted', result)
    broadcast()
    callback?.({ ok: true, result })
  })

  socket.on('participant:rapid-fire-answer', async ({ participantId, questionId, answer }) => {
    const participant = state.participants.get(participantId)
    const question = state.questions.find((item) => item.id === questionId)
    const assigned = participant?.r3Questions?.find((item) => item.id === questionId)
    if (!participant || !question || !assigned || participant.r3SubmittedAt || state.round !== 'round3') return
    participant.r3DraftAnswers = { ...(participant.r3DraftAnswers || {}), [questionId]: answer }
    await saveParticipant(participant)
    socket.emit('rapid-fire:answer-saved', { questionId, answer })
  })

  socket.on('participant:rapid-fire-draft', async ({ participantId, questionId, code, testResults }) => {
    const participant = state.participants.get(participantId)
    const assigned = participant?.r3Questions?.find((item) => item.id === questionId)
    if (!participant || !assigned || participant.r3SubmittedAt || state.round !== 'round3') return
    participant.r3DraftCodes = { ...(participant.r3DraftCodes || {}), [questionId]: code }
    if (testResults) participant.r3TestResults = { ...(participant.r3TestResults || {}), [questionId]: testResults }
    await saveParticipant(participant)
    socket.emit('rapid-fire:draft-saved', { questionId, code, testResults })
  })

  socket.on('participant:submit-rapid-fire', async ({ participantId }, callback) => {
    const participant = state.participants.get(participantId)
    if (!participant) return callback?.({ error: 'Participant session not found.' })
    if (participant.r3SubmittedAt) return callback?.({ error: 'Rapid Fire has already been submitted.' })
    if (state.round !== 'round3') return callback?.({ error: 'Rapid Fire is not currently open.' })

    let score = 0
    let correctCount = 0
    const results = {}
    for (const question of participant.r3Questions || []) {
      const source = question.rapidFireSection === 'debug'
        ? state.r2Questions.find((item) => item.id === question.id)
        : state.questions.find((item) => item.id === question.id)
      const answer = participant.r3DraftAnswers?.[question.id]
      const execution = participant.r3TestResults?.[question.id]
      const correct = question.rapidFireSection === 'debug'
        ? execution?.passRatio === 1
        : answer !== undefined && answer === source?.answer
      const points = correct ? 200 : 0
      score += points
      correctCount += correct ? 1 : 0
      results[question.id] = { correct, points }
    }

    participant.roundScores = { ...(participant.roundScores || {}), round3: score }
    participant.score = (participant.roundScores.round1 || 0) + (participant.roundScores.round2 || 0) + score
    participant.status = 'submitted'
    participant.r3SubmittedAt = new Date().toISOString()
    await saveParticipant(participant)

    const result = {
      round: 'round3',
      score,
      totalScore: participant.score,
      correctCount,
      total: participant.r3Questions?.length || 0,
      results
    }
    socket.emit('rapid-fire:submitted', result)
    broadcast()
    callback?.({ ok: true, result })
  })

  socket.on('admin:registration', (open, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    state.registrationOpen = Boolean(open)
    saveEvent(state)
    broadcast()
    callback?.({ ok: true, registrationOpen: state.registrationOpen })
  })

  socket.on('admin:round', async (round, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    if (!knownRounds.has(round)) return callback?.({ error: `Unknown dimension: ${round}` })
    if (round === 'round1' && !state.questions.length) return callback?.({ error: 'Round 1 has no active questions in the database.' })
    if (round === 'round2' && !state.r2Questions.length) return callback?.({ error: 'Round 2 has no active questions in the database. Check the question bank schema and seed data.' })
    if (round === 'round3' && (state.questions.length < rapidFireQuestionCount || state.r2Questions.length < rapidFireQuestionCount)) {
      return callback?.({ error: 'Rapid Fire needs at least 10 active MCQs and 10 active debugging questions.' })
    }
    if (round === 'round3') {
      const incomplete = [...state.participants.values()].filter((participant) => (
        participant.status !== 'eliminated' && (!participant.quizSubmittedAt || !participant.r2SubmittedAt)
      ))
      if (incomplete.length) {
        return callback?.({ error: `Rapid Fire is locked until all ${incomplete.length} remaining participant(s) complete Rounds 1 and 2.` })
      }
    }
    state.round = round
    state.startedAt = round === 'lobby' ? null : new Date().toISOString()

    for (const participant of state.participants.values()) {
      if (round === 'lobby') {
        participant.status = participant.status === 'eliminated' 
          ? 'eliminated' 
          : (participant.quizSubmittedAt || participant.r2SubmittedAt ? 'submitted' : 'ready')
      } else if (round === 'round1') {
        if (participant.status !== 'eliminated') {
          if (!participant.quizSubmittedAt) {
            participant.status = 'active'
            if (!participant.quizQuestions?.length) {
              assignQuiz(participant)
            }
          }
        }
      } else if (round === 'round2') {
        if (participant.status !== 'eliminated') {
          if (!participant.r2SubmittedAt) {
            participant.status = 'active'
            if (!participant.r2Questions?.length) {
              assignRound2(participant)
            }
          }
        }
      } else if (round === 'round3') {
        if (participant.status !== 'eliminated') {
          if (!participant.quizSubmittedAt || !participant.r2SubmittedAt) {
            participant.status = 'ready'
          } else if (!participant.r3SubmittedAt) {
            participant.status = 'active'
            if (!participant.r3Questions?.length && !assignRapidFire(participant)) {
              participant.status = 'ready'
            }
          }
        }
      }
    }

    await saveEvent(state)
    await Promise.all([...state.participants.values()].map(saveParticipant))

    if (round === 'round1') {
      for (const participant of state.participants.values()) {
        const participantSocket = io.sockets.sockets.get(participant.socketId)
        if (participant.status !== 'eliminated' && !participant.quizSubmittedAt) {
          participantSocket?.emit('participant:quiz', participantQuiz(participant))
        }
      }
    } else if (round === 'round2') {
      for (const participant of state.participants.values()) {
        const participantSocket = io.sockets.sockets.get(participant.socketId)
        if (participant.status !== 'eliminated' && !participant.r2SubmittedAt) {
          participantSocket?.emit('participant:r2-quiz', participantR2Quiz(participant))
        }
      }
    } else if (round === 'round3') {
      for (const participant of state.participants.values()) {
        const participantSocket = io.sockets.sockets.get(participant.socketId)
        if (participant.status === 'active' && !participant.r3SubmittedAt) {
          participantSocket?.emit('participant:rapid-fire', participantRapidFireQuiz(participant))
        }
      }
    }

    broadcast()
    callback?.({ ok: true, round })
  })

  socket.on('admin:release-winners', async (selections, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    if (state.winnersReleasedAt) return callback?.({ error: 'Winners have already been released for this event.' })
    if (!Array.isArray(selections) || selections.length !== 3) {
      return callback?.({ error: 'Select exactly one winner for 1st, 2nd, and 3rd place.' })
    }

    const places = selections.map((selection) => Number(selection.place)).sort((left, right) => left - right)
    if (places.join(',') !== '1,2,3') return callback?.({ error: 'Winner places must be 1st, 2nd, and 3rd.' })

    const participantIds = selections.map((selection) => selection.participantId)
    if (new Set(participantIds).size !== 3) return callback?.({ error: 'A participant can only hold one winning place.' })

    const winners = selections.map((selection) => {
      const participant = state.participants.get(selection.participantId)
      if (!participant || participant.status === 'eliminated' || !participant.r3SubmittedAt) return null
      return {
        place: Number(selection.place),
        participantId: participant.id,
        name: participant.name,
        score: participant.score || 0,
        rapidFireScore: participant.roundScores?.round3 || 0
      }
    })
    if (winners.some((winner) => !winner)) return callback?.({ error: 'Every winner must be an eligible participant who completed Rapid Fire.' })

    state.winners = winners.sort((left, right) => left.place - right.place)
    state.winnersReleasedAt = new Date().toISOString()
    await saveEvent(state)
    io.emit('winners:released', { winners: state.winners, releasedAt: state.winnersReleasedAt })
    broadcast()
    callback?.({ ok: true, winners: state.winners, releasedAt: state.winnersReleasedAt })
  })

  socket.on('admin:eliminate', async (ids, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    const targets = Array.isArray(ids) ? ids : []
    for (const id of targets) {
      const participant = state.participants.get(id)
      if (participant) participant.status = 'eliminated'
    }
    await Promise.all(targets.map((id) => state.participants.has(id) ? saveParticipant(state.participants.get(id)) : null))
    broadcast()
    callback?.({ ok: true, eliminated: targets.length })
  })

  socket.on('admin:archives', async (_ignored, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    const stored = await listArchivedParticipants(state)
    const knownIds = new Set(stored.map((participant) => participant.id))
    const sessionArchive = state.archivedParticipants.filter((participant) => !knownIds.has(participant.id))
    callback?.({ participants: [...sessionArchive, ...stored] })
  })

  socket.on('admin:delete-participant', async (id, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    const deleted = await deleteParticipant(id)
    callback?.({ deleted })
  })

  socket.on('admin:participant-detail', (id, callback) => {
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    const participant = state.participants.get(id)
    if (!participant) return callback?.({ error: 'Participant not found' })
    
    // Round 1 details
    const r1Answers = participant.draftAnswers || {}
    const r1Details = (participant.quizQuestions || []).map((question, index) => {
      const source = state.questions.find((item) => item.id === question.id)
      const answer = r1Answers[question.id]
      const correct = answer !== undefined && answer === source?.answer
      return { 
        number: index + 1, 
        prompt: question.prompt, 
        answer: answer ?? null, 
        correctAnswer: source?.answer ?? null, 
        correct, 
        points: correct ? (source?.points || 100) : 0 
      }
    })

    // Round 2 details
    const r2Results = participant.r2TestResults || {}
    const r2Drafts = participant.r2DraftCodes || {}
    const r2Details = (participant.r2Questions || state.r2Questions).map((q, index) => {
      const res = r2Results[q.id] || {}
      return {
        number: index + 1,
        title: q.title,
        prompt: q.prompt,
        code: r2Drafts[q.id] || q.initial_code,
        passRatio: res.passRatio || 0,
        points: res.points || 0,
        maxPoints: q.points || 200
      }
    })

    const r3Details = (participant.r3Questions || []).map((q, index) => {
      const isDebug = q.rapidFireSection === 'debug'
      const result = participant.r3TestResults?.[q.id] || {}
      const answer = participant.r3DraftAnswers?.[q.id]
      const source = isDebug
        ? state.r2Questions.find((item) => item.id === q.id)
        : state.questions.find((item) => item.id === q.id)
      const correct = isDebug ? result.passRatio === 1 : answer !== undefined && answer === source?.answer
      return {
        number: index + 1,
        type: isDebug ? 'Debug' : 'MCQ',
        prompt: q.prompt,
        answer: isDebug ? null : answer ?? null,
        code: isDebug ? participant.r3DraftCodes?.[q.id] || q.initial_code : null,
        correct,
        points: correct ? 200 : 0,
        maxPoints: 200
      }
    })

    callback?.({ 
      participant: { 
        id: participant.id, 
        name: participant.name, 
        college: participant.college, 
        score: participant.score, 
        status: participant.status,
        roundScores: participant.roundScores || { round1: 0, round2: 0, round3: 0 }
      }, 
      r1Details,
      r2Details,
      r3Details
    })
  })

  socket.on('admin:new-event', async (_payload, callback) => {
    if (typeof _payload === 'function') { callback = _payload }
    if (!socket.data.isAdmin) return callback?.(hostAuthError)
    state.archivedParticipants = [...state.participants.values()].map(({ socketId, ...participant }) => participant)
    const persisted = await startNewEvent(state)
    broadcast()
    callback?.({ ok: true, persisted, eventId: state.eventId })
  })

  socket.on('disconnect', () => {
    const participant = [...state.participants.values()].find((item) => item.socketId === socket.id)
    if (participant) participant.socketId = null
  })
})

httpServer.listen(port, () => console.log(`QuizVerse server listening on http://localhost:${port} (database: ${databaseReady ? 'connected' : 'not connected'})`))
