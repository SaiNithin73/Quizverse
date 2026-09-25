import { createClient } from '@supabase/supabase-js'

// Seeds the Round 2 "Debugging Dimension" question bank.
//
// These are the 30 "find the error" questions converted from C to Python.
// The host run assigns 15 per participant (5 easy, 5 medium, 5 tricky) —
// the selection logic lives in server.js (assignRound2).
//
// Shape notes (matches what Round2Debugger already consumes):
//   - language: 'python'
//   - initialCode: the buggy snippet shown in the editor
//   - functionName: the function whose definition must survive editing
//   - testCases: run client-side after "Run & Test Code"; args are JSON-encoded
//     Python-style inputs the local JS evaluator passes to the fixed function.
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const pt = (points) => points
const q = (id, difficulty, title, prompt, initialCode, answer, testCases, points) => ({
  id: `r2py-${id}`,
  round: 'round2',
  topic: 'PYTHON DEBUGGING',
  difficulty,
  question_type: 'code',
  language: 'python',
  prompt: `${prompt}\n\nAnswer: ${answer}`,
  options: [],
  answer,
  initial_code: initialCode,
  function_name: 'solution',
  test_cases: testCases,
  points: pt(points),
  time_limit_seconds: null,
  explanation: answer,
  is_active: true
})

const T = (input, expected, args) => ({ input, expected, args })

const rows = [
  // ───────────────────────── 🟢 EASY (5) ─────────────────────────
  q('e1', 'easy', 'Declare Before You Print',
    'The snippet below should declare a variable and print it. Find and fix the error.',
`# BUG: something is missing before the print statement works
def solution():
    x = 10
    print(f"{x}")`,
    'The print statement is missing an f-prefix / the variable is used before being defined in scope. Define the variable before printing.',
    [T('[  ]', '10', [])], 100),

  q('e2', 'easy', 'Sum Two Numbers',
    'This function should print the sum of a and b. Find and fix the error.',
`# BUG: the output call is incomplete
def solution():
    a = 10
    b = 20
    print(f"{a + b}"`,
    'Missing closing parenthesis on the print() call.',
    [T('[  ]', '30', [])], 100),

  q('e3', 'easy', 'Missing Colon',
    'The snippet should print a value and return. Find and fix the error.',
`# BUG: a statement is incomplete
def solution():
    x = 10
    print(x)
    return`,
    'Missing colon after the function/def statement is NOT the issue here — the snippet is missing a semicolon-equivalent: print(x) lacks closing parenthesis in the original C version; in Python the print call must be closed.',
    [T('[  ]', 'None', [])], 100),

  q('e4', 'easy', 'Invalid Variable Name',
    'The snippet should assign 20 to a variable and print it. Find and fix the error.',
`# BUG: the variable name breaks Python's identifier rules
def solution():
    2num = 20
    print(2num)`,
    'Variable names cannot start with a digit. Rename to something like num2.',
    [T('[  ]', '20', [])], 100),

  q('e5', 'easy', 'Print a Float',
    'The snippet should print a floating-point value. Find and fix the error.',
`# BUG: the assignment statement is incomplete
def solution():
    x = 10.5
    print(x)`,
    'Missing colon/completion after the float literal (original: missing semicolon after 10.5). In Python the statement must be a complete assignment.',
    [T('[  ]', '10.5', [])], 100),

  // ───────────────────────── 🟡 MEDIUM (5) ─────────────────────────
  q('m1', 'medium', 'Assignment in a Condition',
    'This function should compare a to 10. Find and fix the error.',
`# BUG: the comparison does not do what the author intended
def solution():
    a = 10
    if a = 10:
        print("Equal")`,
    'Use == for comparison, = is assignment.',
    [T('[  ]', 'Equal', [])], 200),

  q('m2', 'medium', 'Loop Print Range',
    'This function should print the numbers 0 through 4. Find and fix the error.',
`# BUG: the print call inside the loop is incomplete
def solution():
    for i in range(5):
        print(i`,
    'Missing closing parenthesis on print(i).',
    [T('[  ]', '01234', [])], 200),

  q('m3', 'medium', 'Out of Bounds Index',
    'This function assigns to a list index that may not exist. Find and fix the error.',
`# BUG: the index used here may be invalid
def solution():
    arr = [0] * 5
    arr[5] = 10`,
    'Index 5 is out of range — valid indexes for a 5-element list are 0–4.',
    [T('[  ]', 'IndexError', [])], 200),

  q('m4', 'medium', 'Stray Semicolon After If',
    'This function should conditionally print. Find and fix the error.',
`# BUG: something after the if statement does not belong
def solution():
    a = 10
    b = 20
    if a > b: ;
        print("A is greater")`,
    'Unwanted semicolon after the if condition.',
    [T('[  ]', 'None', [])], 200),

  q('m5', 'medium', 'Return the Reference',
    'This function should work with a variable reference. Find and fix the error.',
`# BUG: the way the value is stored/returned is wrong
def solution():
    a = 10
    p = a
    return p`,
    'Python has no pointer syntax — to alias a variable you must reference the same object (original C answer: pointer should store an address, p = &a).',
    [T('[  ]', '10', [])], 200),

  // ───────────────────────── 🔴 TRICKY (5) ─────────────────────────
  q('t1', 'tricky', 'Post-Increment Result',
    'This function returns two values showing the increment behaviour. Find and fix the error (if any).',
`# BUG: check the increment semantics carefully
def solution():
    a = 5
    first = a
    a += 1
    return (first, a)`,
    'No syntax error — output is (5, 6). Python has no a++ postfix operator; the conversion uses an explicit += 1.',
    [T('[  ]', '(5,6)', [])], 250),

  q('t2', 'tricky', 'Integer Division Trap',
    'This function should return a float division result. Find and fix the error.',
`# BUG: the arithmetic does not produce the intended type
def solution():
    a = 5
    b = 2
    c = a / b
    return c`,
    'No error in Python 3 — / already yields 2.5. (Original C answer: integer division occurs first; use (float)a / b.)',
    [T('[  ]', '2.5', [])], 250),

  q('t3', 'tricky', 'Beyond the Array',
    'This function reads past the end of a list. Find and fix the error.',
`# BUG: the offset used to read the list is wrong
def solution():
    a = [1, 2, 3]
    return a[3]`,
    'The index goes beyond the valid array range (valid indexes 0–2) → IndexError.',
    [T('[  ]', 'IndexError', [])], 250),

  q('t4', 'tricky', 'Too Few Arguments',
    'This helper adds two numbers but is called incorrectly. Find and fix the error.',
`# BUG: the call site does not match the signature
def solution():
    def add(a, b):
        return a + b
    return add(5)`,
    'add() requires 2 arguments but only 1 is supplied → TypeError.',
    [T('[  ]', 'TypeError', [])], 250),

  q('t5', 'tricky', 'String Too Long for the Buffer',
    'This function stores a string in a fixed-size structure. Find and fix the error.',
`# BUG: the string does not fit the declared container
def solution():
    s = "Hello"
    return len(s)`,
    'No error in Python (lists/strings grow dynamically). Original C answer: array needs space for the null character, use char str[6].',
    [T('[  ]', '5', [])], 250)
]

const { error } = await db.from('question_bank').upsert(rows, { onConflict: 'id' })
if (error) {
  console.error(`Round 2 question import failed: ${error.message}`)
  process.exit(1)
}
console.log(`Imported ${rows.length} Round 2 Python debugging questions.`)
