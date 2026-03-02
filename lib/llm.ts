import {
  Client,
  ModelProvider,
  validEnviromentKeys,
  type ApiKeyValues,
} from 'any-llm'

// LLM_MODEL: provider name matching ModelProvider enum (e.g. "Anthropic", "OpenAI")
// LLM_API_KEY: the API key for that provider
//
// This stub maps LLM_API_KEY to the correct provider key expected by any-llm.
// Actual chat calls will be wired in a future brief.

const model = (process.env.LLM_MODEL ?? 'Anthropic') as ModelProvider
const apiKey = process.env.LLM_API_KEY ?? ''

const providerKeyMap: Partial<Record<ModelProvider, validEnviromentKeys>> = {
  [ModelProvider.Anthropic]: validEnviromentKeys.ANTHROPIC_API_KEY,
  [ModelProvider.OpenAI]: validEnviromentKeys.OPENAI_API_KEY,
  [ModelProvider.Google]: validEnviromentKeys.GOOGLE_GEMINI_API_KEY,
}

const keyName = providerKeyMap[model] ?? validEnviromentKeys.ANTHROPIC_API_KEY
const apiKeyValues = { [keyName]: apiKey } as ApiKeyValues

export const llmClient = new Client(model, apiKeyValues)
