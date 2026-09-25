-- ============================================================
-- ROUND 2 (REUSABLE FOR ROUND 3) — C "FIND THE ERROR" BANK
-- 🟢 Easy 1-10 · 🟡 Medium 11-20 · 🔴 Tricky 21-30
-- Safe to re-run: upserts on id and only adds missing columns.
-- Run in the Supabase SQL Editor.
-- ============================================================

-- Safety net: make sure the code columns exist (idempotent)
alter table public.question_bank add column if not exists language text not null default 'javascript';
alter table public.question_bank add column if not exists initial_code text not null default '';
alter table public.question_bank add column if not exists function_name text;
alter table public.question_bank add column if not exists test_cases jsonb not null default '[]'::jsonb;

insert into public.question_bank
  (id, round, topic, difficulty, question_type, language, prompt, options, answer, initial_code, function_name, test_cases, points, time_limit_seconds, explanation, is_active)
values

-- ─────────────────── 🟢 ROUND 1 – EASY (1-10) ───────────────────
(
  'r2c-e1', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should declare a = 10 and print it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing #include <stdio.h>.$ans$,
  $code$int main() {
    int a = 10;
    printf("%d", a);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing #include <stdio.h>.$ans$,
  true
),
(
  'r2c-e2', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should print the sum of a and b. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing ) in printf().$ans$,
  $code$int main() {
    int a = 10;
    int b = 20;
    printf("%d", a + b;
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing ) in printf().$ans$,
  true
),
(
  'r2c-e3', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should print a and return 0. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing ; after printf().$ans$,
  $code$int main() {
    int a = 10;
    printf("%d", a)
    return 0;
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing ; after printf().$ans$,
  true
),
(
  'r2c-e4', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should assign 20 to a variable and print it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Variable name cannot start with a number.$ans$,
  $code$int main() {
    int 2num = 20;
    printf("%d", 2num);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Variable name cannot start with a number.$ans$,
  true
),
(
  'r2c-e5', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should assign 10.5 to a float and print it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing ; after 10.5.$ans$,
  $code$int main() {
    float x = 10.5
    printf("%f", x);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing ; after 10.5.$ans$,
  true
),
(
  'r2c-e6', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should store the grade 'A' in a char and print it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Character should use single quotes: 'A'.$ans$,
  $code$int main() {
    char grade = "A";
    printf("%c", grade);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Character should use single quotes: 'A'.$ans$,
  true
),
(
  'r2c-e7', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should print 'Big' when a > 5. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing ; after printf().$ans$,
  $code$int main() {
    int a = 10;
    if(a > 5)
        printf("Big")
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing ; after printf().$ans$,
  true
),
(
  'r2c-e8', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should print Hello. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing closing double quote ".$ans$,
  $code$int main() {
    printf("Hello);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing closing double quote ".$ans$,
  true
),
(
  'r2c-e9', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should compute c = a + b and print it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing closing }.$ans$,
  $code$int main() {
    int a = 10;
    int b = 20;
    int c = a + b;
    printf("%d", c);
$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Missing closing }.$ans$,
  true
),
(
  'r2c-e10', 'round2', 'C DEBUGGING', 'easy', 'code', 'c',
  $txt$The snippet should print the integer a. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Wrong format specifier. Use %d for int.$ans$,
  $code$int main() {
    int a = 10;
    printf("%f", a);
}$code$,
  null, '[]'::jsonb, 100, null,
  $ans$Wrong format specifier. Use %d for int.$ans$,
  true
),

-- ─────────────────── 🟡 ROUND 2 – MEDIUM (11-20) ───────────────────
(
  'r2c-m1', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print 'Equal' when a equals 10. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Use == instead of = for comparison.$ans$,
  $code$int main() {
    int a = 10;
    if(a = 10)
        printf("Equal");
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Use == instead of = for comparison.$ans$,
  true
),
(
  'r2c-m2', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print 0 through 4 using a for loop. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing ) in printf().$ans$,
  $code$int main() {
    int i;
    for(i = 0; i < 5; i++)
        printf("%d", i
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Missing ) in printf().$ans$,
  true
),
(
  'r2c-m3', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should store 10 at a valid array index. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Index 5 is out of bounds. Valid indexes are 0–4.$ans$,
  $code$int main() {
    int arr[5];
    arr[5] = 10;
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Index 5 is out of bounds. Valid indexes are 0–4.$ans$,
  true
),
(
  'r2c-m4', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print 'A is greater' when a > b. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Unwanted semicolon after if condition.$ans$,
  $code$int main() {
    int a = 10;
    int b = 20;
    if(a > b);
        printf("A is greater");
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Unwanted semicolon after if condition.$ans$,
  true
),
(
  'r2c-m5', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should make the pointer p point to a. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Pointer should store an address: p = &a;$ans$,
  $code$int main() {
    int a = 10;
    int *p;
    p = a;
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Pointer should store an address: p = &a;$ans$,
  true
),
(
  'r2c-m6', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print the address held by pointer p. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$%p should be used to print a pointer address.$ans$,
  $code$int main() {
    int a = 10;
    int *p = &a;
    printf("%d", p);
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$%p should be used to print a pointer address.$ans$,
  true
),
(
  'r2c-m7', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should divide a by b safely. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Division by zero.$ans$,
  $code$int main() {
    int a = 10;
    int b = 0;
    int c = a / b;
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Division by zero.$ans$,
  true
),
(
  'r2c-m8', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet declares x and prints it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$x is an uninitialized variable.$ans$,
  $code$int main() {
    int x;
    printf("%d", x);
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$x is an uninitialized variable.$ans$,
  true
),
(
  'r2c-m9', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print a while counting down to 0. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Infinite loop because a is never decreased.$ans$,
  $code$int main() {
    int a = 10;
    while(a > 0) {
        printf("%d", a);
    }
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Infinite loop because a is never decreased.$ans$,
  true
),
(
  'r2c-m10', 'round2', 'C DEBUGGING', 'medium', 'code', 'c',
  $txt$The snippet should print 'Yes' or 'No' based on a. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Missing } before else.$ans$,
  $code$int main() {
    int a = 10;
    if(a > 5) {
        printf("Yes");
    else {
        printf("No");
    }
}$code$,
  null, '[]'::jsonb, 200, null,
  $ans$Missing } before else.$ans$,
  true
),

-- ─────────────────── 🔴 ROUND 3 – TRICKY (21-30) ───────────────────
(
  'r2c-t1', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$Study the snippet carefully: does it contain an error? If it runs, what is the output?$txt$,
  '[]'::jsonb,
  $ans$No syntax error. Output: 56.$ans$,
  $code$int main() {
    int a = 5;
    printf("%d", a++);
    printf("%d", a);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$No syntax error. Output: 56.$ans$,
  true
),
(
  'r2c-t2', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$Study the snippet carefully: does it contain an error? If it runs, what is the output?$txt$,
  '[]'::jsonb,
  $ans$No error. Output: 6.$ans$,
  $code$int main() {
    int a = 5;
    printf("%d", ++a);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$No error. Output: 6.$ans$,
  true
),
(
  'r2c-t3', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$The snippet should print 2.5 from dividing 5 by 2. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Integer division occurs first. Use (float)a / b for 2.5.$ans$,
  $code$int main() {
    int a = 5;
    int b = 2;
    float c = a / b;
    printf("%f", c);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$Integer division occurs first. Use (float)a / b for 2.5.$ans$,
  true
),
(
  'r2c-t4', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$The snippet reads an array element through pointer arithmetic. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Pointer goes beyond the valid array range.$ans$,
  $code$int main() {
    int a[3] = {1, 2, 3};
    printf("%d", *(a + 3));
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$Pointer goes beyond the valid array range.$ans$,
  true
),
(
  'r2c-t5', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$The snippet should print the result of calling the add helper. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$add() requires 2 arguments but only 1 is supplied.$ans$,
  $code$#include <stdio.h>

int add(int a, int b) {
    return a + b;
}

int main() {
    printf("%d", add(5));
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$add() requires 2 arguments but only 1 is supplied.$ans$,
  true
),
(
  'r2c-t6', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$The snippet stores 'Hello' in a fixed-size char array and prints it. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Array needs space for the null character. Use char str[6].$ans$,
  $code$#include <stdio.h>

int main() {
    char str[5] = "Hello";
    printf("%s", str);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$Array needs space for the null character. Use char str[6].$ans$,
  true
),
(
  'r2c-t7', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$Decide: does this snippet contain an error?$txt$,
  '[]'::jsonb,
  $ans$No error! This is a trick question. 😄$ans$,
  $code$int main() {
    int a = 10;
    if(a > 5 && a < 20)
        printf("Valid");
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$No error! This is a trick question. 😄$ans$,
  true
),
(
  'r2c-t8', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$The snippet should print i using the loop's final value. Find and fix the error.$txt$,
  '[]'::jsonb,
  $ans$Extra ; after the for loop. The block is not part of the loop.$ans$,
  $code$int main() {
    int i;
    for(i = 0; i < 5; i++);
    {
        printf("%d", i);
    }
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$Extra ; after the for loop. The block is not part of the loop.$ans$,
  true
),
(
  'r2c-t9', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$Decide: does this snippet contain an error? If not, what does it print?$txt$,
  '[]'::jsonb,
  $ans$No error! Output is 20.$ans$,
  $code$int main() {
    int a = 10;
    int b = 20;
    printf("%d", a > b ? a : b);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$No error! Output is 20.$ans$,
  true
),
(
  'r2c-t10', 'round2', 'C DEBUGGING', 'tricky', 'code', 'c',
  $txt$Decide: does this snippet contain an error? If not, what does it print?$txt$,
  '[]'::jsonb,
  $ans$No syntax error. Output is 1 because both values are non-zero.$ans$,
  $code$int main() {
    int a = 10;
    int b = 20;
    printf("%d", a && b);
}$code$,
  null, '[]'::jsonb, 250, null,
  $ans$No syntax error. Output is 1 because both values are non-zero.$ans$,
  true
);

-- ================= END C DEBUGGING SEED ========================

-- Quick check after running:
-- select difficulty, count(*) from public.question_bank where topic = 'C DEBUGGING' group by difficulty;
