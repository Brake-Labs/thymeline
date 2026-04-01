'use client'

import { useState } from 'react'

const RECIPE_FIELD_OPTIONS = [
  { value: 'title',        label: 'Title' },
  { value: 'ingredients',  label: 'Ingredients' },
  { value: 'steps',        label: 'Steps / Instructions' },
  { value: 'notes',        label: 'Notes / Description' },
  { value: 'url',          label: 'URL / Source' },
  { value: 'tags',         label: 'Tags / Categories' },
  { value: 'category',     label: 'Category / Meal Type' },
  { value: 'servings',     label: 'Servings' },
  { value: 'prep_time',    label: 'Prep Time' },
  { value: 'cook_time',    label: 'Cook Time' },
  { value: 'total_time',   label: 'Total Time' },
  { value: '(ignore)',     label: '(ignore)' },
]

interface Props {
  headers:   string[]
  mapping:   Record<string, string>
  onConfirm: (mapping: Record<string, string>) => void
  onCancel:  () => void
}

export default function NotionMappingEditor({ headers, mapping, onConfirm, onCancel }: Props) {
  const [current, setCurrent] = useState<Record<string, string>>({ ...mapping })

  function handleChange(header: string, field: string) {
    setCurrent((prev) => ({ ...prev, [header]: field }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-stone-800">Confirm column mapping</h2>
        <p className="text-sm text-stone-500 mt-1">
          We detected a Notion CSV. Map each column to the appropriate recipe field.
        </p>
      </div>

      <div className="border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-stone-600">CSV Column</th>
              <th className="text-left px-4 py-2 font-medium text-stone-600">Recipe Field</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {headers.map((header) => (
              <tr key={header}>
                <td className="px-4 py-2 text-stone-700 font-mono text-xs">{header}</td>
                <td className="px-4 py-2">
                  <select
                    value={current[header] ?? '(ignore)'}
                    onChange={(e) => handleChange(header, e.target.value)}
                    className="border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
                  >
                    {RECIPE_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onConfirm(current)}
          className="px-5 py-2 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors"
        >
          Confirm mapping
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 border border-stone-300 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
