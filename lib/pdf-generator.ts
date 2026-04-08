/**
 * Server-only PDF generation for recipe export.
 * Uses pdf-lib (pure JS, no native dependencies).
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'

interface ExportRecipe {
  id: string
  title: string
  category: string
  ingredients: string | null
  steps: string | null
  notes: string | null
  servings: number | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  totalTimeMinutes: number | null
  tags: string[]
  url: string | null
}

const PAGE_W = 612 // US Letter
const PAGE_H = 792
const MARGIN = 50
const CONTENT_W = PAGE_W - 2 * MARGIN
const FOOTER_Y = 40
const LINE_HEIGHT = 14
const HEADING_SIZE = 24
const BODY_SIZE = 10
const SMALL_SIZE = 8
const META_SIZE = 9

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) {
      lines.push('')
      continue
    }
    const words = rawLine.split(/\s+/)
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (current) lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function drawFooter(page: PDFPage, font: PDFFont, sourceUrl: string | null, showPageNum: boolean, pageNum: number) {
  const footerParts: string[] = []
  if (sourceUrl) footerParts.push(sourceUrl)
  footerParts.push('Made with Thymeline')
  const footerText = footerParts.join('  |  ')
  page.drawText(footerText, {
    x: MARGIN,
    y: FOOTER_Y,
    size: SMALL_SIZE,
    font,
    color: rgb(0.6, 0.6, 0.6),
  })
  if (showPageNum) {
    const numText = String(pageNum)
    const numWidth = font.widthOfTextAtSize(numText, SMALL_SIZE)
    page.drawText(numText, {
      x: (PAGE_W - numWidth) / 2,
      y: FOOTER_Y - 12,
      size: SMALL_SIZE,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })
  }
}

function drawRecipePage(
  doc: PDFDocument,
  recipe: ExportRecipe,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  isCookbook: boolean,
  pageCounter: { value: number },
): void {
  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  // Title
  const titleLines = wrapText(recipe.title, fontBold, HEADING_SIZE, CONTENT_W)
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: HEADING_SIZE, font: fontBold, color: rgb(0, 0, 0) })
    y -= HEADING_SIZE + 4
  }
  y -= 6

  // Meta line
  const metaParts: string[] = []
  if (recipe.servings) metaParts.push(`${recipe.servings} servings`)
  if (recipe.prepTimeMinutes) metaParts.push(`Prep: ${recipe.prepTimeMinutes}m`)
  if (recipe.cookTimeMinutes) metaParts.push(`Cook: ${recipe.cookTimeMinutes}m`)
  if (recipe.totalTimeMinutes) metaParts.push(`Total: ${recipe.totalTimeMinutes}m`)
  if (metaParts.length > 0) {
    page.drawText(metaParts.join('  \u2022  '), {
      x: MARGIN, y, size: META_SIZE, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= META_SIZE + 8
  }

  // Tags
  if (recipe.tags.length > 0) {
    const tagText = recipe.tags.join('  |  ')
    page.drawText(tagText, {
      x: MARGIN, y, size: SMALL_SIZE, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
    })
    y -= SMALL_SIZE + 12
  }

  // Helper to ensure we have space, adding a new page if needed
  function ensureSpace(needed: number): void {
    if (y - needed < FOOTER_Y + 20) {
      drawFooter(page, fontRegular, recipe.url, isCookbook, pageCounter.value)
      pageCounter.value++
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  // Two-column layout: ingredients left, steps right
  const colWidth = (CONTENT_W - 20) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colWidth + 20

  // Ingredients
  if (recipe.ingredients) {
    ensureSpace(LINE_HEIGHT * 2)
    page.drawText('Ingredients', { x: leftX, y, size: BODY_SIZE + 1, font: fontBold, color: rgb(0, 0, 0) })

    const ingredientLines = wrapText(recipe.ingredients, fontRegular, BODY_SIZE, colWidth)
    let ingY = y - LINE_HEIGHT - 4
    for (const line of ingredientLines) {
      ensureSpace(LINE_HEIGHT)
      if (ingY < FOOTER_Y + 20) {
        drawFooter(page, fontRegular, recipe.url, isCookbook, pageCounter.value)
        pageCounter.value++
        page = doc.addPage([PAGE_W, PAGE_H])
        y = PAGE_H - MARGIN
        ingY = y
      }
      page.drawText(line, { x: leftX, y: ingY, size: BODY_SIZE, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
      ingY -= LINE_HEIGHT
    }

    // Steps on the right at same starting Y as ingredients header
    if (recipe.steps) {
      const stepsStartY = y
      page.drawText('Steps', { x: rightX, y: stepsStartY, size: BODY_SIZE + 1, font: fontBold, color: rgb(0, 0, 0) })

      const stepLines = recipe.steps.split('\n').filter(Boolean)
      let stepY = stepsStartY - LINE_HEIGHT - 4
      stepLines.forEach((step, i) => {
        const numbered = `${i + 1}. ${step}`
        const wrapped = wrapText(numbered, fontRegular, BODY_SIZE, colWidth)
        for (const wl of wrapped) {
          if (stepY < FOOTER_Y + 20) {
            drawFooter(page, fontRegular, recipe.url, isCookbook, pageCounter.value)
            pageCounter.value++
            page = doc.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN
            stepY = y
          }
          page.drawText(wl, { x: rightX, y: stepY, size: BODY_SIZE, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
          stepY -= LINE_HEIGHT
        }
      })

      y = Math.min(ingY, stepY) - 8
    } else {
      y = ingY - 8
    }
  } else if (recipe.steps) {
    // Steps only, full width
    ensureSpace(LINE_HEIGHT * 2)
    page.drawText('Steps', { x: leftX, y, size: BODY_SIZE + 1, font: fontBold, color: rgb(0, 0, 0) })
    y -= LINE_HEIGHT + 4

    const stepLines = recipe.steps.split('\n').filter(Boolean)
    stepLines.forEach((step, i) => {
      const numbered = `${i + 1}. ${step}`
      const wrapped = wrapText(numbered, fontRegular, BODY_SIZE, CONTENT_W)
      for (const wl of wrapped) {
        ensureSpace(LINE_HEIGHT)
        page.drawText(wl, { x: leftX, y, size: BODY_SIZE, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        y -= LINE_HEIGHT
      }
    })
    y -= 8
  }

  // Notes
  if (recipe.notes) {
    ensureSpace(LINE_HEIGHT * 2)
    page.drawText('Notes', { x: MARGIN, y, size: BODY_SIZE + 1, font: fontBold, color: rgb(0, 0, 0) })
    y -= LINE_HEIGHT + 4
    const noteLines = wrapText(recipe.notes, fontRegular, BODY_SIZE, CONTENT_W)
    for (const nl of noteLines) {
      ensureSpace(LINE_HEIGHT)
      page.drawText(nl, { x: MARGIN, y, size: BODY_SIZE, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
      y -= LINE_HEIGHT
    }
  }

  drawFooter(page, fontRegular, recipe.url, isCookbook, pageCounter.value)
  pageCounter.value++
}

export async function generateRecipePdf(
  recipes: ExportRecipe[],
  format: 'single' | 'cookbook',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const pageCounter = { value: 1 }

  if (format === 'cookbook') {
    // Cover page
    const cover = doc.addPage([PAGE_W, PAGE_H])
    const coverTitle = 'My Recipes'
    const titleWidth = fontBold.widthOfTextAtSize(coverTitle, 36)
    cover.drawText(coverTitle, {
      x: (PAGE_W - titleWidth) / 2,
      y: PAGE_H / 2 + 40,
      size: 36,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    const dateStr = new Date().toISOString().slice(0, 10)
    const subtitle = `${recipes.length} recipes  \u2022  ${dateStr}`
    const subWidth = fontRegular.widthOfTextAtSize(subtitle, 12)
    cover.drawText(subtitle, {
      x: (PAGE_W - subWidth) / 2,
      y: PAGE_H / 2,
      size: 12,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    })
    // Cover has no page number
    pageCounter.value = 1

    // Table of Contents
    const tocPage = doc.addPage([PAGE_W, PAGE_H])
    tocPage.drawText('Table of Contents', {
      x: MARGIN, y: PAGE_H - MARGIN, size: 18, font: fontBold, color: rgb(0, 0, 0),
    })
    let tocY = PAGE_H - MARGIN - 30
    // Page numbering: cover (no num), TOC (no num), then recipe pages start at 1
    let recipePageNum = 1
    for (const r of recipes) {
      if (tocY < FOOTER_Y + 20) break // TOC overflow: stop listing
      const pageLabel = String(recipePageNum)
      const labelWidth = fontRegular.widthOfTextAtSize(pageLabel, BODY_SIZE)
      tocPage.drawText(r.title, { x: MARGIN, y: tocY, size: BODY_SIZE, font: fontRegular, color: rgb(0, 0, 0) })
      tocPage.drawText(pageLabel, {
        x: PAGE_W - MARGIN - labelWidth,
        y: tocY,
        size: BODY_SIZE,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      })
      tocY -= LINE_HEIGHT + 2
      recipePageNum++
    }

    // Reset page counter for recipe pages
    pageCounter.value = 1
    for (const recipe of recipes) {
      drawRecipePage(doc, recipe, fontRegular, fontBold, true, pageCounter)
    }
  } else {
    // Single format: one recipe, no page numbers
    drawRecipePage(doc, recipes[0]!, fontRegular, fontBold, false, pageCounter)
  }

  return doc.save()
}
