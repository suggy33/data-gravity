"use client"

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

const clusterData = [
  // High-Value Loyalists (blue)
  { x: 85, y: 4200, cluster: 0 },
  { x: 90, y: 5100, cluster: 0 },
  { x: 88, y: 4800, cluster: 0 },
  { x: 92, y: 4600, cluster: 0 },
  { x: 87, y: 5200, cluster: 0 },
  // At-Risk Champions (red)
  { x: 45, y: 3800, cluster: 1 },
  { x: 40, y: 3200, cluster: 1 },
  { x: 48, y: 2900, cluster: 1 },
  { x: 42, y: 3500, cluster: 1 },
  { x: 38, y: 3100, cluster: 1 },
  // New Potential (green)
  { x: 70, y: 1400, cluster: 2 },
  { x: 75, y: 1100, cluster: 2 },
  { x: 68, y: 1200, cluster: 2 },
  { x: 72, y: 1350, cluster: 2 },
  { x: 78, y: 1050, cluster: 2 },
  // Casual Browsers (yellow)
  { x: 30, y: 500, cluster: 3 },
  { x: 25, y: 400, cluster: 3 },
  { x: 35, y: 450, cluster: 3 },
  { x: 28, y: 480, cluster: 3 },
  { x: 32, y: 420, cluster: 3 },
  // Dormant Users (purple)
  { x: 10, y: 300, cluster: 4 },
  { x: 15, y: 250, cluster: 4 },
  { x: 12, y: 280, cluster: 4 },
  { x: 8, y: 320, cluster: 4 },
  { x: 18, y: 240, cluster: 4 },
]

const clusterColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6"]

const clusterNames = [
  "High-Value Loyalists",
  "At-Risk Champions",
  "New Potential",
  "Casual Browsers",
  "Dormant Users",
]

export function ClusterScatterPlot() {
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
            label={{ value: "Engagement Score", position: "bottom", fill: "#a1a1aa", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="LTV"
            domain={[0, 6000]}
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            axisLine={{ stroke: "#262626" }}
            tickLine={{ stroke: "#262626" }}
            label={{ value: "LTV ($)", angle: -90, position: "insideLeft", fill: "#a1a1aa", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "#3b82f6" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-foreground">{clusterNames[data.cluster]}</p>
                    <p className="text-xs text-muted-foreground">Engagement: {data.x}%</p>
                    <p className="text-xs text-muted-foreground">LTV: ${data.y}</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Scatter data={clusterData} fill="#8884d8">
            {clusterData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={clusterColors[entry.cluster]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {clusterNames.map((name, index) => (
          <div key={name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: clusterColors[index] }}
            />
            <span className="text-xs text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
