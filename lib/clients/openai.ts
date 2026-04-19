import OpenAI from 'openai'
import { env } from '@/lib/env'
import pLimit from 'p-limit'

export const pOpenAI = pLimit(10)

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export async function jsonComplete<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>
): Promise<T> {
  const res = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'output', strict: true, schema },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  })
  const content = res.choices[0]?.message.content
  if (!content) throw new Error('OpenAI returned empty content')
  return JSON.parse(content) as T
}
