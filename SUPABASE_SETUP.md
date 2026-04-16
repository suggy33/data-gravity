# Supabase Integration Setup

## Environment Variables

The following environment variables have been added to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://qsjorhuqgjvflidhykdb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_S4ybb0XuOSSB5cKo4isDKw_HYHJcftk
```

## Supabase Table Setup

You need to create an `analyses` table in your Supabase database. Follow these steps:

### 1. Go to Supabase Console

- Visit: https://app.supabase.com
- Navigate to your project: `data-gravity`

### 2. Create the `analyses` Table

Go to **SQL Editor** and run the following SQL:

```sql
CREATE TABLE analyses (
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

-- Create index for faster queries
CREATE INDEX idx_analyses_created_at ON analyses(createdAt DESC);
CREATE INDEX idx_analyses_file_name ON analyses(fileName);

-- Enable RLS (optional - for production)
-- ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
```

### 3. Verify Table Creation

In the Supabase console, under **Database** → **Tables**, you should see the `analyses` table.

## API Routes

The following API routes now use Supabase:

- `POST /api/intelligence/save-analysis` - Save a new analysis
- `GET /api/intelligence/list-analyses` - List all analyses
- `GET /api/intelligence/analyses/[id]` - Get a specific analysis

## Features

✅ Cloud-based storage for all analyses  
✅ Accessibility from any device/browser  
✅ Persistent analysis history  
✅ Shareable analysis IDs  
✅ Integrated with K-means clustering results

## Testing

1. Upload a dataset in the Intelligence Engine
2. Complete the clustering analysis
3. Check the Supabase console to verify the data was saved
4. Refresh the page - analysis data should persist
5. Other team members can access the analysis via its ID

## Troubleshooting

If you encounter CORS errors:

1. Go to Supabase console
2. Navigate to **Settings** → **API**
3. Under "CORS", add your development URL if needed

If you encounter permission errors:

1. Verify the anon key is correct
2. Check that RLS policies allow the operation (if RLS is enabled)
3. Temporarily disable RLS for testing: `ALTER TABLE analyses DISABLE ROW LEVEL SECURITY;`
