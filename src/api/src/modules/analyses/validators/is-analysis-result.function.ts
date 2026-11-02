import { AnalysisResult } from "../contracts";
import { isInsight } from "./is-insight.function";

export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  return (
    typeof result['summary'] === 'string' &&
    Array.isArray(result['insights']) &&
    result['insights'].every(isInsight)
  );
}