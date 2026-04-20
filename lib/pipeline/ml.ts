// Pure TypeScript ML algorithms — no external dependencies

type Vec = number[]

const euclidean = (a: Vec, b: Vec): number =>
  Math.sqrt(a.reduce((s, ai, i) => s + (ai - (b[i] ?? 0)) ** 2, 0))

// ─── PCA 2D Projection (for visualization) ────────────────────────────────────

export type PcaProjection = { x: number; y: number }[]

const transpose = (m: number[][]): number[][] => m[0].map((_, i) => m.map(r => r[i]))

// Fast approximate PCA: center → SVD via power iteration → project
export const pca2d = (data: Vec[]): PcaProjection => {
  if (data.length === 0) return []
  const n = data.length
  const d = data[0].length
  
  // Center data
  const mean = Array.from({ length: d }, (_, i) => data.reduce((s, row) => s + row[i], 0) / n)
  const centered = data.map(row => row.map((v, i) => v - mean[i]))
  
  // Approximate covariance eigenvalues via power iteration (2 components only)
  const u1 = Array(d).fill(0).map(() => Math.random() - 0.5)
  const u2 = Array(d).fill(0).map(() => Math.random() - 0.5)
  
  // Power iteration for first PC (5 iterations sufficient for visualization)
  let v1 = [...u1]
  for (let iter = 0; iter < 5; iter++) {
    let sum = Array(d).fill(0)
    for (const row of centered) {
      const dot = v1.reduce((s, vi, i) => s + vi * row[i], 0)
      for (let i = 0; i < d; i++) sum[i] += dot * row[i]
    }
    const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1
    v1 = sum.map(x => x / norm)
  }
  
  // Deflate and compute second PC
  const deflated = centered.map(row => {
    const dot = v1.reduce((s, vi, i) => s + vi * row[i], 0)
    return row.map((x, i) => x - dot * v1[i])
  })
  
  let v2 = [...u2]
  for (let iter = 0; iter < 5; iter++) {
    let sum = Array(d).fill(0)
    for (const row of deflated) {
      const dot = v2.reduce((s, vi, i) => s + vi * row[i], 0)
      for (let i = 0; i < d; i++) sum[i] += dot * row[i]
    }
    const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1
    v2 = sum.map(x => x / norm)
  }
  
  // Project to 2D
  return centered.map(row => ({
    x: v1.reduce((s, vi, i) => s + vi * row[i], 0),
    y: v2.reduce((s, vi, i) => s + vi * row[i], 0),
  }))
}

// ─── KMeans ──────────────────────────────────────────────────────────────────

export type KMeansResult = { labels: number[]; centroids: Vec[]; inertia: number }

const lcg = (seed: number) => {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

const kppInit = (data: Vec[], k: number, rand: () => number): Vec[] => {
  const cs: Vec[] = [[...data[Math.floor(rand() * data.length)]]]
  while (cs.length < k) {
    const d2 = data.map(p => { const m = Math.min(...cs.map(c => euclidean(p, c))); return m * m })
    const tot = d2.reduce((s, v) => s + v, 0)
    let r = rand() * tot; let chosen = data.length - 1
    for (let i = 0; i < d2.length; i++) { r -= d2[i]; if (r <= 0) { chosen = i; break } }
    cs.push([...data[chosen]])
  }
  return cs
}

const kmeansOnce = (data: Vec[], k: number, maxIter: number, seed: number): KMeansResult => {
  const rand = lcg(seed)
  const cs = kppInit(data, k, rand)
  const dims = data[0]?.length ?? 1
  const labels = new Array<number>(data.length).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < data.length; i++) {
      let best = 0; let bestD = Infinity
      for (let c = 0; c < k; c++) { const d = euclidean(data[i], cs[c]); if (d < bestD) { bestD = d; best = c } }
      if (best !== labels[i]) { labels[i] = best; changed = true }
    }
    if (!changed) break
    const sums = Array.from({ length: k }, () => new Array<number>(dims).fill(0))
    const counts = new Array<number>(k).fill(0)
    for (let i = 0; i < data.length; i++) {
      counts[labels[i]]++
      for (let d = 0; d < dims; d++) sums[labels[i]][d] += data[i][d]
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) { for (let d = 0; d < dims; d++) cs[c][d] = sums[c][d] / counts[c] }
      else { cs[c] = [...data[Math.floor(rand() * data.length)]] }
    }
  }

  return { labels, centroids: cs, inertia: data.reduce((s, p, i) => s + euclidean(p, cs[labels[i]]) ** 2, 0) }
}

export const runKMeans = (data: Vec[], k: number, nInit = 3, maxIter = 200): KMeansResult => {
  let best: KMeansResult | null = null
  for (let r = 0; r < nInit; r++) {
    const res = kmeansOnce(data, k, maxIter, 42 + r * 17)
    if (!best || res.inertia < best.inertia) best = res
  }
  return best!
}

// ─── DBSCAN ──────────────────────────────────────────────────────────────────

export type DbscanResult = { labels: number[]; clusterCount: number; noiseRatio: number }

const regionQuery = (data: Vec[], pointIdx: number, eps: number): number[] => {
  const neighbors: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (euclidean(data[pointIdx], data[i]) <= eps) neighbors.push(i)
  }
  return neighbors
}

export const runDbscan = (data: Vec[], eps = 0.8, minSamples = 5): DbscanResult => {
  const n = data.length
  const labels = new Array<number>(n).fill(-99) // unvisited
  let clusterId = 0

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -99) continue
    const neighbors = regionQuery(data, i, eps)
    if (neighbors.length < minSamples) {
      labels[i] = -1
      continue
    }

    labels[i] = clusterId
    const queue = [...neighbors]
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q]
      if (labels[j] === -1) labels[j] = clusterId
      if (labels[j] !== -99) continue
      labels[j] = clusterId
      const neighborsJ = regionQuery(data, j, eps)
      if (neighborsJ.length >= minSamples) {
        for (const k of neighborsJ) {
          if (!queue.includes(k)) queue.push(k)
        }
      }
    }

    clusterId += 1
  }

  const finalLabels = labels.map((x) => (x === -99 ? -1 : x))
  const noiseCount = finalLabels.filter((x) => x === -1).length
  return {
    labels: finalLabels,
    clusterCount: clusterId,
    noiseRatio: n === 0 ? 0 : noiseCount / n,
  }
}

// ─── Silhouette Score ─────────────────────────────────────────────────────────

export const silhouetteScore = (data: Vec[], labels: number[], maxSample = 300): number => {
  const step = Math.max(1, Math.floor(data.length / maxSample))
  const idx = Array.from({ length: Math.min(maxSample, data.length) }, (_, i) => Math.min(i * step, data.length - 1))
  const clusters = [...new Set(labels)]
  if (clusters.length < 2) return 0

  const scores = idx.map(i => {
    const myC = labels[i]
    const sameIdx = idx.filter(j => j !== i && labels[j] === myC)
    const a = sameIdx.length === 0 ? 0 : sameIdx.reduce((s, j) => s + euclidean(data[i], data[j]), 0) / sameIdx.length
    const b = Math.min(...clusters.filter(c => c !== myC).map(c => {
      const ci = idx.filter(j => labels[j] === c)
      return ci.length === 0 ? Infinity : ci.reduce((s, j) => s + euclidean(data[i], data[j]), 0) / ci.length
    }))
    const denom = Math.max(a, b)
    return denom === 0 ? 0 : (b - a) / denom
  })

  return scores.reduce((s, v) => s + v, 0) / scores.length
}

// ─── Cluster Feature Importance ───────────────────────────────────────────────

export const clusterFeatureImportance = (
  data: Vec[], labels: number[], featureNames: string[]
): Array<{ feature: string; importance: number }> => {
  const dims = data[0]?.length ?? 0
  const k = Math.max(...labels) + 1
  const n = data.length
  const gMean = Array.from({ length: dims }, (_, d) => data.reduce((s, p) => s + p[d], 0) / n)
  const counts = Array.from({ length: k }, (_, c) => labels.filter(l => l === c).length)
  const cMeans = Array.from({ length: k }, (_, c) => {
    const pts = data.filter((_, i) => labels[i] === c)
    return Array.from({ length: dims }, (_, d) => pts.length === 0 ? 0 : pts.reduce((s, p) => s + p[d], 0) / pts.length)
  })
  const inter = Array.from({ length: dims }, (_, d) =>
    cMeans.reduce((s, cm, c) => s + counts[c] * (cm[d] - gMean[d]) ** 2, 0) / n
  )
  const total = Array.from({ length: dims }, (_, d) =>
    data.reduce((s, p) => s + (p[d] - gMean[d]) ** 2, 0) / n
  )
  const ratios = Array.from({ length: dims }, (_, d) => total[d] === 0 ? 0 : inter[d] / total[d])
  const sum = ratios.reduce((s, r) => s + r, 0) || 1
  return featureNames
    .map((name, d) => ({ feature: name, importance: Number((ratios[d] / sum).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)
}

// ─── Decision Tree Classifier (CART / Gini) ──────────────────────────────────

type TNode = { featureIdx?: number; threshold?: number; left?: TNode; right?: TNode; prediction?: string | number }

const gini = (labels: string[]): number => {
  if (!labels.length) return 0
  const counts = new Map<string, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  let g = 1
  for (const c of counts.values()) g -= (c / labels.length) ** 2
  return g
}

const mode = (labels: string[]): string => {
  const counts = new Map<string, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
}

const buildCNode = (X: Vec[], y: string[], idx: number[], depth: number, maxD: number, imps: number[]): TNode => {
  const labels = idx.map(i => y[i])
  if (depth >= maxD || idx.length <= 2 || new Set(labels).size === 1) return { prediction: mode(labels) }
  const dims = X[0]?.length ?? 0
  let bestG = 1e-9; let bestF = -1; let bestT = 0

  for (let f = 0; f < dims; f++) {
    const vals = [...new Set(idx.map(i => X[i][f]))].sort((a, b) => a - b)
    for (let v = 0; v < vals.length - 1; v++) {
      const t = (vals[v] + vals[v + 1]) / 2
      const L = idx.filter(i => X[i][f] <= t), R = idx.filter(i => X[i][f] > t)
      if (!L.length || !R.length) continue
      const gain = gini(labels) - (L.length / idx.length) * gini(L.map(i => y[i])) - (R.length / idx.length) * gini(R.map(i => y[i]))
      if (gain > bestG) { bestG = gain; bestF = f; bestT = t }
    }
  }

  if (bestF < 0) return { prediction: mode(labels) }
  imps[bestF] = (imps[bestF] ?? 0) + bestG * idx.length
  return {
    featureIdx: bestF, threshold: bestT,
    left: buildCNode(X, y, idx.filter(i => X[i][bestF] <= bestT), depth + 1, maxD, imps),
    right: buildCNode(X, y, idx.filter(i => X[i][bestF] > bestT), depth + 1, maxD, imps),
  }
}

const predC = (node: TNode, x: Vec): string => {
  if (node.prediction !== undefined) return String(node.prediction)
  if (node.featureIdx === undefined || !node.left || !node.right) return ""
  return x[node.featureIdx] <= (node.threshold ?? 0) ? predC(node.left, x) : predC(node.right, x)
}

export type ClassifierResult = {
  classes: string[]
  accuracy: number
  f1Score: number
  confusionMatrix: number[][]
  featureImportances: Array<{ feature: string; importance: number }>
}

export const runDecisionTreeClassifier = (X: Vec[], y: string[], featureNames: string[], maxDepth = 6): ClassifierResult => {
  const classes = [...new Set(y)].sort()
  const split = Math.floor(X.length * 0.8)
  const [tX, tY, vX, vY] = [X.slice(0, split), y.slice(0, split), X.slice(split), y.slice(split)]
  const imps = new Array<number>(featureNames.length).fill(0)
  const tree = buildCNode(tX, tY, Array.from({ length: tX.length }, (_, i) => i), 0, maxDepth, imps)
  const preds = vX.map(x => predC(tree, x))
  const accuracy = vY.length === 0 ? 0 : preds.filter((p, i) => p === vY[i]).length / vY.length
  const f1Score = classes.length === 0 ? 0 : classes.reduce((s, cls) => {
    const tp = preds.filter((p, i) => p === cls && vY[i] === cls).length
    const fp = preds.filter((p, i) => p === cls && vY[i] !== cls).length
    const fn = preds.filter((p, i) => p !== cls && vY[i] === cls).length
    const pr = tp + fp === 0 ? 0 : tp / (tp + fp)
    const re = tp + fn === 0 ? 0 : tp / (tp + fn)
    return s + (pr + re === 0 ? 0 : 2 * pr * re / (pr + re))
  }, 0) / classes.length
  const confusionMatrix = classes.map(a => classes.map(p => vY.filter((t, i) => t === a && preds[i] === p).length))
  const tot = imps.reduce((s, v) => s + v, 0) || 1
  const featureImportances = featureNames
    .map((name, i) => ({ feature: name, importance: Number((imps[i] / tot).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)
  return { classes, accuracy, f1Score, confusionMatrix, featureImportances }
}

// ─── KNN Classifier ──────────────────────────────────────────────────────────

export const runKnnClassifier = (X: Vec[], y: string[], featureNames: string[], k = 7): ClassifierResult => {
  const classes = [...new Set(y)].sort()
  const split = Math.floor(X.length * 0.8)
  const [tX, tY, vX, vY] = [X.slice(0, split), y.slice(0, split), X.slice(split), y.slice(split)]

  const predictOne = (x: Vec): string => {
    const distances = tX.map((row, i) => ({ i, d: euclidean(row, x) })).sort((a, b) => a.d - b.d)
    const top = distances.slice(0, Math.max(1, Math.min(k, distances.length)))
    const votes = new Map<string, number>()
    for (const n of top) votes.set(tY[n.i], (votes.get(tY[n.i]) ?? 0) + 1)
    return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? classes[0] ?? ""
  }

  const preds = vX.map(predictOne)
  const accuracy = vY.length === 0 ? 0 : preds.filter((p, i) => p === vY[i]).length / vY.length
  const f1Score = classes.length === 0 ? 0 : classes.reduce((s, cls) => {
    const tp = preds.filter((p, i) => p === cls && vY[i] === cls).length
    const fp = preds.filter((p, i) => p === cls && vY[i] !== cls).length
    const fn = preds.filter((p, i) => p !== cls && vY[i] === cls).length
    const pr = tp + fp === 0 ? 0 : tp / (tp + fp)
    const re = tp + fn === 0 ? 0 : tp / (tp + fn)
    return s + (pr + re === 0 ? 0 : 2 * pr * re / (pr + re))
  }, 0) / classes.length

  const confusionMatrix = classes.map(a => classes.map(p => vY.filter((t, i) => t === a && preds[i] === p).length))

  // KNN has no global coefficients; proxy importance by feature variance in train set.
  const dims = featureNames.length
  const variances = Array.from({ length: dims }, (_, d) => {
    const mean = tX.reduce((s, r) => s + (r[d] ?? 0), 0) / Math.max(1, tX.length)
    return tX.reduce((s, r) => s + ((r[d] ?? 0) - mean) ** 2, 0) / Math.max(1, tX.length)
  })
  const total = variances.reduce((s, v) => s + v, 0) || 1
  const featureImportances = featureNames
    .map((name, i) => ({ feature: name, importance: Number((variances[i] / total).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)

  return { classes, accuracy, f1Score, confusionMatrix, featureImportances }
}

// ─── Linear Regression (OLS + Ridge fallback) ─────────────────────────────────

const matMul = (A: number[][], B: number[][]): number[][] =>
  A.map(row => Array.from({ length: B[0].length }, (_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))

const gaussJordan = (A: number[][]): number[][] | null => {
  const n = A.length
  const aug = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    const d = aug[col][col]
    if (Math.abs(d) < 1e-10) return null
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = aug[r][col]
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j]
    }
  }
  return aug.map(r => r.slice(n))
}

export type RegressorResult = {
  coefficients: Array<{ feature: string; coefficient: number }>
  intercept: number
  rmse: number
  mae: number
  r2: number
  featureImportances: Array<{ feature: string; importance: number }>
}

const fitOLS = (X: Vec[], y: number[], lambda = 0): number[] => {
  const Xb = X.map(row => [1, ...row])
  const Xt = transpose(Xb)
  const XtX = matMul(Xt, Xb)
  for (let i = 1; i < XtX.length; i++) XtX[i][i] += lambda
  const inv = gaussJordan(XtX)
  if (!inv) return new Array(Xb[0].length).fill(0)
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0))
  return inv.map(row => row.reduce((s, v, i) => s + v * Xty[i], 0))
}

const regressorMetrics = (preds: number[], actual: number[]) => {
  const residuals = actual.map((v, i) => v - preds[i])
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r ** 2, 0) / Math.max(1, actual.length))
  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / Math.max(1, actual.length)
  const yMean = actual.reduce((s, v) => s + v, 0) / Math.max(1, actual.length)
  const ssTot = actual.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = residuals.reduce((s, r) => s + r ** 2, 0)
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot)
  return { rmse, mae, r2 }
}

export const runLinearRegression = (X: Vec[], y: number[], featureNames: string[], ridgeLambda = 0): RegressorResult => {
  const split = Math.floor(X.length * 0.8)
  const [tX, tY, vX, vY] = [X.slice(0, split), y.slice(0, split), X.slice(split), y.slice(split)]
  let coeffs = fitOLS(tX, tY, ridgeLambda)
  if (coeffs.every(c => c === 0)) coeffs = fitOLS(tX, tY, 0.01)
  const intercept = coeffs[0]
  const fc = coeffs.slice(1)
  const preds = vX.map(x => intercept + fc.reduce((s, c, i) => s + c * x[i], 0))
  const { rmse, mae, r2 } = regressorMetrics(preds, vY)
  const absC = fc.map(c => Math.abs(c))
  const totC = absC.reduce((s, v) => s + v, 0) || 1
  const featureImportances = featureNames
    .map((name, i) => ({ feature: name, importance: Number((absC[i] / totC).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)
  return { coefficients: featureNames.map((name, i) => ({ feature: name, coefficient: Number(fc[i].toFixed(6)) })), intercept, rmse, mae, r2, featureImportances }
}

// ─── Decision Tree Regressor (CART / MSE) ────────────────────────────────────

const mseLoss = (vals: number[]): number => {
  if (!vals.length) return 0
  const m = vals.reduce((s, v) => s + v, 0) / vals.length
  return vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length
}

const buildRNode = (X: Vec[], y: number[], idx: number[], depth: number, maxD: number, imps: number[]): TNode => {
  const vals = idx.map(i => y[i])
  const pred = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length)
  if (depth >= maxD || idx.length <= 2) return { prediction: pred }
  const dims = X[0]?.length ?? 0
  let bestG = 1e-9; let bestF = -1; let bestT = 0

  for (let f = 0; f < dims; f++) {
    const uv = [...new Set(idx.map(i => X[i][f]))].sort((a, b) => a - b)
    for (let v = 0; v < uv.length - 1; v++) {
      const t = (uv[v] + uv[v + 1]) / 2
      const L = idx.filter(i => X[i][f] <= t), R = idx.filter(i => X[i][f] > t)
      if (!L.length || !R.length) continue
      const gain = mseLoss(vals) - (L.length / idx.length) * mseLoss(L.map(i => y[i])) - (R.length / idx.length) * mseLoss(R.map(i => y[i]))
      if (gain > bestG) { bestG = gain; bestF = f; bestT = t }
    }
  }

  if (bestF < 0) return { prediction: pred }
  imps[bestF] = (imps[bestF] ?? 0) + bestG * idx.length
  return {
    featureIdx: bestF, threshold: bestT,
    left: buildRNode(X, y, idx.filter(i => X[i][bestF] <= bestT), depth + 1, maxD, imps),
    right: buildRNode(X, y, idx.filter(i => X[i][bestF] > bestT), depth + 1, maxD, imps),
  }
}

const predR = (node: TNode, x: Vec): number => {
  if (!node.left || !node.right || node.featureIdx === undefined) return Number(node.prediction ?? 0)
  return x[node.featureIdx] <= (node.threshold ?? 0) ? predR(node.left, x) : predR(node.right, x)
}

export const runDecisionTreeRegressor = (X: Vec[], y: number[], featureNames: string[], maxDepth = 6): RegressorResult => {
  const split = Math.floor(X.length * 0.8)
  const [tX, tY, vX, vY] = [X.slice(0, split), y.slice(0, split), X.slice(split), y.slice(split)]
  const imps = new Array<number>(featureNames.length).fill(0)
  const tree = buildRNode(tX, tY, Array.from({ length: tX.length }, (_, i) => i), 0, maxDepth, imps)
  const preds = vX.map(x => predR(tree, x))
  const { rmse, mae, r2 } = regressorMetrics(preds, vY)
  const tot = imps.reduce((s, v) => s + v, 0) || 1
  const featureImportances = featureNames
    .map((name, i) => ({ feature: name, importance: Number((imps[i] / tot).toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)
  return { coefficients: featureImportances.map(f => ({ feature: f.feature, coefficient: f.importance })), intercept: 0, rmse, mae, r2, featureImportances }
}
