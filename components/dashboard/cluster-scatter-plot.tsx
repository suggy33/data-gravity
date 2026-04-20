"use client"

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts"

export type ScatterSegment = {
  segmentId: string
  name: string
  size: number
  engagementScore: number
  risk?: "low" | "medium" | "high"
  centroid2d?: { x: number; y: number }
}

export type ProjectionPoint = {
  x: number
  y: number
  label: number
  segmentId?: string
}

const riskColor = (risk?: string) =>
  risk === "high" ? "#ef4444" : risk === "low" ? "#22c55e" : "#3b82f6"

const palette = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"]

export function ClusterScatterPlot({ 
  segments, 
  projectionPoints 
}: { 
  segments?: ScatterSegment[]
  projectionPoints?: ProjectionPoint[] 
}) {
  // Use KNN-style 2D projection if available, otherwise fall back to engagement vs size
  const use2dProjection = projectionPoints && projectionPoints.length > 0

  if (!segments?.length) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
        No cluster data yet. Run a pipeline to populate the scatter plot.
      </div>
    )
  }

  if (use2dProjection && projectionPoints) {
    // 2D PCA projection view (KNN-style)
    const dataPoints = projectionPoints.map((p) => ({
      x: p.x,
      y: p.y,
      label: p.label,
      cluster: segments.find((s) => s.segmentId === `seg-${p.label + 1}`),
    }))

    const scatterData = dataPoints.map((p) => ({
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
      label: p.label,
      name: p.cluster?.name || `Cluster ${p.label + 1}`,
      segmentId: p.cluster?.segmentId,
      risk: p.cluster?.risk,
    }))

    return (
      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis
              type="number"
              dataKey="x"
              name="PC1 (Principal Component 1)"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={{ stroke: "#262626" }}
              tickLine={{ stroke: "#262626" }}
              label={{ value: "PC1", position: "bottom", fill: "#a1a1aa", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="PC2 (Principal Component 2)"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={{ stroke: "#262626" }}
              tickLine={{ stroke: "#262626" }}
              label={{
                value: "PC2",
                angle: -90,
                position: "insideLeft",
                fill: "#a1a1aa",
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "#3b82f6" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as (typeof scatterData)[number]
                  const segment = segments.find((s) => s.segmentId === d.segmentId)
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      <p className="text-xs text-muted-foreground">Size: {segment?.size || "?"} customers</p>
                      <p className="text-xs text-muted-foreground">
                        Engagement: {segment?.engagementScore || "?"}/100
                      </p>
                      {d.risk && (
                        <p className="text-xs text-muted-foreground">Priority: {d.risk}</p>
                      )}
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              verticalAlign="top"
              height={36}
              iconType="circle"
            />
            {Array.from({ length: segments.length }, (_, i) => (
              <Scatter
                key={`cluster-${i}`}
                name={`${segments[i].name} (${segments[i].size})`}
                data={scatterData.filter((d) => d.label === i)}
                fill={segments[i].risk ? riskColor(segments[i].risk) : palette[i % palette.length]}
                shape="circle"
              >
                {scatterData
                  .filter((d) => d.label === i)
                  .map((p, idx) => (
                    <Cell
                      key={`cell-${i}-${idx}`}
                      fill={segments[i].risk ? riskColor(segments[i].risk) : palette[i % palette.length]}
                      opacity={0.7}
                    />
                  ))}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>

        <div className="mt-4 text-xs text-muted-foreground text-center">
          <p>2D PCA projection showing cluster separation in feature space</p>
        </div>
      </div>
    )
  }

  // Fallback: Engagement vs Size (original behavior)
  const maxSize = Math.max(...segments.map((s) => s.size), 1)
  const points = segments.map((s, i) => ({
    x: s.engagementScore,
    y: s.size,
    z: 200 + Math.round((s.size / maxSize) * 400),
    name: s.name,
    segmentId: s.segmentId,
    idx: i,
    risk: s.risk,
  }))

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Engagement Score"
            domain={[0, 100]}
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            axisLine={{ stroke: "#262626" }}
            tickLine={{ stroke: "#262626" }}
            label={{
              value: "Engagement Score",
              position: "bottom",
              fill: "#a1a1aa",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Cluster Size"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            axisLine={{ stroke: "#262626" }}
            tickLine={{ stroke: "#262626" }}
            label={{
              value: "Cluster size",
              angle: -90,
              position: "insideLeft",
              fill: "#a1a1aa",
              fontSize: 12,
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "#3b82f6" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload as (typeof points)[number]
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">Engagement: {d.x}</p>
                    <p className="text-xs text-muted-foreground">Members: {d.y}</p>
                    {d.risk && (
                      <p className="text-xs text-muted-foreground">Priority: {d.risk}</p>
                    )}
                  </div>
                )
              }
              return null
            }}
          />
          <Scatter data={points} fill="#8884d8">
            {points.map((p) => (
              <Cell
                key={p.segmentId}
                fill={
                  p.risk
                    ? riskColor(p.risk)
                    : palette[p.idx % palette.length]
                }
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {segments.map((s, i) => (
          <div key={s.segmentId} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{
                backgroundColor: s.risk
                  ? riskColor(s.risk)
                  : palette[i % palette.length],
              }}
            />
            <span className="text-xs text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
