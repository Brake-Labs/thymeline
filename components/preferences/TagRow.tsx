'use client'

import { useState } from 'react'

interface TagRowProps {
  name: string
  recipeCount?: number
  variant: 'firstClass' | 'custom' | 'hidden'
  readOnly?: boolean
  onHide?:    () => void
  onRestore?: () => void
  onRename?:  (newName: string) => Promise<void>
  onDelete?:  () => void
  deleteConfirmCount?: number | null  // null = loading count, undefined = not in delete-confirm mode
  onDeleteConfirm?: () => void
  onDeleteCancel?:  () => void
}

export default function TagRow({
  name,
  recipeCount,
  variant,
  readOnly = false,
  onHide,
  onRestore,
  onRename,
  onDelete,
  deleteConfirmCount,
  onDeleteConfirm,
  onDeleteCancel,
}: TagRowProps) {
  const [isRenaming, setIsRenaming]   = useState(false)
  const [renameValue, setRenameValue] = useState(name)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isSaving, setIsSaving]       = useState(false)

  async function handleRenameSave() {
    if (!onRename) return
    setIsSaving(true)
    setRenameError(null)
    try {
      await onRename(renameValue)
      setIsRenaming(false)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Could not rename tag. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleRenameCancel() {
    setIsRenaming(false)
    setRenameValue(name)
    setRenameError(null)
  }

  const countLabel = recipeCount !== undefined
    ? recipeCount === 1 ? '1 recipe' : `${recipeCount} recipes`
    : '–'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 py-2">
        {/* Tag name / rename input */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameSave()
                if (e.key === 'Escape') handleRenameCancel()
              }}
              autoFocus
              className="w-full border border-stone-300 rounded-md px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-1 focus:ring-sage-500"
            />
          ) : (
            <span className={`text-sm font-medium ${variant === 'hidden' ? 'text-stone-400' : 'text-stone-700'}`}>
              {name}
            </span>
          )}
        </div>

        {/* Recipe count */}
        {!isRenaming && (
          <span className="text-xs text-stone-400 w-20 text-right flex-shrink-0">{countLabel}</span>
        )}

        {/* Actions */}
        {!readOnly && !isRenaming && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {variant === 'firstClass' && onHide && (
              <button
                type="button"
                onClick={onHide}
                className="text-xs text-stone-500 hover:text-stone-700 underline"
              >
                Hide
              </button>
            )}
            {variant === 'custom' && onRename && (
              <button
                type="button"
                onClick={() => { setIsRenaming(true); setRenameValue(name) }}
                className="text-xs text-stone-500 hover:text-stone-700 underline"
              >
                Rename
              </button>
            )}
            {variant === 'custom' && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-xs text-red-400 hover:text-red-600 underline"
              >
                Delete
              </button>
            )}
            {variant === 'hidden' && onRestore && (
              <button
                type="button"
                onClick={onRestore}
                className="text-xs text-sage-600 hover:text-sage-700 underline"
              >
                Restore
              </button>
            )}
          </div>
        )}

        {/* Rename save/cancel */}
        {isRenaming && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => void handleRenameSave()}
              disabled={isSaving || !renameValue.trim() || renameValue.trim() === name}
              className="text-xs bg-sage-500 text-white px-2.5 py-1 rounded-md hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleRenameCancel}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {renameError && (
        <p className="text-xs text-red-500 pl-0">{renameError}</p>
      )}

      {/* Inline delete confirmation */}
      {deleteConfirmCount !== undefined && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
          {deleteConfirmCount === null ? (
            <p className="text-xs text-stone-500">Checking usage…</p>
          ) : (
            <>
              <p className="text-sm font-medium text-stone-800">Delete &quot;{name}&quot;?</p>
              {deleteConfirmCount > 0 && (
                <p className="text-xs text-amber-700">
                  This tag is used on {deleteConfirmCount}{' '}
                  {deleteConfirmCount === 1 ? 'recipe' : 'recipes'} and will be removed from all of them.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onDeleteConfirm}
                  className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={onDeleteCancel}
                  className="px-3 py-1 bg-stone-200 text-stone-700 text-xs font-medium rounded-md hover:bg-stone-300"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
