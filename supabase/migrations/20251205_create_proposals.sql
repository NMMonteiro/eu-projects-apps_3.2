-- Create proposals table
-- This table stores generated EU funding proposals

CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core Fields
    title TEXT NOT NULL,
    summary TEXT,
    
    -- Legacy hardcoded sections (for backward compatibility)
    relevance TEXT,
    methods TEXT,
    impact TEXT,
    introduction TEXT,
    objectives TEXT,
    methodology TEXT,
    expected_results TEXT,
    innovation TEXT,
    sustainability TEXT,
    consortium TEXT,
    work_plan TEXT,
    risk_management TEXT,
    dissemination TEXT,
    
    -- Structured Data (stored as JSONB for flexibility)
    partners JSONB DEFAULT '[]'::jsonb,
    work_packages JSONB DEFAULT '[]'::jsonb,
    milestones JSONB DEFAULT '[]'::jsonb,
    risks JSONB DEFAULT '[]'::jsonb,
    budget JSONB DEFAULT '[]'::jsonb,
    timeline JSONB DEFAULT '[]'::jsonb,
    technical_overview JSONB,
    
    -- Metadata
    project_url TEXT,
    selected_idea JSONB,
    settings JSONB,
    
    -- Timestamps
    generated_at TIMESTAMPTZ,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- User association
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_proposals_user_id ON public.proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON public.proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_title ON public.proposals(title);

-- Enable Row Level Security
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Allow users to read their own proposals
CREATE POLICY "Users can read their own proposals"
    ON public.proposals
    FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to insert their own proposals
CREATE POLICY "Users can insert their own proposals"
    ON public.proposals
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own proposals
CREATE POLICY "Users can update their own proposals"
    ON public.proposals
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own proposals
CREATE POLICY "Users can delete their own proposals"
    ON public.proposals
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE public.proposals IS 'Stores generated EU funding proposals with both structured and text content';
COMMENT ON COLUMN public.proposals.partners IS 'Array of partner objects in JSONB format';
COMMENT ON COLUMN public.proposals.work_packages IS 'Array of work package objects in JSONB format';
COMMENT ON COLUMN public.proposals.budget IS 'Array of budget item objects in JSONB format';

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
