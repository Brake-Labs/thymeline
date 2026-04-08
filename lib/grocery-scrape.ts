import 'server-only'

import { callLLM, LLM_MODEL_FAST } from './llm'
import { logger } from './logger'
import { isBlockedUrl } from './url-validation'

interface RecipeForIngredients {
  recipeId: string
  recipeTitle: string
  ingredients: string | null
  url: string | null
}

/**
 * Resolves ingredients for a recipe: uses stored ingredients first,
 * falls back to scraping + LLM extraction if a URL and API key are available.
 * Returns the ingredients text or null if resolution fails.
 */
export async function resolveRecipeIngredients(
  recipe: RecipeForIngredients,
  firecrawlKey?: string,
): Promise<string | null> {
  if (recipe.ingredients) {
    logger.debug({ recipeId: recipe.recipeId }, 'using stored ingredients')
    return recipe.ingredients
  }

  if (!recipe.url || !firecrawlKey) return null
  if (isBlockedUrl(recipe.url)) return null

  try {
    const { default: FirecrawlApp } = await import('firecrawl')
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey })
    const result = await firecrawl.scrape(recipe.url, { formats: ['markdown'] })
    const pageContent = result.markdown ?? ''

    const extractionPrompt = `Extract the ingredients list from this recipe page. Return ONLY a JSON object with a single field "ingredients": a newline-separated string of ingredients (one per line), or null if not found.\n\nPage content:\n${pageContent.slice(0, 10000)}`

    const rawText = await callLLM({
      model: LLM_MODEL_FAST,
      maxTokens: 1024,
      system: 'You are an ingredient extraction assistant. Extract ingredients from recipe pages and return only valid JSON.',
      user: extractionPrompt,
    })
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.ingredients === 'string') {
      return parsed.ingredients
    }
  } catch (err) {
    logger.error({ recipeId: recipe.recipeId, recipeTitle: recipe.recipeTitle, error: err instanceof Error ? err.message : String(err) }, 'failed to scrape/extract ingredients')
  }

  return null
}
