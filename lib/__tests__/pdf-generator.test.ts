/**
 * Tests for lib/pdf-generator.ts
 * Covers: T16, T17, T18, T19, T20, T21, T22
 *
 * pdf-lib compresses content streams, so raw text search won't work.
 * Instead we use PDFDocument.load() to verify structure (page counts),
 * and decompress content streams with pako for text assertions.
 */

import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import * as pako from 'pako'
import { generateRecipePdf } from '../pdf-generator'

const sampleRecipe = {
  id: 'r1',
  title: 'Chicken Parmesan',
  category: 'main_dish',
  ingredients: '2 chicken breasts\n1 cup breadcrumbs\n1 cup marinara',
  steps: 'Bread the chicken\nFry until golden\nTop with sauce and cheese\nBake at 375F for 20 min',
  notes: 'Great with pasta on the side',
  servings: 4,
  prepTimeMinutes: 15,
  cookTimeMinutes: 30,
  totalTimeMinutes: 45,
  tags: ['Favorite', 'Comfort'],
  url: 'https://example.com/chicken-parm',
}

const sampleRecipe2 = {
  id: 'r2',
  title: 'Simple Salad',
  category: 'side_dish',
  ingredients: 'Mixed greens\nTomatoes\nDressing',
  steps: 'Wash greens\nChop tomatoes\nToss with dressing',
  notes: null,
  servings: 2,
  prepTimeMinutes: 5,
  cookTimeMinutes: null,
  totalTimeMinutes: 5,
  tags: ['Healthy', 'Quick'],
  url: null,
}

// PDF magic bytes: %PDF
function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/**
 * Extract all text from a PDF by decompressing FlateDecode streams
 * and extracting text from PDF text operators.
 * pdf-lib uses hex-encoded strings: <hexdata> Tj
 */
function extractPdfText(pdfBytes: Uint8Array): string {
  const buf = Buffer.from(pdfBytes)
  const raw = buf.toString('binary')
  const texts: string[] = []

  // Find stream boundaries in binary data
  let pos = 0
  while ((pos = raw.indexOf('stream\n', pos)) !== -1) {
    const dataStart = pos + 7
    const endPos = raw.indexOf('endstream', dataStart)
    if (endPos === -1) break

    const streamData = pdfBytes.slice(dataStart, endPos)
    let content: string
    try {
      const inflated = pako.inflate(streamData)
      content = Buffer.from(inflated).toString('latin1')
    } catch {
      content = Buffer.from(streamData).toString('latin1')
    }

    // Extract hex-encoded text strings: <hex> Tj
    const hexTjRegex = /<([0-9A-Fa-f]+)>\s*Tj/g
    let m
    while ((m = hexTjRegex.exec(content)) !== null) {
      texts.push(Buffer.from(m[1]!, 'hex').toString('latin1'))
    }

    // Also extract parenthesized text: (text) Tj
    const parenTjRegex = /\(([^)]*)\)\s*Tj/g
    while ((m = parenTjRegex.exec(content)) !== null) {
      texts.push(m[1]!)
    }

    pos = endPos
  }

  return texts.join(' ')
}

describe('generateRecipePdf', () => {
  it('T16: single format returns a valid PDF byte array', async () => {
    const result = await generateRecipePdf([sampleRecipe], 'single')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
    expect(isPdf(result)).toBe(true)
  })

  it('T17: cookbook format with multiple recipes returns a multi-page PDF', async () => {
    const result = await generateRecipePdf([sampleRecipe, sampleRecipe2], 'cookbook')
    expect(isPdf(result)).toBe(true)
    const doc = await PDFDocument.load(result)
    // Cookbook: cover + TOC + 2 recipe pages = 4 pages
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4)
  })

  it('T18: single-format PDF has exactly 1 page (no TOC)', async () => {
    const result = await generateRecipePdf([sampleRecipe], 'single')
    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(1)
  })

  it('T19: cookbook-format PDF contains "My Recipes" cover text', async () => {
    const result = await generateRecipePdf([sampleRecipe, sampleRecipe2], 'cookbook')
    const text = extractPdfText(result)
    expect(text).toContain('My Recipes')
  })

  it('T20: PDF contains "Made with Thymeline" footer text', async () => {
    const result = await generateRecipePdf([sampleRecipe], 'single')
    const text = extractPdfText(result)
    expect(text).toContain('Made with Thymeline')
  })

  it('T21: PDF contains the recipe title', async () => {
    const result = await generateRecipePdf([sampleRecipe], 'single')
    const text = extractPdfText(result)
    expect(text).toContain('Chicken Parmesan')
  })

  it('T22: PDF contains ingredients and steps content', async () => {
    const result = await generateRecipePdf([sampleRecipe], 'single')
    const text = extractPdfText(result)
    expect(text).toContain('Ingredients')
    expect(text).toContain('Steps')
  })
})
