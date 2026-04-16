import type {
  ColumnProfileArtifact,
  ColumnRoleAssignment,
  MetadataArtifact,
  MetadataConfidence,
  MetadataValidationIssue,
  MetadataValidationResult,
  TaskType,
} from "@/lib/pipeline/types"

const HIGH_UNIQUE_RATIO = 0.98
const TARGET_UNIQUE_RATIO = 0.9
const TARGET_NULL_RATIO = 0.5

type MetadataCandidate = {
  taskType: TaskType
  confidence: MetadataConfidence
  columnRoles: ColumnRoleAssignment[]
}

const copyRoles = (roles: ColumnRoleAssignment[]) => roles.map((role) => ({ ...role }))

const looksLikeTargetColumn = (columnName: string) => {
  const normalized = columnName.toLowerCase()
  return ["target", "label", "class", "outcome", "churn", "converted", "response", "outbound"].some((token) =>
    normalized.includes(token),
  )
}

export const deriveMetadataCandidate = (schemaSummary: ColumnProfileArtifact): MetadataCandidate => {
  const numericColumns = schemaSummary.columns.filter((column) => column.inferredType === "numeric")
  const categoricalColumns = schemaSummary.columns.filter((column) => column.inferredType === "categorical")
  const hasExplicitTarget = schemaSummary.columns.some((column) => looksLikeTargetColumn(column.name))

  const columnRoles: ColumnRoleAssignment[] = schemaSummary.columns.map((column) => {
    const uniqueRatio = column.distinctCount / Math.max(1, schemaSummary.rowCountInSample)
    if (uniqueRatio > HIGH_UNIQUE_RATIO) {
      return { column: column.name, role: "id", inferredType: column.inferredType, source: "rule" }
    }

    return {
      column: column.name,
      role: "feature",
      inferredType: column.inferredType,
      source: "rule",
    }
  })

  return {
    taskType: "clustering",
    confidence: numericColumns.length >= 2 ? "high" : numericColumns.length === 1 ? "medium" : "low",
    columnRoles,
  }
}

export const validateMetadataArtifact = (
  artifact: MetadataArtifact,
  schemaSummary: ColumnProfileArtifact,
): MetadataValidationResult => {
  const issues: MetadataValidationIssue[] = []
  const actualColumns = new Set(schemaSummary.columns.map((column) => column.name))
  const rolesByColumn = new Map(artifact.columnRoles.map((role) => [role.column, role]))

  for (const role of artifact.columnRoles) {
    if (!actualColumns.has(role.column)) {
      issues.push({
        code: "column_missing",
        severity: "error",
        column: role.column,
        message: `Column ${role.column} does not exist in the uploaded schema.`,
      })
    }
  }

  for (const column of schemaSummary.columns) {
    const role = rolesByColumn.get(column.name)
    if (!role) continue

    const uniqueRatio = column.distinctCount / Math.max(1, schemaSummary.rowCountInSample)
    if (role.role === "target" && (uniqueRatio > TARGET_UNIQUE_RATIO || column.nullRatio > TARGET_NULL_RATIO)) {
      issues.push({
        code: "target_suspicious",
        severity: "error",
        column: column.name,
        message: `Target column ${column.name} looks like an ID or is too sparse.`,
      })
    }

    if (role.role === "id" && uniqueRatio > HIGH_UNIQUE_RATIO) {
      issues.push({
        code: "id_override",
        severity: "info",
        column: column.name,
        message: `Column ${column.name} was forced to id because it is effectively unique.`,
      })
    }

    if (role.inferredType === "numeric" && column.inferredType === "text" && column.distinctCount < 10) {
      issues.push({
        code: "type_mismatch",
        severity: "warning",
        column: column.name,
        message: `Column ${column.name} was marked numeric but appears object-like with low cardinality.`,
      })
    }
  }

  const targetColumns = artifact.columnRoles.filter((role) => role.role === "target")
  for (const target of targetColumns) {
    const normalizedTarget = target.column.toLowerCase()
    const leakingColumn = schemaSummary.columns.find((column) => {
      if (column.name === target.column) return false
      return column.name.toLowerCase().includes(normalizedTarget)
    })

    if (leakingColumn) {
      issues.push({
        code: "target_leakage",
        severity: "warning",
        column: target.column,
        message: `Target column ${target.column} may leak through ${leakingColumn.name}.`,
      })
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length
  const warningCount = issues.filter((issue) => issue.severity === "warning").length
  const confidence =
    errorCount > 0 ? "low" : warningCount > 1 ? "low" : warningCount === 1 ? "medium" : artifact.confidence

  return {
    isValid: errorCount === 0,
    confidence,
    issues,
    reviewRequired: confidence === "low",
  }
}

export const createValidatedMetadataArtifact = (
  schemaSummary: ColumnProfileArtifact,
): MetadataArtifact => {
  const candidate = deriveMetadataCandidate(schemaSummary)
  const draft: MetadataArtifact = {
    artifactVersion: "v1",
    outputVersion: "",
    taskType: candidate.taskType,
    confidence: candidate.confidence,
    columnRoles: copyRoles(candidate.columnRoles),
    validation: {
      isValid: true,
      confidence: candidate.confidence,
      issues: [],
      reviewRequired: false,
    },
    schemaSummary,
  }

  const validation = validateMetadataArtifact(draft, schemaSummary)
  return {
    ...draft,
    confidence: validation.confidence,
    validation,
  }
}
