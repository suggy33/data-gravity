import { z } from "zod"
import type {
  CleaningArtifact,
  InsightArtifact,
  MetadataArtifact,
} from "@/lib/pipeline/types"

export type GovernedArtifactStage = "metadata" | "cleaning" | "insights"

const columnStatsSchema = z.object({
  min: z.number(), max: z.number(), mean: z.number(), std: z.number(),
  q25: z.number(), q50: z.number(), q75: z.number(), skewness: z.number(), outlierRatio: z.number(),
}).optional()

const metadataArtifactV1Schema: z.ZodType<MetadataArtifact> = z
  .object({
    artifactVersion: z.literal("v1"),
    outputVersion: z.string().min(1),
    taskType: z.enum(["clustering", "classification", "regression", "forecasting", "unknown"]),
    confidence: z.enum(["high", "medium", "low"]),
    columnRoles: z.array(
      z.object({
        column: z.string().min(1),
        role: z.enum(["id", "target", "feature", "ignored"]),
        inferredType: z.enum(["numeric", "categorical", "boolean", "datetime", "text", "unknown"]),
        source: z.enum(["rule", "llm", "override"]),
      }),
    ),
    validation: z.object({
      isValid: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      issues: z.array(
        z.object({
          code: z.enum(["column_missing", "type_mismatch", "target_suspicious", "target_leakage", "id_override"]),
          column: z.string().optional(),
          severity: z.enum(["info", "warning", "error"]),
          message: z.string().min(1),
        }),
      ),
      reviewRequired: z.boolean(),
    }),
    schemaSummary: z.object({
      rowCountInSample: z.number().int().nonnegative(),
      columns: z.array(
        z.object({
          name: z.string().min(1),
          inferredType: z.enum(["numeric", "categorical", "boolean", "datetime", "text", "unknown"]),
          nullRatio: z.number().min(0).max(1),
          distinctCount: z.number().int().nonnegative(),
          sampleValues: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
          stats: columnStatsSchema,
        }),
      ),
    }),
  })
  .strict()

const cleaningArtifactV1Schema: z.ZodType<CleaningArtifact> = z
  .object({
    artifactVersion: z.literal("v1"),
    inputVersion: z.string().min(1),
    outputVersion: z.string().min(1),
    plan: z.object({
      artifactVersion: z.literal("v1"),
      decisions: z.array(
        z.object({
          column: z.string().min(1),
          action: z.enum(["impute_median", "impute_mode", "encode_onehot", "scale_standard", "clip_outliers"]),
          reasoning: z.string().min(1),
        }),
      ),
    }),
    transformations: z.array(
      z.object({
        column: z.string().min(1),
        action: z.enum(["impute_median", "impute_mode", "encode_onehot", "scale_standard", "clip_outliers"]),
        beforeNullRatio: z.number().min(0).max(1),
        afterNullRatio: z.number().min(0).max(1),
      }),
    ),
    statsBefore: z.object({
      rowCountInSample: z.number().int().nonnegative(),
      columnCount: z.number().int().nonnegative(),
      highNullColumnCount: z.number().int().nonnegative(),
    }),
    statsAfter: z.object({
      rowCountInSample: z.number().int().nonnegative(),
      columnCount: z.number().int().nonnegative(),
      highNullColumnCount: z.number().int().nonnegative(),
    }),
    cleanedSampleWindow: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  })
  .strict()

const insightsArtifactV1Schema: z.ZodType<InsightArtifact> = z
  .object({
    artifactVersion: z.literal("v1"),
    inputVersion: z.string().min(1),
    outputVersion: z.string().min(1),
    narrative: z
      .object({
        summary: z.string().min(1),
        risks: z.array(z.string()),
        opportunities: z.array(z.string()),
      })
      .strict(),
  })
  .strict()

const parseByStage = (stage: GovernedArtifactStage, version: string, data: unknown) => {
  if (version !== "v1") throw new Error(`Unsupported artifact version ${version} for stage ${stage}`)
  if (stage === "metadata") return metadataArtifactV1Schema.parse(data)
  if (stage === "insights") return insightsArtifactV1Schema.parse(data)
  if (stage === "cleaning") return cleaningArtifactV1Schema.parse(data)
  throw new Error(`Unsupported governed artifact stage: ${stage}`)
}

export const validateArtifact = (stage: GovernedArtifactStage, version: string, data: unknown) => {
  try {
    return parseByStage(stage, version, data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown artifact contract error"
    throw new Error(`Artifact validation failed for ${stage}@${version}: ${message}`)
  }
}
