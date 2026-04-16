export type Segment = {
  id: string
  clusterName: string
  customerCount: number
  avgLtv: number
  churnRisk: "low" | "medium" | "high"
}
