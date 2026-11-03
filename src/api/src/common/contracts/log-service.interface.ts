import { LogEntryInterface } from "src/common/contracts";

export interface LogsServiceInterface {
  findByIds(ids: string[]): Promise<LogEntryInterface[]>;
}