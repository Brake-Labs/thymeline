'use client'

import { useState } from 'react'
import { parseIngredientLine } from '@/lib/grocery'
import { scaleIngredients } from '@/lib/scale-ingredients'

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
}

interface Props {
  stepText: string
  ingredients: string
  baseServings: number
  targetServings: number
  /** Override default expand behaviour. If omitted, expands when 1–3 match, collapses when >3. */
  defaultExpanded?: boolean
}

export function matchStepIngredients(
  stepText: string,
  ingredients: string,
  baseServings: number,
  targetServings: number,
): string[] {
  const lines = ingredients.split('\n').filter(Boolean)
  const scaledLines = scaleIngredients(ingredients, baseServings, targetServings)
  return lines
    .map((line, i) => {
      const { rawName } = parseIngredientLine(line)
      if (!rawName) return null
      // Use word-boundary regex so "oil" doesn't match inside "boil",
      // or "rice" doesn't match inside "licorice".
      const re = new RegExp(`\\b${escapeRegex(rawName)}\\b`, 'i')
      return re.test(stepText) ? scaledLines[i] : null
    })
    .filter((l): l is string => l !== null)
}

export default function StepIngredientPanel({
  stepText,
  ingredients,
  baseServings,
  targetServings,
  defaultExpanded,
}: Props) {
  const matched = matchStepIngredients(stepText, ingredients, baseServings, targetServings)

  const autoExpand = matched.length > 0 && matched.length <= 3
  const [open, setOpen] = useState(defaultExpanded !== undefined ? defaultExpanded : autoExpand)

  if (matched.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5"
      >
        <span className="font-display font-bold text-[10px] uppercase tracking-[0.12em] text-sage-600">
          Ingredients for this step
        </span>
        <span className="text-sage-500 text-xs leading-none">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {matched.map((line, i) => (
            <li key={i} className="font-sans text-[13px] text-stone-600">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
