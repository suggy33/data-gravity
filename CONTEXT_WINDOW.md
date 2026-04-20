# Context Window: Data-Gravity Project

## 🎯 Project Overview

**Name**: Data-Gravity  
**Goal**: Build an AI-powered data analysis & customer segmentation platform that automatically ingests CSV data, performs clustering, generates customer segments with engagement scoring, and provides actionable business strategies.

**Core Problem Being Solved**: 
- Users upload raw customer data (e.g., transaction history, demographics)
- System automatically determines data structure, cleans it intelligently, performs clustering
- Delivers visual cluster analysis + actionable segment strategies
- Currently focused on: Fixing cluster visualization to actually make sense (not all engagement scores identical)

---

## 📊 What We're Building

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js/React)                                    │
│  • Dashboard with cluster visualization                     │
│  • Segment tables with engagement scores                    │
│  • Strategy recommendations per segment                     │
│  • CSV upload interface                                     │
└──────────────────┬──────────────────────────────────────────┘
                   │ API Calls
┌──────────────────▼──────────────────────────────────────────┐
│ BACKEND (Node.js/Next.js API Routes)                       │
│  ├─ /api/ingest - Upload CSV, store in database            │
│  ├─ /api/pipeline/start - Kick off analysis pipeline       │
│  ├─ /api/pipeline/runs/{id} - Get analysis results         │
│  └─ /api/run/{id}/summary - Get clustering summary         │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ PIPELINE STAGES (Pure TypeScript, no external ML libs)      │
│  1. Ingestion: Load & store CSV                            │
│  2. Metadata: Profile columns, infer types & roles         │
│  3. Cleaning: Smart categorical encoding (NEW!)             │
│  4. Model Selection: Choose algorithm (KMeans, DecisionTree) │
│  5. Training: Run clustering/regression                    │
│  6. Evaluation: Calculate metrics, feature importance      │
│  7. Insights: Generate strategies                          │
│  8. Strategy: Format for frontend                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ ML ALGORITHMS (Custom TypeScript)                           │
│  • KMeans Clustering                                        │
│  • Decision Tree Classifier/Regressor                       │
│  • Linear Regression                                        │
│  • Silhouette Score calculation                             │
│  • PCA 2D Projection (NEW!)                                 │
│  • Feature importance calculation                           │
└─────────────────────────────────────────────────────────────┘
```

### Core Workflow
1. **User uploads CSV** → Stored in database with version tracking
2. **Metadata inference** → Detect columns, infer types (numeric/categorical), auto-detect task
3. **Smart cleaning** → Handle missing values, scale numerics, encode categoricals (NEW: Smart thresholds!)
4. **Clustering** → KMeans on cleaned features
5. **2D Visualization** → PCA project to 2D for visual inspection (NEW!)
6. **Engagement scoring** → Percentile-based ranking per segment (NEW!)
7. **Strategy generation** → LLM-powered recommendations per segment
8. **Dashboard display** → Interactive cluster visualization

---

## ✅ What We've Achieved

### 1. Smart Categorical Encoding (JUST FIXED ✓)
**Problem**: City column (531 distinct values) was creating 531 one-hot columns from 10K rows
**Solution**: Cardinality-aware encoding strategy
```typescript
if (distinctCount <= 1) → DROP (no signal)
if (distinctCount <= 10) → ONE-HOT (safe)
if (distinctCount > 50) → DROP (curse of dimensionality)
else → ONE-HOT with frequency sorting
```
**Result**: 593 features → 13 features (98% reduction!)
**Impact**: Model trains on signal, not noise

### 2. PCA 2D Projection (JUST ADDED ✓)
**Purpose**: Visualize cluster separation in feature space
**Implementation**: Power iteration-based PCA (no external deps)
```typescript
• Center data
• Power iteration 5x → Find PC1
• Deflate → Find PC2
• Project all 10K points to 2D
```
**Result**: Each customer positioned in 2D space by feature similarity
**Impact**: Users can visually inspect: "Are my clusters actually separated?"

### 3. Type System Extensions (JUST COMPLETED ✓)
- `SegmentSummary.centroid2d?: {x, y}` - 2D position of cluster
- `TrainingArtifact.projection2d?: Array<{x, y, label}>` - All points in 2D
- `CleaningDecision.action` - Added `"drop_column"` option

### 4. Frontend Visualization (JUST UPGRADED ✓)
- Default: 2D PCA scatter plot (KNN-style) showing all customer points colored by cluster
- Fallback: Engagement vs cluster size (original)
- Interactive: Hover shows cluster name, size, engagement, priority

### 5. Percentile-Based Engagement Scoring (JUST IMPROVED ✓)
```
High segment: 80-100 (top 33% predictions + variance bonus)
Mid segment: 50-70 (middle 33% + bonus)
Low segment: 20-45 (bottom 33% + bonus)
```
**Why**: Ensures differentiation even when predictions clustered

### 6. Core Pipeline Features (ALREADY WORKING ✓)
- ✅ CSV ingestion with automatic profiling
- ✅ Task type inference (clustering/classification/regression)
- ✅ Column role assignment (feature/target/id/ignored)
- ✅ Missing value handling (imputation)
- ✅ Feature scaling (standardization)
- ✅ KMeans clustering with silhouette scoring
- ✅ Feature importance calculation
- ✅ LLM-powered strategy generation
- ✅ Run history tracking with versioning
- ✅ API endpoints for data retrieval

---

## 🎨 Current State - What Users See

### Upload Flow
```
User selects CSV
    ↓
Upload form shows data preview
    ↓
System analyzes (2-3 seconds)
    ↓
Redirects to /dashboard/clusters/{runId}
```

### Dashboard - Cluster View
```
┌─ Clustering Workspace ─────────────────────────┐
│ Latest run ID: [id]                            │
│ 3 segments from 9,994 customers               │
│ Silhouette score: 0.35                         │
│ Load Latest Run | Load Run...                  │
└────────────────────────────────────────────────┘

┌─ Cluster Distribution ─────────────────────────┐
│  [2D PCA Scatter Plot - KNN Style]             │
│                                                │
│   ●●●  (Red: High Value)                       │
│ ●●●●●●● (Blue: Mid Value)                     │
│  ●●●●●● (Green: Low Value)                    │
│                                                │
│  Legend: High (3300), Mid (3396), Low (3298)  │
└────────────────────────────────────────────────┘

┌─ Segment Table ────────────────────────────────┐
│ Segment  | Size | Engagement | Risk | Action  │
├──────────┼──────┼────────────┼──────┼─────────┤
│ High Val | 3300 | 22/100     | Low  | Upsell  │
│ Mid Val  | 3396 | 20/100     | Med  | Retain  │
│ Low Val  | 3298 | 20/100     | High | Reacct  │
└────────────────────────────────────────────────┘
```

### Test Data Results
- **Dataset**: SampleSuperstore (10K rows, 10 columns)
- **Features after cleaning**: 13 (down from 593 proposed)
- **Clusters**: 3 (High/Mid/Low value)
- **Model**: KMeans
- **Silhouette Score**: ~0.35
- **Engagement Scores**: High=22, Mid=20, Low=20 (still compressed but now percentile-based)

---

## 🚨 Known Issues / Blockers

### 1. Engagement Score Differentiation STILL LIMITED
**Issue**: All segments showing similar engagement (20-22/100)
**Root Cause**: Regression model predictions have narrow range (all values similar)
**Current Fix**: Percentile-based with variance bonus (helps but limited by underlying model)
**Still TODO**: 
- Investigate why regression predictions so clustered
- Try alternative target variables (Profit variance?)
- Adjust model hyperparameters (tree depth, regularization)
- Consider alternative engagement calculation

### 2. Cluster Quality Varies by Dataset
**Issue**: Silhouette scores sometimes low (~0.35), indicating weak clustering
**Root Cause**: Some datasets don't have natural clusters, or features not discriminative
**Current Status**: Expected behavior, LLM strategies still generated
**Still TODO**: Add cluster quality warnings to dashboard

### 3. API Response Size Large
**Issue**: When fetching full run with large datasets, response payload huge (~20MB)
**Root Cause**: Projection2d stores all 10K points × 2 coordinates × metadata
**Current Status**: Works but slow
**Still TODO**: 
- Compress projection data (store as deltas, encode as base64)
- Stream large responses
- Paginate point data for visualization

### 4. Categorical Encoding Edge Cases
**Issue**: Some datasets have many moderate-cardinality columns (11-50 distinct)
**Current Logic**: ONE-HOT all of them, could still explode features
**Still TODO**: 
- Implement target encoding for medium-cardinality
- Add chi-square test for categorical importance
- Drop low-importance categorical features even if low-cardinality

---

## 📈 Improvements Still TODO

### High Priority (Blocking User Value)

#### 1. Fix Engagement Score Differentiation
**Why**: Currently all segments show 20-22/100, defeating purpose of segmentation
**What**: 
- [ ] Check regression model target variable distribution
- [ ] Test with different datasets to isolate issue
- [ ] Consider using RFM (Recency/Frequency/Monetary) directly
- [ ] Or switch to alternative engagement metric (NPS, churn risk)
- [ ] Verify percentile calculation logic

#### 2. Add Cluster Quality Metrics to Dashboard
**Why**: Users need to know if their segmentation is trustworthy
**What**:
- [ ] Display silhouette score interpretation (0.3 = weak, 0.5 = fair, 0.7 = good)
- [ ] Show Davies-Bouldin index (between-cluster vs within-cluster distance)
- [ ] Display warning if clusters poorly separated
- [ ] Suggest increasing k if silhouette too low

#### 3. Optimize API Response Size
**Why**: Large responses slow down frontend
**What**:
- [ ] Compress projection2d using delta encoding
- [ ] Return subset of points for preview, load full on demand
- [ ] Add pagination for point visualization
- [ ] Cache compressed versions

### Medium Priority (Nice to Have)

#### 4. Improve Categorical Feature Selection
**Why**: Still risk of medium-cardinality explosion in some datasets
**What**:
- [ ] Add chi-square test for categorical → target association
- [ ] Drop low-association categorical features (weak predictors)
- [ ] Use mutual information scoring
- [ ] Implement target encoding for 11-50 cardinality

#### 5. Add More Clustering Algorithms
**Why**: KMeans assumes spherical clusters, not always appropriate
**What**:
- [ ] Implement DBSCAN (for arbitrary shapes)
- [ ] Implement Hierarchical clustering (dendrograms)
- [ ] Add silhouette-based optimal k selection
- [ ] Let users choose algorithm via UI

#### 6. Enhance Visualization
**Why**: Current 2D view limited, can't see 3rd dimension
**What**:
- [ ] Add 3D projection option (PC1, PC2, PC3)
- [ ] Add feature importance overlay on axes
- [ ] Show which features drive PC1, PC2
- [ ] Add density contours showing cluster boundaries

#### 7. Feature Engineering Pipeline
**Why**: Current features basic, could be more predictive
**What**:
- [ ] Add polynomial features (for non-linear relationships)
- [ ] Add interaction features (e.g., Profit × Quantity)
- [ ] Add temporal features if date available
- [ ] Implement automated feature selection

### Low Priority (Polish)

#### 8. Improve LLM Strategy Generation
**Why**: Strategies sometimes generic
**What**:
- [ ] Make strategies more data-driven with specific metrics
- [ ] Add competitive benchmarking info
- [ ] Generate A/B test recommendations
- [ ] Add implementation roadmap with timelines

#### 9. Multi-step Wizard for Analysis
**Why**: Current flow straightforward but could guide users better
**What**:
- [ ] Add data quality checks before pipeline
- [ ] Let users review cleaning decisions
- [ ] Allow parameter tuning before running
- [ ] Show progress with stage details

#### 10. Export Capabilities
**Why**: Users want to use results in other tools
**What**:
- [ ] Export segments as CSV with customer assignments
- [ ] Export strategies as PDF report
- [ ] Export cluster visualization as PNG/SVG
- [ ] Export model as JSON for deployment

---

## 🏗️ Technical Debt

1. **Next.js Turbopack warning**: Multiple lockfiles detected (pnpm-lock.yaml, package-lock.json)
   - Should consolidate to single package manager
   
2. **Environment detection**: .env.local handling could be more robust

3. **Error handling**: API errors not always propagated cleanly to frontend

4. **Logging**: Pipeline execution not well-logged for debugging

5. **Performance**: No caching layer, every analysis re-runs calculations

---

## 💡 Recent Decisions & Rationale

### Why Smart Categorical Encoding?
- **Problem**: One-hot encoding ALL categorical columns created 593 features
- **Decision**: Use cardinality thresholds (drop >50, one-hot ≤10)
- **Result**: 98% feature reduction while preserving signal
- **Trade-off**: Might lose some high-cardinality info, but noise reduction worth it

### Why PCA 2D Projection?
- **Problem**: Users couldn't visualize if clusters actually separated
- **Decision**: Implement PCA (eigenvalue decomposition via power iteration)
- **Result**: Shows cluster separation in 2D
- **Trade-off**: Loses ~20% variance, but 2D visualization worth it

### Why Percentile-Based Engagement?
- **Problem**: Min-max normalization produced compressed 20-22 range
- **Decision**: Use segment rank (top/mid/bottom) + variance bonus
- **Result**: Ensures differentiation even with narrow predictions
- **Trade-off**: Still limited if model can't predict variety

### Why No External ML Libraries?
- **Problem**: Want minimal dependencies, easy deployment
- **Decision**: Implement algorithms in pure TypeScript
- **Result**: KMeans, PCA, Decision Tree, Linear Regression all custom
- **Trade-off**: Slightly slower than optimized libraries, but good enough for 10K rows

---

## 📊 Current Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Feature reduction | 98% | >95% | ✅ |
| Clustering speed | 2-3s | <5s | ✅ |
| Silhouette score | 0.35 | >0.5 | ⚠️ |
| Engagement differentiation | 20-22 range | 20-100 range | 🔴 |
| Type safety | 100% | 100% | ✅ |
| Test coverage | ~30% | >80% | ⚠️ |

---

## 🔄 Recent Changes (This Session)

1. **lib/pipeline/ml.ts**: Added `pca2d()` function for 2D projection
2. **lib/pipeline/stages.ts**: 
   - Smart categorical encoding in `buildCleaningPlan()`
   - Drop column execution in `executeCleaning()`
   - PCA projection calculation in `buildTraining()`
   - Percentile-based engagement scoring
3. **lib/pipeline/types.ts**: 
   - Added `centroid2d` to SegmentSummary
   - Added `projection2d` to TrainingArtifact
   - Added `drop_column` to CleaningDecision actions
4. **components/dashboard/cluster-scatter-plot.tsx**: 
   - Added 2D PCA visualization (primary)
   - Kept engagement vs size view (fallback)
5. **app/dashboard/clusters/page.tsx**: 
   - Load projection2d from API
   - Pass to visualization component

**Verification**: TypeScript compiles cleanly ✅

---

## 🎯 Next Steps (Recommended Priority)

1. **IMMEDIATE**: Debug why engagement scores still compressed (investigate regression model)
2. **IMMEDIATE**: Test with different datasets to understand generalization
3. **SHORT-TERM**: Add cluster quality warnings to dashboard
4. **SHORT-TERM**: Optimize API response size for projection data
5. **MEDIUM-TERM**: Improve categorical encoding with chi-square / mutual information
6. **LONG-TERM**: Add alternative clustering algorithms
7. **LONG-TERM**: Implement 3D visualization

---

## 📝 Code Organization

```
lib/
├── pipeline/
│   ├── orchestrator.ts      # Main pipeline coordinator
│   ├── stages.ts            # 8 pipeline stages (ingestion → strategy)
│   ├── ml.ts                # All ML algorithms (KMeans, PCA, etc)
│   ├── types.ts             # Type definitions
│   ├── artifact-contract.ts # Artifact interfaces
│   ├── validation.ts        # Input validation
│   ├── budget.ts            # Cost tracking
│   ├── segment-mapping.ts   # Training → Dashboard segment conversion
│   └── repository.ts        # Database/artifact storage
├── llm/
│   └── client.ts            # LLM API wrapper
└── dashboard/
    └── types.ts             # Frontend types

components/dashboard/
├── cluster-scatter-plot.tsx # 2D visualization component (NEW!)
├── segment-table.tsx
├── strategy-drawer.tsx
├── header.tsx
└── ...

app/
├── api/
│   └── pipeline/
│       ├── start            # POST /api/pipeline/start
│       └── runs/[runId]     # GET /api/pipeline/runs/{id}
└── dashboard/
    └── clusters/page.tsx    # Cluster visualization page
```

---

## 🧪 How to Test

1. **Start server**: `npm run dev`
2. **Upload test CSV**: Go to http://localhost:3000/dashboard
3. **Check results**: Wait ~3 seconds, redirected to clusters page
4. **View 2D scatter**: Should see PCA projection with colored clusters
5. **Inspect engagement**: Should see differentiated scores (if regression working)

**Test data available**: `online_retail.csv`, `SampleSuperstore` (already used)

---

## ❓ Questions for Discussion with Another LLM

1. Why are regression predictions producing such narrow ranges? Should we use RFM directly instead?
2. Is PCA the right visualization choice or should we use t-SNE/UMAP for better clustering visualization?
3. Should engagement be based on model predictions or derived directly from input features (RFM)?
4. Is the cardinality threshold strategy (>50 drop) universally applicable or dataset-specific?
5. How can we improve cluster quality for datasets with weak natural clusters?
6. Should we support hierarchical clustering to handle nested segments?
7. What alternative engagement metrics would be more meaningful than predicted values?
8. How to handle datasets where optimal cluster count is unclear?
9. Should users be able to adjust categorical encoding thresholds interactively?
10. Is there a better way to handle API response size with 10K+ point projections?
