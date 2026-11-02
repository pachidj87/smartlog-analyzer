import { AnalysisInsight } from "../contracts";

export function isInsight(value: unknown): value is AnalysisInsight {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const insight = value as Record<string, unknown>;
  return (
    typeof insight['title'] === 'string' &&
    typeof insight['description'] === 'string' &&
    (insight['severity'] === undefined ||
      typeof insight['severity'] === 'string')
  );
}