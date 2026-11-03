import {
  buildDemoAnalyses,
  buildDemoLogs,
} from '../../src/api/src/db/seeds/demo-data';
import { AnalysisStatus } from '../../src/api/src/modules/analyses/enums/analysis-status.enum';

describe('demo dataset', () => {
  const now = new Date('2026-11-03T12:00:00.000Z');

  it('builds 40 logs across four services and several levels within the last week', () => {
    const logs = buildDemoLogs(now);

    expect(logs).toHaveLength(40);
    expect(new Set(logs.map((log) => log.service)).size).toBe(4);
    expect(new Set(logs.map((log) => log.level)).size).toBeGreaterThanOrEqual(3);

    const earliest = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    for (const log of logs) {
      const timestamp = new Date(log.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(earliest);
      expect(timestamp).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('builds a completed and a failed analysis for the first logs', () => {
    const logIds = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
    const analyses = buildDemoAnalyses(logIds, now);

    expect(analyses).toHaveLength(2);
    expect(analyses.map((analysis) => analysis.status)).toEqual([
      AnalysisStatus.Completed,
      AnalysisStatus.Failed,
    ]);
    expect(analyses[0].result?.summary).toEqual(expect.any(String));
    expect(analyses[0].provider).toEqual(expect.any(String));
    expect(analyses[1].error).toEqual(expect.any(String));
    for (const analysis of analyses) {
      expect(analysis.logIds).toEqual(logIds);
    }
  });
});
