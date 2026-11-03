import { AnalysisInsightInterface } from "./analysis-insight.interface";

export interface AnalysisResultInterface {
  summary: string;
  insights: AnalysisInsightInterface[];
}