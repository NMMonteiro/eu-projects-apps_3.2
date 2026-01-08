-- Add generation_prompt column to proposals table
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS generation_prompt TEXT;

COMMENT ON COLUMN public.proposals.generation_prompt IS 'The full AI prompt used to generate this proposal';
