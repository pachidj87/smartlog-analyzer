import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { OpenAiAnalysisProvider } from '../../src/api/src/modules/analyses/providers/openai-analysis.provider';

describe('OpenAiAnalysisProvider', () => {
  const result = {
    summary: 'Repeated timeouts',
    insights: [{ title: 'Timeouts', description: 'Requests time out.' }],
  };
  let post: jest.Mock;
  let get: jest.Mock;
  let provider: OpenAiAnalysisProvider;

  beforeEach(() => {
    post = jest.fn();
    get = jest.fn();
    const http = { axiosRef: { post, get } };
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          AI_PROVIDER_OPENAI_URL: 'https://api.openai.com/v1/chat/completions',
          AI_PROVIDER_OPENAI_HEALTH_URL: 'https://api.openai.com/v1/models',
          AI_PROVIDER_OPENAI_API_KEY: 'test-key',
          AI_PROVIDER_OPENAI_MODEL: 'test-model',
        };
        return values[key] ?? defaultValue;
      }),
    };
    provider = new OpenAiAnalysisProvider(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('uses the Chat Completions API and parses the analysis result', async () => {
    post.mockResolvedValue({
      data: {
        choices: [{ message: { content: JSON.stringify(result) } }],
      },
    });

    await expect(provider.analyze([])).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        model: 'test-model',
        response_format: { type: 'json_object' },
      }),
      expect.objectContaining({
        headers: { Authorization: expect.stringMatching(/^Bearer /) },
      }),
    );
  });

  it('includes the user prompt in the provider request', async () => {
    post.mockResolvedValue({
      data: {
        choices: [{ message: { content: JSON.stringify(result) } }],
      },
    });

    await provider.analyze([], 'Find deployment-related errors');

    expect(post.mock.calls[0][1].messages[1].content).toContain(
      'Find deployment-related errors',
    );
  });

  it('checks OpenAI availability through its models endpoint', async () => {
    get.mockResolvedValue({ status: 200 });

    await expect(provider.checkHealth()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.any(Object),
    );
  });

  it('rejects a non-JSON completion with 503', async () => {
    post.mockResolvedValue({
      data: { choices: [{ message: { content: 'not json' } }] },
    });

    await expect(provider.analyze([])).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a JSON payload that misses the contract', async () => {
    post.mockResolvedValue({
      data: { choices: [{ message: { content: '{"summary":"x"}' } }] },
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
