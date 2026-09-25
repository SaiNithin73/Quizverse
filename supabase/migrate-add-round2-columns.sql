-- Adds Round 2 (Python debugging) columns to existing QuizVerse tables.
-- Run this once in the Supabase SQL editor, before seeding Round 2 questions.

alter table public.question_bank add column if not exists language text not null default 'javascript';
alter table public.question_bank add column if not exists initial_code text not null default '';
alter table public.question_bank add column if not exists function_name text;
alter table public.question_bank add column if not exists test_cases jsonb not null default '[]'::jsonb;
alter table public.question_bank add column if not exists title text;

alter table public.participants add column if not exists r2_questions jsonb not null default '[]'::jsonb;
alter table public.participants add column if not exists r2_draft_codes jsonb not null default '{}'::jsonb;
alter table public.participants add column if not exists r2_started_at timestamptz;
alter table public.participants add column if not exists r2_submitted_at timestamptz;
alter table public.participants add column if not exists r2_test_results jsonb not null default '{}'::jsonb;

-- Rapid Fire (Round 3): 10 unused MCQs + 10 unused debugging questions.
alter table public.participants add column if not exists r3_questions jsonb not null default '[]'::jsonb;
alter table public.participants add column if not exists r3_draft_answers jsonb not null default '{}'::jsonb;
alter table public.participants add column if not exists r3_draft_codes jsonb not null default '{}'::jsonb;
alter table public.participants add column if not exists r3_test_results jsonb not null default '{}'::jsonb;
alter table public.participants add column if not exists r3_started_at timestamptz;
alter table public.participants add column if not exists r3_submitted_at timestamptz;

-- Host-controlled winner release.
alter table public.event_settings add column if not exists winners jsonb;
alter table public.event_settings add column if not exists winners_released_at timestamptz;
