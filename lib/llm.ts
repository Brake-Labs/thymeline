import Anthropic from '@anthropic-ai/sdk'
import { Client, ModelProvider, validEnviromentKeys, type ApiKeyValues } from 'any-llm'

export const anthropic = new Anthropic({
  apiKey: process.env.LLM_API_KEY ?? '',
})

// any-llm client used by the meal planning routes
const model = (process.env.LLM_MODEL ?? 'Anthropic') as ModelProvider
const apiKey = process.env.LLM_API_KEY ?? ''

const providerKeyMap: Partial<Record<ModelProvider, validEnviromentKeys>> = {
  [ModelProvider.Anthropic]: validEnviromentKeys.ANTHROPIC_API_KEY,
  [ModelProvider.OpenAI]:    validEnviromentKeys.OPENAI_API_KEY,
  [ModelProvider.Google]:    validEnviromentKeys.GOOGLE_GEMINI_API_KEY,
}

const keyName = providerKeyMap[model] ?? validEnviromentKeys.ANTHROPIC_API_KEY
const apiKeyValues = { [keyName]: apiKey } as ApiKeyValues

export const llmClient = new Client(model, apiKeyValues)
