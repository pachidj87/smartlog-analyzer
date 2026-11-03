import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { AnthropicAnalysisProvider } from '../../src/api/src/modules/analyses/providers/anthropic-analysis.provider';

describe('AnthropicAnalysisProvider', () => {
  const result = {
    summary: 'Repeated timeouts',
    insights: [{ title: 'Timeouts', description: 'Requests time out.' }],
  };
  let post: jest.Mock;
  let get: jest.Mock;
  let provider: AnthropicAnalysisProvider;

  beforeEach(() => {
    post = jest.fn();
    get = jest.fn();
    const http = { axiosRef: { post, get } };
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          AI_PROVIDER_ANTHROPIC_URL: 'https://api.anthropic.com/v1/messages',
          AI_PROVIDER_ANTHROPIC_HEALTH_URL: 'https://api.anthropic.com/v1/models',
          AI_PROVIDER_ANTHROPIC_API_KEY: 'test-key',
          AI_PROVIDER_ANTHROPIC_MODEL: 'test-model',
        };
        return values[key] ?? defaultValue;
      }),
    };
    provider = new AnthropicAnalysisProvider(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('uses the Messages API and parses the analysis result', async () => {
    post.mockResolvedValue({
      data: { content: [{ type: 'text', text: JSON.stringify(result) }] },
    });

    await expect(provider.analyze([])).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        model: 'test-model',
        max_tokens: 2048,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': expect.any(String),
        }),
      }),
    );
  });

  it('checks Anthropic availability through its models endpoint', async () => {
    get.mockResolvedValue({ status: 200 });

    await expect(provider.checkHealth()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.any(Object),
    );
  });

  it('rejects a non-JSON completion with 503', async () => {
    post.mockResolvedValue({
      data: { content: [{ type: 'text', text: 'not json' }] },
    });

    await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a JSON payload that misses the contract', async () => {
    post.mockResolvedValue({
      data: { content: [{ type: 'text', text: '{"summary":"x"}' }] },
    });

    await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
  });

  it('propagates a timeout as a failed call', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('timeout of 15000ms exceeded'), {
        code: 'ECONNABORTED',
      }),
    );

    await expect(provider.analyze([])).rejects.toThrow(/timeout/i);
  });

});
