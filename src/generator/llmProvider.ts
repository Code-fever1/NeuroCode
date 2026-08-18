import { TestCase } from '../shared/types';

export interface LlmConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmResult {
  tests: TestCase[];
  raw?: string;
}

export class LlmProvider {
  constructor(private readonly config: LlmConfig) {}

  async generate(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
    const baseUrl = this.config.apiBaseUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned an empty response');
    }
    return { tests: [], raw: content };
  }
}
