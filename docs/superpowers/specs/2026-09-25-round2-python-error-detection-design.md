# Round 2: Python Error Detection — Design Spec

## Overview
Replace hardcoded JavaScript debugging questions with Python error detection questions fetched from Supabase. Each participant receives 30 random questions from a pool of 100. Code is executed in-browser using Skulpt.

## Database
- Table: `question_bank`
- Filter: `round = 'round2'` AND `language = 'python'` AND `is_active = true`
- 100 questions total (50 easy, 50 moderate)
- Each question has: `id`, `prompt`, `initial_code`, `answer`, `points`, `difficulty`

## Server Changes (`server.js`)
1. Remove hardcoded `round2Questions` array
2. On server startup, load all Round 2 questions from DB into `state.r2Questions`
3. `assignRound2()` selects 30 random questions (shuffle + slice)
4. Questions assigned per participant stored in `participant.r2Questions`

## Frontend Changes (`main.jsx`)
1. Add Skulpt library for in-browser Python execution
2. Modify `Round2Debugger` component:
   - Show buggy Python code in editor
   - "Run & Test Code" button executes code via Skulpt
   - If code runs without error → ✅ correct (full points)
   - If code throws error → ❌ incorrect
   - No test cases — validation is "does it run?"
3. Update scoring to use text-match validation on submit

## Flow
1. Host broadcasts Round 2
2. Server assigns 30 random questions to each participant
3. Participant edits code in editor
4. Participant clicks "Run & Test Code"
5. Skulpt executes the Python code
6. Success (no error) = correct, failure (error) = incorrect
7. On submit, score = sum of correct answers × points

## Dependencies
- Add `skulpt` package (npm install skulpt)
- Or load Skulpt via CDN in index.html
