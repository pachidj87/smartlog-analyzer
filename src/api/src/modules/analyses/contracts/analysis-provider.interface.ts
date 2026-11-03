import { LogEntryInterface } from "src/common/contracts";
import { AnalysisResultInterface } from "./analysis-result.interface";

export interface AnalysisProviderInterface {
  readonly name: string;
  analyze(
    logs: LogEntryInterface[],
    prompt?: string,
  ): Promise<AnalysisResultInterface>;
  checkHealth(): Promise<void>;
}