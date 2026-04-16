"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      
      {/* Animated grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>AWS Native CRM Intelligence</span>
        </div>

        <h1 className="mb-6 text-balance text-5xl font-bold leading-tight tracking-tight text-foreground md:text-6xl lg:text-7xl">
          Intelligence moves toward{" "}
          <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            your data.
          </span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
          The first Zero-Copy CRM intelligence engine built for the AWS ecosystem.
          Transform raw customer data into actionable segments without moving a single byte.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/dashboard">
            <Button size="lg" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#connectivity">
            <Button size="lg" variant="outline" className="border-border">
              View Integrations
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-1 gap-8 border-t border-border pt-12 sm:grid-cols-3">
          <div>
            <div className="text-3xl font-bold text-foreground">Zero-Copy</div>
            <div className="mt-1 text-sm text-muted-foreground">Data Processing</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-foreground">{"<"}100ms</div>
            <div className="mt-1 text-sm text-muted-foreground">Query Latency</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-foreground">Native AWS</div>
            <div className="mt-1 text-sm text-muted-foreground">Integration</div>
          </div>
        </div>
      </div>
    </section>
  )
}
