"use client"

import { Button } from "@/components/ui/button"
import { Cloud, RefreshCw } from "lucide-react"

export function DashboardHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background/50 px-6 backdrop-blur-sm">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Orbit View</h1>
        <p className="text-sm text-muted-foreground">Customer Intelligence Dashboard</p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="gap-2 border-border">
          <RefreshCw className="h-4 w-4" />
          Refresh Data
        </Button>
        <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" data-aws-modal-trigger>
          <Cloud className="h-4 w-4" />
          AWS Connection
        </Button>
      </div>
    </header>
  )
}
