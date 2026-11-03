import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import {
  AnalysisProviderRegistry,
} from '../../src/api/src/modules/analyses/providers/analysis-provider.registry';
import { AnalysisProviderInterface } from '../../src/api/src/modules/analyses/contracts/analysis-provider.interface';
import { ANALYSIS_PROVIDERS } from '../../src/api/src/modules/analyses/symbols/analisys-provider.symbol';

describe('AnalysisProviderRegistry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the configured fallback when the active provider fails', async () => {
    const result = { summary: 'Recovered by fallback', insights: [] };
    const active: AnalysisProviderInterface = {
      name: 'primary',
      analyze: jest.fn().mockRejectedValue(new Error('primary unavailable')),
      checkHealth: jest.fn(),
    };
    const fallback: AnalysisProviderInterface = {
      name: 'backup',
      analyze: jest.fn().mockResolvedValue(result),
      checkHealth: jest.fn(),
    };
    const config = {
      get: (name: string) =>
        name === 'AI_PROVIDER' ? 'primary' : 'backup',
    };
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisProviderRegistry,
        { provide: ConfigService, useValue: config },
        { provide: ANALYSIS_PROVIDERS, useValue: [active, fallback] },
      ],
    }).compile();

    const registry = moduleRef.get(AnalysisProviderRegistry);
    await expect(registry.analyze([])).resolves.toEqual({
      result,
      provider: 'backup',
    });
    expect(active.analyze).toHaveBeenCalledTimes(1);
    expect(fallback.analyze).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();

    await moduleRef.close();
  });

  it('logs both provider failures and returns service unavailable when all fail', async () => {
    const active: AnalysisProviderInterface = {
      name: 'primary',
      analyze: jest.fn().mockRejectedValue(new Error('primary failed')),
      checkHealth: jest.fn(),
    };
    const fallback: AnalysisProviderInterface = {
      name: 'backup',
      analyze: jest.fn().mockRejectedValue(new Error('backup failed')),
      checkHealth: jest.fn(),
    };
    const config = {
      get: (name: string) =>
        name === 'AI_PROVIDER' ? 'primary' : 'backup',
    };
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisProviderRegistry,
        { provide: ConfigService, useValue: config },
        { provide: ANALYSIS_PROVIDERS, useValue: [active, fallback] },
      ],
    }).compile();

    const registry = moduleRef.get(AnalysisProviderRegistry);
    await expect(registry.analyze([])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(error).toHaveBeenCalledWith(
      'All configured AI providers failed: primary, backup',
    );
    expect(active.analyze).toHaveBeenCalledTimes(1);
    expect(fallback.analyze).toHaveBeenCalledTimes(1);

    await moduleRef.close();
  });
});
