import { createClient } from '@supabase/supabase-js'

let supabase = null
let connected = false
let connectionError = null

export async function initDatabase(state) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    connectionError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.'
    return false
  }

  supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: event, error: eventError } = await supabase
    .from('event_settings')
    .select('id, registration_open, round, started_at')
    .eq('id', 'main')
    .maybeSingle()

  if (eventError) {
    connectionError = eventError.message
    supabase = null
    return false
  }

  if (event) {
    state.registrationOpen = event.registration_open
    state.round = event.round
    state.startedAt = event.started_at
    state.eventId = 'event-1'
  } else {
    state.eventId = 'event-1'
    await supabase.from('event_settings').insert({ id: 'main', current_event_id: state.eventId, registration_open: true, round: 'lobby' })
  }

  let { data: participants, error: participantError } = await supabase
    .from('participants')
    .select('*')
    .order('joined_at', { ascending: true })

  if (participantError) {
    connectionError = participantError.message
    supabase = null
    return false
  }

  for (const participant of participants || []) {
    state.participants.set(participant.id, {
      id: participant.id,
      eventId: participant.event_id || 'event-1',
      name: participant.name,
      college: participant.college,
      department: participant.department,
      year: participant.year,
      score: participant.score,
      status: participant.status,
      roundScores: participant.round_scores || { round1: 0, round2: 0, round3: 0 },
      quizQuestions: participant.quiz_questions || [],
      draftAnswers: participant.draft_answers || {},
      quizStartedAt: participant.quiz_started_at,
      quizSubmittedAt: participant.quiz_submitted_at,
      joinedAt: participant.joined_at,
      socketId: null
    })
  }

  const { data: questionBank, error: questionError } = await supabase
    .from('question_bank')
    .select('id, round, topic, difficulty, question_type, prompt, options, answer, points, time_limit_seconds, explanation')
    .eq('is_active', true)
    .order('id', { ascending: true })

  if (questionError) {
    connectionError = questionError.message
    supabase = null
    return false
  }

  if (questionBank?.length) state.questions = questionBank

  const { data: r2Bank, error: r2Error } = await supabase
    .from('question_bank')
    .select('id, round, topic, title, difficulty, question_type, prompt, options, answer, points, time_limit_seconds, explanation, language, initial_code, function_name, test_cases')
    .eq('round', 'round2')
    .eq('is_active', true)
    .order('id', { ascending: true })

  if (r2Error) {
    connectionError = r2Error.message
    supabase = null
    return false
  }

  if (r2Bank?.length) state.r2Questions = r2Bank

  connectionError = null
  connected = true
  return true
}

export function databaseStatus() {
  return { connected, error: connectionError }
}

export async function saveParticipant(participant) {
  if (!supabase) return
  const { error } = await supabase.from('participants').upsert({
    id: participant.id,
    event_id: participant.eventId,
    name: participant.name,
    college: participant.college,
    department: participant.department,
    year: participant.year,
    score: participant.score,
    status: participant.status,
    round_scores: participant.roundScores,
    quiz_questions: participant.quizQuestions || [],
    draft_answers: participant.draftAnswers || {},
    quiz_started_at: participant.quizStartedAt || null,
    quiz_submitted_at: participant.quizSubmittedAt || null,
    joined_at: participant.joinedAt
  })
  if (error) connectionError = error.message
}

export async function saveEvent(state) {
  if (!supabase) return false
  const { error } = await supabase.from('event_settings').upsert({
    id: 'main',
    current_event_id: state.eventId,
    registration_open: state.registrationOpen,
    round: state.round,
    started_at: state.startedAt
  })
  if (error) {
    connectionError = error.message
    return false
  }
  return true
}

export async function startNewEvent(state) {
  const previousEventId = state.eventId
  state.eventId = `event-${Date.now()}`
  state.registrationOpen = true
  state.round = 'lobby'
  state.startedAt = null
  state.participants.clear()

  if (!supabase) return true

  const saved = await saveEvent(state)
  if (!saved) state.previousEventId = previousEventId
  return saved
}

export async function listArchivedParticipants(state) {
  if (!supabase) return []
  const filtered = await supabase.from('participants').select('*').neq('event_id', state.eventId).order('joined_at', { ascending: false })
  if (!filtered.error) return filtered.data || []
  const legacy = await supabase.from('participants').select('*').order('joined_at', { ascending: false })
  return legacy.data || []
}

export async function deleteParticipant(id) {
  if (!supabase) return false
  const { error } = await supabase.from('participants').delete().eq('id', id)
  return !error
}

export async function saveSubmission({ participantId, questionId, answer, correct, points }) {
  if (!supabase) return
  const { error } = await supabase.from('submissions').insert({
    participant_id: participantId,
    question_id: questionId,
    answer,
    correct,
    points
  })
  if (error) connectionError = error.message
}
