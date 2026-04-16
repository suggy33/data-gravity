"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Sparkles } from "lucide-react"
import type { Segment } from "@/lib/dashboard/types"

interface SegmentTableProps {
  segments: Segment[]
  onOpenStrategy: (segment: Segment) => void
}

const riskColors = {
  low: "bg-green-500/10 text-green-500 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-red-500/10 text-red-500 border-red-500/20",
}

export function SegmentTable({ segments, onOpenStrategy }: SegmentTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Cluster Name</TableHead>
            <TableHead className="text-right text-muted-foreground">Customers</TableHead>
            <TableHead className="text-right text-muted-foreground">Avg. LTV</TableHead>
            <TableHead className="text-center text-muted-foreground">Churn Risk</TableHead>
            <TableHead className="text-center text-muted-foreground">Strategy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {segments.map((segment) => (
            <TableRow key={segment.id} className="border-border">
              <TableCell className="font-medium text-foreground">
                {segment.clusterName}
              </TableCell>
              <TableCell className="text-right text-foreground">
                {segment.customerCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-foreground">
                ${segment.avgLtv.toLocaleString()}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className={riskColors[segment.churnRisk]}>
                  {segment.churnRisk}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenStrategy(segment)}
                  className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="sr-only">Generate Strategy</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
