-- Supabase SQL Migration for Data Gravity
-- Run this in the Supabase SQL Editor to create the analyses table

-- Create the analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  fileName TEXT NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL,
  features TEXT[] NOT NULL,
  numClusters INTEGER NOT NULL,
  rowCount INTEGER NOT NULL,
  datasetMetadata JSONB NOT NULL,
  clusteringResults JSONB NOT NULL,
  silhouetteScore NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_file_name ON analyses(fileName);

-- Grant permissions (if using authenticated users, adjust as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON analyses TO authenticated;
GRANT SELECT, INSERT ON analyses TO anon;

-- Optional: Enable RLS (Row Level Security) for production
-- ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Optional RLS Policy for anon users to only see their own analyses
-- CREATE POLICY "Users can view their own analyses"
--   ON analyses
--   FOR SELECT
--   USING (TRUE);
--
-- CREATE POLICY "Users can insert analyses"
--   ON analyses
--   FOR INSERT
--   WITH CHECK (TRUE);
