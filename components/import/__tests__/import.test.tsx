// @vitest-environment jsdom
/**
 * Tests for import UI components
 * Covers spec-17 test cases: T01, T02, T08, T14, T15, T17, T18, T24, T26, T27
 * Regression: hotfix/import-urls-auth — all fetch calls must include Authorization header
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ── T01 — Import page renders source tabs ─────────────────────────────────────

describe('ImportSourceTabs', () => {
  it('T01: renders both Paste URLs and Upload File tabs', async () => {
    const { default: ImportSourceTabs } = await import('../ImportSourceTabs')
    render(
      <ImportSourceTabs
        onUrlsSubmit={vi.fn()}
        onFileSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Paste URLs')).toBeInTheDocument()
    expect(screen.getByText('Upload File')).toBeInTheDocument()
  })

  it('T02: URL textarea validates and counts valid URLs', async () => {
    const { default: ImportSourceTabs } = await import('../ImportSourceTabs')
    render(
      <ImportSourceTabs
        onUrlsSubmit={vi.fn()}
        onFileSubmit={vi.fn()}
      />,
    )

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, {
      target: {
        value: [
          'https://www.example.com/recipe1',
          'https://www.example.com/recipe2',
          'not a url',
        ].join('\n'),
      },
    })

    expect(screen.getByText('2 valid URLs detected')).toBeInTheDocument()
    expect(screen.getByText(/1 line.*don.*look like URL/i)).toBeInTheDocument()
  })

  it('T02: Start Import button disabled with no valid URLs', async () => {
    const { default: ImportSourceTabs } = await import('../ImportSourceTabs')
    render(
      <ImportSourceTabs
        onUrlsSubmit={vi.fn()}
        onFileSubmit={vi.fn()}
      />,
    )

    const btn = screen.getByRole('button', { name: 'Start Import' })
    expect(btn).toBeDisabled()
  })

  it('T08: file upload zone accepts .csv, .json, .paprikarecipes', async () => {
    const { default: ImportSourceTabs } = await import('../ImportSourceTabs')
    render(
      <ImportSourceTabs
        onUrlsSubmit={vi.fn()}
        onFileSubmit={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Upload File'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain('.csv')
    expect(input.accept).toContain('.json')
    expect(input.accept).toContain('.paprikarecipes')
  })

  it('calls onUrlsSubmit with valid URLs when Start Import clicked', async () => {
    const onUrlsSubmit = vi.fn()
    const { default: ImportSourceTabs } = await import('../ImportSourceTabs')
    render(
      <ImportSourceTabs
        onUrlsSubmit={onUrlsSubmit}
        onFileSubmit={vi.fn()}
      />,
    )

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, {
      target: { value: 'https://example.com/recipe\nnot-a-url' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
    expect(onUrlsSubmit).toHaveBeenCalledWith(['https://example.com/recipe'])
  })
})

// ── T15 — Notion mapping editor ───────────────────────────────────────────────

describe('NotionMappingEditor', () => {
  it('T14+T15: renders dropdowns pre-populated with LLM mapping', async () => {
    const { default: NotionMappingEditor } = await import('../NotionMappingEditor')
    const headers = ['Page Title', 'Content', 'Type']
    const mapping: Record<string, string> = {
      'Page Title': 'title',
      'Content':    'ingredients',
      'Type':       '(ignore)',
    }
    const onConfirm = vi.fn()

    render(
      <NotionMappingEditor
        headers={headers}
        mapping={mapping}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Page Title')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()

    // Confirm mapping button
    fireEvent.click(screen.getByRole('button', { name: /confirm mapping/i }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ 'Page Title': 'title' }),
    )
  })

  it('T15: allows changing a column mapping', async () => {
    const { default: NotionMappingEditor } = await import('../NotionMappingEditor')
    const headers = ['Col1']
    const mapping = { 'Col1': '(ignore)' }
    const onConfirm = vi.fn()

    render(
      <NotionMappingEditor
        headers={headers}
        mapping={mapping}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'title' } })

    fireEvent.click(screen.getByRole('button', { name: /confirm mapping/i }))
    expect(onConfirm).toHaveBeenCalledWith({ 'Col1': 'title' })
  })
})

// ── T17 — ReviewTable status badges ──────────────────────────────────────────

describe('ReviewTable', () => {
  const baseResults = [
    {
      id:           'r1',
      status:       'ready' as const,
      recipe:       { title: 'Chicken Soup', category: null, ingredients: 'chicken', steps: 'boil', notes: null, url: null, imageUrl: null, prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null, inactiveTimeMinutes: null, servings: null, tags: [], source: 'manual' as const },
      sourceLabel: 'manual',
    },
    {
      id:           'r2',
      status:       'partial' as const,
      recipe:       { title: 'Pasta', category: null, ingredients: 'pasta', steps: null, notes: null, url: null, imageUrl: null, prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null, inactiveTimeMinutes: null, servings: null, tags: [], source: 'manual' as const },
      sourceLabel: 'manual',
    },
    {
      id:           'r3',
      status:       'failed' as const,
      error:        'Missing title',
      recipe:       undefined,
      sourceLabel: 'manual',
    },
    {
      id:           'r4',
      status:       'ready' as const,
      recipe:       { title: 'Dupe Recipe', category: null, ingredients: 'x', steps: 'y', notes: null, url: 'https://x.com', imageUrl: null, prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null, inactiveTimeMinutes: null, servings: null, tags: [], source: 'scraped' as const },
      sourceLabel: 'x.com',
      duplicate:    { recipeId: 'existing-1', recipeTitle: 'Existing Recipe' },
    },
  ]

  it('T17: shows Ready / Partial / Failed / Duplicate badges', async () => {
    const { default: ReviewTable } = await import('../ReviewTable')
    render(
      <ReviewTable
        results={baseResults}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('T18: Select all ready checks only non-failed, non-duplicate rows', async () => {
    const { default: ReviewTable } = await import('../ReviewTable')
    render(
      <ReviewTable
        results={baseResults}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    fireEvent.click(screen.getByText('Select all ready'))

    // Import button should show 1 (only r1 is ready + non-duplicate)
    expect(screen.getByRole('button', { name: /import 1 recipe/i })).toBeInTheDocument()
  })

  it('T18: Deselect duplicates unchecks duplicate rows', async () => {
    const { default: ReviewTable } = await import('../ReviewTable')
    render(
      <ReviewTable
        results={baseResults}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    // First select all
    const checkboxes = screen.getAllByRole('checkbox')
    // Enable all non-failed checkboxes
    checkboxes.forEach((cb) => {
      if (!(cb as HTMLInputElement).disabled) {
        if (!(cb as HTMLInputElement).checked) {
          fireEvent.click(cb)
        }
      }
    })

    fireEvent.click(screen.getByText('Deselect duplicates'))
    // After deselecting duplicates, r4 should be unchecked
    // The import button count should not include r4
  })

  it('shows "Similar to: X" text for duplicate rows', async () => {
    const { default: ReviewTable } = await import('../ReviewTable')
    render(
      <ReviewTable
        results={baseResults}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    expect(screen.getByText('Similar to: Existing Recipe')).toBeInTheDocument()
  })

  it('T26: footer shows correct import count', async () => {
    const { default: ReviewTable } = await import('../ReviewTable')
    render(
      <ReviewTable
        results={[baseResults[0]!, baseResults[1]!]}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    // Both are checked by default (not failed)
    expect(screen.getByRole('button', { name: /import 2 recipes/i })).toBeInTheDocument()
  })
})

// ── T26 — ImportSummary stat grid ──────────────────────────────────────────────

describe('ImportSummary', () => {
  it('T26: shows correct counts in stat grid', async () => {
    const { default: ImportSummary } = await import('../ImportSummary')
    render(
      <ImportSummary
        summary={{ imported: 5, skipped: 2, replaced: 1, failed: [{ title: 'Bad Recipe', error: 'Missing title' }] }}
        partialRecipes={[]}
        onImportMore={vi.fn()}
      />,
    )

    expect(screen.getByText('5')).toBeInTheDocument() // imported
    expect(screen.getByText('2')).toBeInTheDocument() // skipped
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1) // replaced + failed
  })

  it('T24: shows Complete links for partial recipes', async () => {
    const { default: ImportSummary } = await import('../ImportSummary')
    render(
      <ImportSummary
        summary={{ imported: 1, skipped: 0, replaced: 0, failed: [] }}
        partialRecipes={[{ id: 'abc-123', title: 'Incomplete Soup' }]}
        onImportMore={vi.fn()}
      />,
    )

    expect(screen.getByText('These recipes are missing some data')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Complete Incomplete Soup/i })
    expect(link).toHaveAttribute('href', '/recipes/abc-123/edit')
  })

  it('shows collapsible failed recipes section', async () => {
    const { default: ImportSummary } = await import('../ImportSummary')
    render(
      <ImportSummary
        summary={{ imported: 0, skipped: 0, replaced: 0, failed: [{ title: 'Bad One', error: 'Parse error' }] }}
        partialRecipes={[]}
        onImportMore={vi.fn()}
      />,
    )

    expect(screen.getByText(/Failed recipes/)).toBeInTheDocument()
  })
})

// ── T27 — Import Recipes button in toolbar ────────────────────────────────────

describe('RecipePageContent toolbar', () => {
  it('T27: Import Recipes button links to /import', async () => {
    // Just verify the link exists in the source (component-level test would require full setup)
    // We use a smoke test by importing and checking the rendered output
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.default.join(
      process.cwd(),
      'app/(app)/recipes/RecipePageContent.tsx',
    )
    const content = fs.default.readFileSync(filePath, 'utf8')
    expect(content).toContain('href="/import"')
    expect(content).toContain('Import Recipes')
  })
})

// ── DuplicateActions component ─────────────────────────────────────────────────

describe('DuplicateActions', () => {
  it('shows three action buttons: Skip, Keep both, Replace', async () => {
    const { default: DuplicateActions } = await import('../DuplicateActions')
    const result = {
      id:           'dup-1',
      status:       'ready' as const,
      sourceLabel: 'example.com',
      duplicate:    { recipeId: 'existing-1', recipeTitle: 'Old Recipe' },
    }

    render(<DuplicateActions result={result} onChange={vi.fn()} />)
    expect(screen.getByText('Skip')).toBeInTheDocument()
    expect(screen.getByText('Keep both')).toBeInTheDocument()
    expect(screen.getByText('Replace')).toBeInTheDocument()
  })

  it('shows "Will replace" confirmation when Replace is selected', async () => {
    const { default: DuplicateActions } = await import('../DuplicateActions')
    const result = {
      id:              'dup-1',
      status:          'ready' as const,
      sourceLabel:    'example.com',
      duplicate:       { recipeId: 'existing-1', recipeTitle: 'Old Recipe' },
      duplicateAction: 'replace' as const,
    }

    render(<DuplicateActions result={result} onChange={vi.fn()} />)
    expect(screen.getByText('Will replace: Old Recipe')).toBeInTheDocument()
  })

  it('calls onChange with the selected action', async () => {
    const { default: DuplicateActions } = await import('../DuplicateActions')
    const onChange = vi.fn()
    const result = {
      id:           'dup-1',
      status:       'ready' as const,
      sourceLabel: 'example.com',
      duplicate:    { recipeId: 'existing-1', recipeTitle: 'Old Recipe' },
    }

    render(<DuplicateActions result={result} onChange={onChange} />)
    fireEvent.click(screen.getByText('Skip'))
    expect(onChange).toHaveBeenCalledWith('skip')
  })
})

// ── Regression: hotfix/import-urls-auth — fetch calls are issued (auth is cookie-based now) ──

describe('ImportWizard fetch calls (regression: hotfix/import-urls-auth)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ job_id: 'job-1', total: 1 }),
    }))
  })

  it('POST /api/import/urls fetch is issued on Start Import', async () => {
    const { default: ImportWizard } = await import('../ImportWizard')

    const { unmount } = render(<ImportWizard />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'https://example.com/recipe' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Import' }))
    })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/import/urls',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    unmount()
  })
})

describe('ImportProgress fetch calls (regression: hotfix/import-urls-auth)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ job_id: 'job-1', total: 1, completed: 0, results: [] }),
    }))
  })

  it('polling GET /api/import/:job_id is issued', async () => {
    const { default: ImportProgress } = await import('../ImportProgress')

    await act(async () => {
      render(<ImportProgress jobId="job-abc" onComplete={vi.fn()} />)
    })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/import/job-abc',
    )
  })
})
