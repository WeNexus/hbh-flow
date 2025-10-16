import type { TokenClientOptions } from '#lib/hub/types';
import { TokenClient } from '#lib/hub/clients';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';
import { OpenAI } from 'openai';

@Client('token', {
  id: 'llm',
  name: 'LLM',
  icon: 'https://img.icons8.com/?size=100&id=ETVUfl0Ylh1p&format=png&color=000000',
})
export class LlmService extends TokenClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', LlmService), {
        connections: [
          {
            id: 'hbh',
            description: 'HBH NVIDIA Nim Connection',
            tokens: {
              apiKey: env.getString('HBH_NIM_API_KEY'),
              baseUrl: 'https://integrate.api.nvidia.com/v1',
            },
          },
        ],
      }),
    );
  }

  private readonly clients = new Map<string, OpenAI>();

  getClient(connection: string): OpenAI {
    let client = this.clients.get(connection);

    if (client) {
      return client;
    }

    const { apiKey, baseUrl } = this.getToken(connection);

    client = new OpenAI({ apiKey, baseURL: baseUrl });

    this.clients.set(connection, client);

    return client;
  }

  async testConnection(connection: string): Promise<boolean> {
    const client = this.getClient(connection);

    const res = await client.chat.completions.create({
      model: 'meta/llama-4-maverick-17b-128e-instruct',
      messages: [{ role: 'user', content: 'Hello!' }],
      temperature: 1.0,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      stream: false,
      max_completion_tokens: 50,
    });

    return !!res?.choices;
  }
}
