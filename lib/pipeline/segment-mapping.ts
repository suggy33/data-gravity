import type { Segment } from "@/lib/dashboard/types"
import type { TrainingArtifact } from "@/lib/pipeline/types"

export const mapTrainingToSegments = (training: TrainingArtifact): Segment[] => {
  return training.segments.map((segment) => ({
    id: segment.segmentId,
    clusterName: segment.name,
    customerCount: segment.size,
    avgLtv: Math.max(120, Math.round(segment.averageScore * 48)),
    churnRisk: segment.risk,
  }))
}