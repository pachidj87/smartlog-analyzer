import { Db } from "mongodb";

import { ANALYSIS_INDEXES_MIGRATION } from "../../src/api/src/db/migrations/002-analysis-indexes";
import { LOG_INDEXES_MIGRATION } from "../../src/api/src/db/migrations/001-log-indexes";

describe("MongoDB index migrations", () => {
  function createDatabaseMock() {
    const createIndex = jest.fn().mockResolvedValue("index");
    const dropIndex = jest.fn().mockResolvedValue({});
    const collection = jest.fn().mockReturnValue({ createIndex, dropIndex });
    const database = { collection } as unknown as Db;

    return { database, collection, createIndex, dropIndex };
  }

  it("creates and rolls back only the log indexes", async () => {
    const mock = createDatabaseMock();

    await LOG_INDEXES_MIGRATION.up(mock.database);
    expect(mock.collection).toHaveBeenCalledWith("logs");
    expect(mock.createIndex).toHaveBeenCalledTimes(3);

    await LOG_INDEXES_MIGRATION.down(mock.database);
    expect(mock.dropIndex.mock.calls.map(([name]) => name)).toEqual([
      "level_1_timestamp_-1",
      "service_1_timestamp_-1",
      "timestamp_-1",
    ]);
  });

  it("creates and rolls back only the analysis indexes", async () => {
    const mock = createDatabaseMock();

    await ANALYSIS_INDEXES_MIGRATION.up(mock.database);
    expect(mock.collection).toHaveBeenCalledWith("analyses");
    expect(mock.createIndex).toHaveBeenCalledTimes(2);

    await ANALYSIS_INDEXES_MIGRATION.down(mock.database);
    expect(mock.dropIndex.mock.calls.map(([name]) => name)).toEqual([
      "createdAt_-1",
      "status_1_createdAt_-1",
    ]);
  });
});
