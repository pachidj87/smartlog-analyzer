import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { GeminiAnalysisProvider } from '../../src/api/src/modules/analyses/providers/gemini-analysis.provider';
import { LogEntity } from '../../src/api/src/modules/logs/entities/log.entity';

describe('GeminiAnalysisProvider', () => {
  const analysisResult = {
    summary: 'Repeated payment timeouts',
    insights: [
      {
        title: 'Timeout pattern',
        description: 'Payment requests time out repeatedly.',
        severity: 'high',
      },
    ],
  };
  let http: {
    axiosRef: {
      post: jest.Mock;
      get: jest.Mock;
    };
  };
  let config: { get: jest.Mock };
  let provider: GeminiAnalysisProvider;

  beforeEach(() => {
    http = {
      axiosRef: {
        post: jest.fn(),
        get: jest.fn(),
      },
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AI_PROVIDER_GEMINI_URL: 'https://gemini.example/generateContent',
          AI_PROVIDER_GEMINI_HEALTH_URL: 'https://gemini.example/models',
          AI_PROVIDER_GEMINI_API_KEY: 'test-key',
        };
        return values[key];
      }),
    };
    provider = new GeminiAnalysisProvider(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('sends logs to Gemini and validates its JSON result', async () => {
    const log = Object.assign(new LogEntity(), {
      service: 'payment-api',
      timestamp: new Date('2026-11-02T14:00:00.000Z'),
      level: 'error',
      message: 'Request timed out',
    });
    http.axiosRef.post.mockResolvedValue({
      data: {
        candidates: [
          { content: { parts: [{ text: JSON.stringify(analysisResult) }] } },
        ],
      },
    });

    await expect(
      provider.analyze([log]),
    ).resolves.toEqual(analysisResult);

    expect(http.axiosRef.post).toHaveBeenCalledWith(
      'https://gemini.example/generateContent',
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: [
              expect.objectContaining({
                text: expect.stringContaining('Request timed out'),
              }),
            ],
          }),
        ]),
        generationConfig: { responseMimeType: 'application/json' },
      }),
      expect.objectContaining({
        headers: { 'x-goog-api-key': 'test-key' },
      }),
    );
  });

  it('rejects a response that does not match the analysis contract', async () => {
    http.axiosRef.post.mockResolvedValue({
      data: {
        candidates: [{ content: { parts: [{ text: '{"summary":"missing insights"}' }] } }],
      },
    });

    await expect(provider.analyze([])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('uses the Gemini models endpoint for the health check', async () => {
    http.axiosRef.get.mockResolvedValue({ status: 200 });

    await expect(provider.checkHealth()).resolves.toBeUndefined();
    expect(http.axiosRef.get).toHaveBeenCalledWith(
      'https://gemini.example/models',
      expect.objectContaining({
        headers: { 'x-goog-api-key': 'test-key' },
      }),
    );
  });

  it('rejects a non-JSON completion with 503', async () => {
    http.axiosRef.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] },
    });

    await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a JSON payload that misses the contract', async () => {
    http.axiosRef.post.mockResolvedValue({
      data: {
        candidates: [{ content: { parts: [{ text: '{"summary":"x"}' }] } }],
      },
    });

    await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
  });

  it('propagates a timeout as a failed call', async () => {
    http.axiosRef.post.mockRejectedValue(
      Object.assign(new Error('timeout of 15000ms exceeded'), {
        code: 'ECONNABORTED',
      }),
    );

    await expect(provider.analyze([])).rejects.toThrow(/timeout/i);
  });

});
