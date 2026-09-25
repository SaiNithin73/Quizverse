# Round 3 Rapid Fire Design

## Goal
Add a host-controlled Rapid Fire phase after Rounds 1 and 2. Each participant receives 10 unused MCQs followed by 10 unused debugging questions, has 15 minutes total, and earns 200 points per correct question.

## Server and persistence
- Load the existing MCQ and Round 2 debugging banks as the two source pools.
- Assign each participant 10 questions from each pool, excluding IDs in their Round 1 and Round 2 assignments.
- Persist assigned questions, MCQ answers, debug code drafts/results, start/submission timestamps, and the Round 3 score on `participants`.
- Expose a participant Rapid Fire payload without answer keys.
- Reject Rapid Fire launch unless the participant has completed both earlier rounds and both source pools can satisfy the unused-question requirement.
- Score MCQs by exact answer match and debugging questions by a complete test result, with 200 points per correct answer.
- Add a migration for the new participant columns.

## Client flow
- Add a dedicated Rapid Fire view with a 15-minute timer, progress/section indicator, compact MCQ controls, and the existing debugger interaction for code questions.
- Auto-return to the lobby when time reaches zero and submit the current work once.
- Keep the score reveal idempotent: submission events and acknowledgement callbacks must not create duplicate reveal state or replay the reveal animation.
- Display Rapid Fire score and total score separately, with analysis available from the lobby.

## Host and responsive UI
- Replace the placeholder Round 3 host action with `Round 3 · Rapid Fire`.
- Show Round 3 scores in roster/detail summaries.
- Reduce control/button padding and typography in host and mobile breakpoints while preserving touch targets and readable labels.

## Validation
- Build the Vite client.
- Run a syntax check for the Node server.
- Verify the server rejects invalid Rapid Fire launches and assigns the 10+10 shape when pools are available.
