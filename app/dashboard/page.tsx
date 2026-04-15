"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { ClusterScatterPlot } from "@/components/dashboard/cluster-scatter-plot"
import { SegmentTable } from "@/components/dashboard/segment-table"
import { AwsConnectionModal } from "@/components/dashboard/aws-connection-modal"
import { StrategyDrawer } from "@/components/dashboard/strategy-drawer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type Segment = {
  id: string
  clusterName: string
  customerCount: number
  avgLtv: number
  churnRisk: "low" | "medium" | "high"
}

const mockSegments: Segment[] = [
  { id: "1", clusterName: "High-Value Loyalists", customerCount: 12450, avgLtv: 4850, churnRisk: "low" },
  { id: "2", clusterName: "At-Risk Champions", customerCount: 8320, avgLtv: 3200, churnRisk: "high" },
  { id: "3", clusterName: "New Potential", customerCount: 15680, avgLtv: 1200, churnRisk: "medium" },
  { id: "4", clusterName: "Casual Browsers", customerCount: 24100, avgLtv: 450, churnRisk: "medium" },
  { id: "5", clusterName: "Dormant Users", customerCount: 6780, avgLtv: 280, churnRisk: "high" },
]

export default function DashboardPage() {
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleOpenStrategy = (segment: Segment) => {
    setSelectedSegment(segment)
    setDrawerOpen(true)
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Stats overview */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Total Customers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">67,330</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Active Segments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">5</div>
              <p className="text-xs text-muted-foreground">K-Means clusters</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">Avg. LTV</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">$1,996</div>
              <p className="text-xs text-muted-foreground">Across all segments</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground">High Churn Risk</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">15,100</div>
              <p className="text-xs text-muted-foreground">Customers at risk</p>
            </CardContent>
          </Card>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Cluster Distribution</CardTitle>
              <CardDescription className="text-muted-foreground">
                K-Means visualization of customer segments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClusterScatterPlot />
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Segment Overview</CardTitle>
              <CardDescription className="text-muted-foreground">
                Customer clusters with key metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SegmentTable segments={mockSegments} onOpenStrategy={handleOpenStrategy} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AwsConnectionModal />
      <StrategyDrawer 
        open={drawerOpen} 
        onOpenChange={setDrawerOpen} 
        segment={selectedSegment} 
      />
    </div>
  )
}
