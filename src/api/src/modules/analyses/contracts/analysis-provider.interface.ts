import { LogEntry } from "src/common/contracts";
import { AnalysisResult } from "./analysis-result.interface";

export interface AnalysisProvider {
  readonly name: string;
  analyze(logs: LogEntry[]): Promise<AnalysisResult>;
  checkHealth(): Promise<void>;
}