"use client"

import { Layers, Zap, Shield, BarChart3 } from "lucide-react"

const features = [
  {
    icon: Layers,
    title: "K-Means Clustering",
    description: "Automatically segment customers using advanced machine learning algorithms that run directly on your data.",
  },
  {
    icon: Zap,
    title: "Real-time Insights",
    description: "Get instant visibility into customer behavior patterns and segment performance metrics.",
  },
  {
    icon: Shield,
    title: "Zero-Copy Architecture",
    description: "Your data never leaves your AWS environment. Process in place with enterprise-grade security.",
  },
  {
    icon: BarChart3,
    title: "Actionable Strategies",
    description: "AI-generated campaign recommendations tailored to each customer segment.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="border-t border-border py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Built for Enterprise Scale
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Data Gravity combines the power of AI with native AWS integration to deliver
            customer intelligence at unprecedented scale.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card/50 p-8 backdrop-blur-sm transition-colors hover:border-primary/50"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
