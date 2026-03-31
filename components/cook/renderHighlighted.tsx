import type { HighlightRange } from '@/lib/inject-step-quantities'

/**
 * Renders step text with highlighted quantity spans shared by SingleStepView
 * and ScrollStepView. Quantity portions are wrapped in a terracotta-coloured span.
 */
export function renderHighlighted(text: string, highlights: HighlightRange[]): React.ReactNode {
  if (highlights.length === 0) return text
  const nodes: React.ReactNode[] = []
  let cursor = 0
  highlights.forEach((h, i) => {
    if (h.start > cursor) nodes.push(text.slice(cursor, h.start))
    nodes.push(
      <span key={i} className="font-medium text-[#C97D4E]">
        {text.slice(h.start, h.end)}
      </span>,
    )
    cursor = h.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}
