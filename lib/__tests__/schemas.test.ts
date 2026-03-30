import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import {
  parseBody,
  createTagSchema,
  shareRecipeSchema,
  scrapeRecipeSchema,
  bulkUpdateRecipesSchema,
} from '@/lib/schemas'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeInvalidJsonRequest(): NextRequest {
  return new NextRequest('http://localhost/test', {
    method: 'POST',
    body: 'not-json!!!',
    headers: { 'Content-Type': 'application/json' },
  })
}

async function errorJson(res: Response): Promise<{ error: string }> {
  return res.json()
}

// ---------------------------------------------------------------------------
// parseBody
// ---------------------------------------------------------------------------

describe('parseBody', () => {
  const testSchema = z.object({
    name: z.string().min(1, 'name is required'),
    count: z.number().int().positive(),
    optional_field: z.string().default('default_value'),
  })

  it('returns parsed data for valid input', async () => {
    const req = makeRequest({ name: 'hello', count: 5 })
    const { data, error } = await parseBody(req, testSchema)

    expect(error).toBeUndefined()
    expect(data).toEqual({ name: 'hello', count: 5, optional_field: 'default_value' })
  })

  it('returns 400 error for invalid JSON', async () => {
    const req = makeInvalidJsonRequest()
    const { data, error } = await parseBody(req, testSchema)

    expect(data).toBeUndefined()
    expect(error).toBeDefined()
    expect(error!.status).toBe(400)

    const body = await errorJson(error!)
    expect(body.error).toBe('Invalid JSON')
  })

  it('returns 400 error with field path for validation failures', async () => {
    const req = makeRequest({ name: 'hello', count: -3 })
    const { data, error } = await parseBody(req, testSchema)

    expect(data).toBeUndefined()
    expect(error).toBeDefined()
    expect(error!.status).toBe(400)

    const body = await errorJson(error!)
    // Should include the field path "count"
    expect(body.error).toContain('count')
  })

  it('handles Zod defaults correctly — missing optional fields get defaults', async () => {
    const req = makeRequest({ name: 'test', count: 1 })
    const { data, error } = await parseBody(req, testSchema)

    expect(error).toBeUndefined()
    expect(data).toBeDefined()
    expect(data!.optional_field).toBe('default_value')
  })

  it('returns first error message when multiple fields fail', async () => {
    // Both name and count are invalid
    const req = makeRequest({ name: '', count: -1 })
    const { data, error } = await parseBody(req, testSchema)

    expect(data).toBeUndefined()
    expect(error).toBeDefined()
    expect(error!.status).toBe(400)

    const body = await errorJson(error!)
    // Should return exactly one error message (the first issue)
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)
    // The first field in the object is "name", so the first error should be about name
    expect(body.error).toContain('name')
  })

  it('strips the leading colon when path is empty (top-level error)', async () => {
    // A schema that validates the top-level value directly (no nested path)
    const stringSchema = z.string().min(1, 'value is required')
    const req = makeRequest(42)
    const { error } = await parseBody(req, stringSchema)

    expect(error).toBeDefined()
    const body = await errorJson(error!)
    // Should not start with ": " since path is empty
    expect(body.error).not.toMatch(/^: /)
  })
})

// ---------------------------------------------------------------------------
// createTagSchema
// ---------------------------------------------------------------------------

describe('createTagSchema', () => {
  it('accepts valid input and trims name', () => {
    const result = createTagSchema.safeParse({ name: '  Italian  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Italian')
    }
  })

  it('defaults section to cuisine when not provided', () => {
    const result = createTagSchema.safeParse({ name: 'Seafood' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.section).toBe('cuisine')
    }
  })

  it('accepts an explicit section value', () => {
    const result = createTagSchema.safeParse({ name: 'Vegan', section: 'dietary' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.section).toBe('dietary')
    }
  })

  it('rejects empty name', () => {
    const result = createTagSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only name (trimmed to empty)', () => {
    const result = createTagSchema.safeParse({ name: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const result = createTagSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid section value', () => {
    const result = createTagSchema.safeParse({ name: 'Test', section: 'invalid' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shareRecipeSchema
// ---------------------------------------------------------------------------

describe('shareRecipeSchema', () => {
  it('accepts is_shared = true', () => {
    const result = shareRecipeSchema.safeParse({ is_shared: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_shared).toBe(true)
    }
  })

  it('accepts is_shared = false', () => {
    const result = shareRecipeSchema.safeParse({ is_shared: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_shared).toBe(false)
    }
  })

  it('rejects non-boolean is_shared', () => {
    const result = shareRecipeSchema.safeParse({ is_shared: 'yes' })
    expect(result.success).toBe(false)
  })

  it('rejects missing is_shared', () => {
    const result = shareRecipeSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects numeric value for is_shared', () => {
    const result = shareRecipeSchema.safeParse({ is_shared: 1 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// scrapeRecipeSchema
// ---------------------------------------------------------------------------

describe('scrapeRecipeSchema', () => {
  it('accepts a valid URL', () => {
    const result = scrapeRecipeSchema.safeParse({ url: 'https://example.com/recipe' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.url).toBe('https://example.com/recipe')
    }
  })

  it('trims whitespace from URL', () => {
    const result = scrapeRecipeSchema.safeParse({ url: '  https://example.com  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.url).toBe('https://example.com')
    }
  })

  it('rejects missing url', () => {
    const result = scrapeRecipeSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty string url', () => {
    const result = scrapeRecipeSchema.safeParse({ url: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe('url is required')
    }
  })

  it('rejects invalid URL format', () => {
    const result = scrapeRecipeSchema.safeParse({ url: 'not-a-url' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe('url must be a valid URL')
    }
  })
})

// ---------------------------------------------------------------------------
// bulkUpdateRecipesSchema
// ---------------------------------------------------------------------------

describe('bulkUpdateRecipesSchema', () => {
  it('accepts a non-empty recipe_ids array', () => {
    const result = bulkUpdateRecipesSchema.safeParse({
      recipe_ids: ['id-1', 'id-2'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recipe_ids).toEqual(['id-1', 'id-2'])
    }
  })

  it('defaults add_tags to empty array when not provided', () => {
    const result = bulkUpdateRecipesSchema.safeParse({
      recipe_ids: ['id-1'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.add_tags).toEqual([])
    }
  })

  it('accepts add_tags when provided', () => {
    const result = bulkUpdateRecipesSchema.safeParse({
      recipe_ids: ['id-1'],
      add_tags: ['Healthy', 'Quick'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.add_tags).toEqual(['Healthy', 'Quick'])
    }
  })

  it('rejects empty recipe_ids array', () => {
    const result = bulkUpdateRecipesSchema.safeParse({ recipe_ids: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe(
        'recipe_ids is required and must be non-empty'
      )
    }
  })

  it('rejects missing recipe_ids', () => {
    const result = bulkUpdateRecipesSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-array recipe_ids', () => {
    const result = bulkUpdateRecipesSchema.safeParse({ recipe_ids: 'id-1' })
    expect(result.success).toBe(false)
  })
})
