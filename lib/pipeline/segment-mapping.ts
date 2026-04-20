import type { Segment } from "@/lib/dashboard/types"
import type { TrainingArtifact } from "@/lib/pipeline/types"

export const mapTrainingToSegments = (training: TrainingArtifact): Segment[] => {
  return training.segments.map((segment) => {
    const avgLtv = segment.monetaryValue !== undefined 
      ? Math.round(segment.monetaryValue)
      : Math.round(segment.averageScore * 2.5)
    
    return {
      id: segment.segmentId,
      clusterName: segment.name,
      customerCount: segment.size,
      avgLtv: Math.max(50, avgLtv),
      churnRisk: segment.risk,
    }
  })
}