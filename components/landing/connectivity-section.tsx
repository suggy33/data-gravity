"use client"

import { Orbit } from "lucide-react"

const awsServices = [
  { name: "Amazon S3", description: "Object Storage", angle: 0 },
  { name: "Redshift", description: "Data Warehouse", angle: 120 },
  { name: "SageMaker", description: "Machine Learning", angle: 240 },
]

export function ConnectivitySection() {
  return (
    <section id="connectivity" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Native AWS Connectivity
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Data Gravity integrates seamlessly with your existing AWS infrastructure.
            No data movement, no latency, just intelligence.
          </p>
        </div>

        {/* Orbital visualization */}
        <div className="relative mx-auto aspect-square max-w-lg">
          {/* Orbit rings */}
          <div className="absolute inset-0 rounded-full border border-border" />
          <div className="absolute inset-[15%] rounded-full border border-border" />
          <div className="absolute inset-[30%] rounded-full border border-border" />

          {/* Center core */}
          <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background shadow-[0_0_60px_rgba(59,130,246,0.3)]">
            <div className="text-center">
              <Orbit className="mx-auto h-8 w-8 text-primary" />
              <span className="mt-1 block text-xs font-medium text-foreground">Data Gravity</span>
            </div>
          </div>

          {/* Orbiting services */}
          {awsServices.map((service, index) => {
            const angle = (service.angle * Math.PI) / 180
            const radius = 42 // percentage from center
            const x = 50 + radius * Math.cos(angle - Math.PI / 2)
            const y = 50 + radius * Math.sin(angle - Math.PI / 2)

            return (
              <div
                key={service.name}
                className="absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 animate-pulse items-center justify-center rounded-xl border border-border bg-card/80 backdrop-blur-sm"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  animationDelay: `${index * 0.5}s`,
                }}
              >
                <div className="text-center">
                  <div className="text-xs font-semibold text-foreground">{service.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{service.description}</div>
                </div>
              </div>
            )
          })}

          {/* Connection lines */}
          <svg className="absolute inset-0 h-full w-full" style={{ transform: "rotate(-90deg)" }}>
            {awsServices.map((service) => {
              const angle = (service.angle * Math.PI) / 180
              const innerRadius = 12
              const outerRadius = 38
              const x1 = 50 + innerRadius * Math.cos(angle)
              const y1 = 50 + innerRadius * Math.sin(angle)
              const x2 = 50 + outerRadius * Math.cos(angle)
              const y2 = 50 + outerRadius * Math.sin(angle)

              return (
                <line
                  key={service.name}
                  x1={`${x1}%`}
                  y1={`${y1}%`}
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  className="opacity-50"
                />
              )
            })}
          </svg>
        </div>

        {/* Service cards */}
        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 font-semibold text-foreground">Amazon S3</h3>
            <p className="text-sm text-muted-foreground">
              Direct access to your data lakes. Query petabytes without movement.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 font-semibold text-foreground">Amazon Redshift</h3>
            <p className="text-sm text-muted-foreground">
              Real-time warehouse integration. Federated queries across clusters.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
            <h3 className="mb-2 font-semibold text-foreground">Amazon SageMaker</h3>
            <p className="text-sm text-muted-foreground">
              Deploy custom ML models. Integrate predictions into segments.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
