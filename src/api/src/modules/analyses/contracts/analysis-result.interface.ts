import { AnalysisInsight } from "./analysis-insight.interface";

export interface AnalysisResult {
  summary: string;
  insights: AnalysisInsight[];
}