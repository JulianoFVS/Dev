ALTER TABLE public.kanban_cartoes
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS tipo_protese text,
  ADD COLUMN IF NOT EXISTS cor_dente text,
  ADD COLUMN IF NOT EXISTS cor_gengiva text,
  ADD COLUMN IF NOT EXISTS posicao text,
  ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;

UPDATE public.kanban_cartoes
SET checklist = '[]'::jsonb
WHERE checklist IS NULL;

ALTER TABLE public.kanban_cartoes
  ALTER COLUMN checklist SET DEFAULT '[]'::jsonb;
