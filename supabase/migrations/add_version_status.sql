-- Add status column to versions table
-- Possible values: 'draft', 'approved', 'rejected'
ALTER TABLE versions
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
CHECK (status IN ('draft', 'approved', 'rejected'));

-- Add approved_at timestamp
ALTER TABLE versions
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
