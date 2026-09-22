import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
import { databaseStatus, deleteParticipant, initDatabase, listArchivedParticipants, saveEvent, saveParticipant, saveSubmission, startNewEvent } from './database.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
const port = process.env.PORT || 3001
const hostPassword = process.env.QUIZVERSE_HOST_PASSWORD || 'Sai nithin 26'

const questions = [
  { id: 'q1', prompt: 'Which data structure gives average O(1) key lookup?', options: ['Binary tree', 'Hash table', 'Linked list', 'Heap'], answer: 'Hash table', points: 100 },
  { id: 'q2', prompt: 'What does REST primarily model in a web API?', options: ['Resources', 'Threads', 'Pixels', 'Compilers'], answer: 'Resources', points: 100 },
  { id: 'q3', prompt: 'Which protocol secures HTTP traffic in transit?', options: ['FTP', 'SMTP', 'TLS', 'SSH'], answer: 'TLS', points: 100 },
  { id: 'q4', prompt: 'What is the output of typeof null in JavaScript?', options: ['null', 'undefined', 'object', 'boolean'], answer: 'object', points: 150 }
]

const state = {
  registrationOpen: true,
  round: 'lobby',
  eventId: 'event-1',
  questions: [...questions],
  participants: new Map(),
  archivedParticipants: [],
  startedAt: null,
  completed: new Set()
}

const difficultyRank = { easy: 0, medium: 1, moderate: 1, hard: 2 }
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
  const selected = ordered.slice(0, 30)
  participant.quizQuestions = selected.map(({ answer, explanation, ...question }) => question)
  participant.quizStartedAt = new Date().toISOString()
  return selected
}

const participantQuiz = (participant) => ({
  questions: participant.quizQuestions || [],
  startedAt: participant.quizStartedAt,
  durationSeconds: 30 * 60
})

const databaseReady = await initDatabase(state)

const publicState = () => ({
  registrationOpen: state.registrationOpen,
  round: state.round,
  startedAt: state.startedAt,
  questionCount: state.questions.length,
  participants: [...state.participants.values()].map(({ socketId, ...participant }) => participant),
  eventId: state.eventId
})

const broadcast = () => io.emit('state:update', publicState())

app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'quizverse', database: databaseStatus() }))
app.get('/api/state', (_req, res) => res.json(publicState()))

io.on('connection', (socket) => {
  socket.emit('state:update', publicState())

  socket.on('admin:login', (password, callback) => {
    if (password !== hostPassword) return callback?.({ error: 'That host key is not recognized.' })
    socket.data.isAdmin = true
    callback?.({ ok: true })
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
      joinedAt: new Date().toISOString(),
      socketId: socket.id
    }
    state.participants.set(id, participant)
    if (state.round === 'round1') assignQuiz(participant)
    socket.data.participantId = id
    await saveParticipant(participant)
    callback?.({ participant: { ...participant, socketId: undefined } })
    if (participant.quizQuestions.length) socket.emit('participant:quiz', participantQuiz(participant))
    broadcast()
  })

  socket.on('participant:restore', (id) => {
    const participant = state.participants.get(id)
    if (participant) {
      participant.socketId = socket.id
      socket.data.participantId = id
      socket.emit('participant:restored', participant)
      if (participant.quizQuestions.length) socket.emit('participant:quiz', participantQuiz(participant))
    }
  })

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

  socket.on('participant:submit-quiz', async ({ participantId }, callback) => {
    const participant = state.participants.get(participantId)
    if (!participant) return callback?.({ error: 'Participant session not found. Please return to the lobby.' })
    if (participant.quizSubmittedAt) return callback?.({ error: 'This quiz has already been submitted.' })
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
    participant.roundScores.round1 = score
    participant.status = 'submitted'
    participant.quizSubmittedAt = new Date().toISOString()
    state.completed.add(participantId)
    await saveParticipant(participant)
    socket.emit('quiz:submitted', { score, correctCount, total: participant.quizQuestions.length })
    broadcast()
    callback?.({ ok: true })
  })

  socket.on('admin:registration', (open) => {
    if (!socket.data.isAdmin) return
    state.registrationOpen = Boolean(open)
    saveEvent(state)
    broadcast()
  })

  socket.on('admin:round', async (round) => {
    if (!socket.data.isAdmin) return
    state.round = round
    state.startedAt = round === 'lobby' ? null : new Date().toISOString()
    for (const participant of state.participants.values()) {
      participant.status = round === 'lobby' ? 'ready' : 'active'
      if (round === 'round1') assignQuiz(participant)
    }
    await saveEvent(state)
    await Promise.all([...state.participants.values()].map(saveParticipant))
    if (round === 'round1') {
      for (const participant of state.participants.values()) {
        const participantSocket = io.sockets.sockets.get(participant.socketId)
        participantSocket?.emit('participant:quiz', participantQuiz(participant))
      }
    }
    broadcast()
  })

  socket.on('admin:eliminate', async (ids) => {
    if (!socket.data.isAdmin) return
    for (const id of ids) {
      const participant = state.participants.get(id)
      if (participant) participant.status = 'eliminated'
    }
    await Promise.all(ids.map((id) => state.participants.has(id) ? saveParticipant(state.participants.get(id)) : null))
    broadcast()
  })

  socket.on('admin:archives', async (_ignored, callback) => {
    if (!socket.data.isAdmin) return callback?.({ error: 'Unauthorized' })
    const stored = await listArchivedParticipants(state)
    const knownIds = new Set(stored.map((participant) => participant.id))
    const sessionArchive = state.archivedParticipants.filter((participant) => !knownIds.has(participant.id))
    callback?.({ participants: [...sessionArchive, ...stored] })
  })

  socket.on('admin:delete-participant', async (id, callback) => {
    if (!socket.data.isAdmin) return callback?.({ error: 'Unauthorized' })
    const deleted = await deleteParticipant(id)
    callback?.({ deleted })
  })

  socket.on('admin:participant-detail', (id, callback) => {
    if (!socket.data.isAdmin) return callback?.({ error: 'Unauthorized' })
    const participant = state.participants.get(id)
    if (!participant) return callback?.({ error: 'Participant not found' })
    const answers = participant.draftAnswers || {}
    const details = participant.quizQuestions.map((question, index) => {
      const source = state.questions.find((item) => item.id === question.id)
      const answer = answers[question.id]
      const correct = answer !== undefined && answer === source?.answer
      return { number: index + 1, prompt: question.prompt, answer: answer ?? null, correctAnswer: source?.answer ?? null, correct, points: correct ? source.points : 0 }
    })
    callback?.({ participant: { id: participant.id, name: participant.name, college: participant.college, score: participant.score, status: participant.status }, details })
  })

  socket.on('admin:new-event', async (callback) => {
    if (!socket.data.isAdmin) return callback?.({ error: 'Unauthorized' })
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
