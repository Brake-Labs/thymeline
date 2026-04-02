# Spec 18 — Edit Recipe with AI

**Brief:** `briefs/brief-18-ai-recipe-edit.md`
**Branch:** `feature/ai-recipe-edit` (cut from `staging`)
**Status:** Approved — Writer may proceed

---

## 1. Summary

Add an "Edit with AI" button to the recipe detail page that opens a conversational sheet. The user types requests ("no chickpeas", "make it gluten-free") and the AI returns a modified recipe that is displayed in-place. Modifications are session-only — the saved recipe is never mutated. After editing, the user can cook from the modified version or save it as a new recipe.

Also removes the "Share with community" toggle from the recipe detail page.

---

## 2. DB Changes

**None.** All modification state lives in the client. The API route uses the existing `recipes` table for ownership verification only.

---

## 3. Types (`types/index.ts`)

Add at the end of the file:

```typescript
export interface ModifiedRecipe {
  title:       string
  ingredients: string
  steps:       string
  notes:       string | null
  servings:    number | null
}

export interface AIEditMessage {
  role:    'user' | 'assistant'
  content: string
  changes?: string[]
}
```

---

## 4. Zod Schema (`lib/schemas.ts`)

Add a new export after the existing recipe schemas:

```typescript
export const aiEditSchema = z.object({
  message: z.string().min(1),
  current_recipe: z.object({
    title:       z.string(),
    ingredients: z.string(),
    steps:       z.string(),
    notes:       z.string().optional().nullable(),
    servings:    z.number().optional().nullable(),
  }),
  conversation_history: z.array(
    z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
})
```

---

## 5. API Route

### `POST /api/recipes/[id]/ai-edit`

**New file:** `app/api/recipes/[id]/ai-edit/route.ts`

Pattern: use `withAuth()` from `lib/auth.ts`, `parseBody()` from `lib/schemas.ts`, `checkOwnership()` from `lib/household.ts`, and `callLLM()` + `parseLLMJson()` from `lib/llm.ts`.

#### Implementation steps

1. Parse and validate the body with `parseBody(req, aiEditSchema)`. Return the `error` response immediately if validation fails (400).
2. Call `checkOwnership(db, 'recipes', params.id, user.id, ctx)`. Return `{ error: 'Forbidden' }` with status 403 if not owned.
3. Build the LLM messages array:
   - System message: the system prompt defined in the brief (§ LLM Prompt).
   - If `conversation_history` is empty: first-turn user message (inject `current_recipe` fields + `message`).
   - If `conversation_history` is non-empty: append prior turns, then a new user message using the subsequent-turn template (inject current state + `message`).
4. Call `callLLM({ model: LLM_MODEL_CAPABLE, system: SYSTEM_PROMPT, messages })`. Use a `try/catch` around the call; on `LLMError` return 500 with `{ error: 'AI service error' }`.
5. Parse the response with `parseLLMJson<AIEditResponsePayload>(text)`. Define a local type alias:
   ```typescript
   type AIEditResponsePayload = {
     message:     string
     changes:     string[]
     title:       string
     ingredients: string
     steps:       string
     notes:       string | null
     servings:    number | null
   }
   ```
6. Return a `NextResponse.json` with the shape from the brief:
   ```typescript
   {
     message: string
     recipe:  ModifiedRecipe
     changes: string[]
   }
   ```

#### Error responses

| Status | Condition |
|--------|-----------|
| 400 | Body validation fails (empty message, missing fields) |
| 403 | User does not own the recipe |
| 500 | LLM call or JSON parse fails |

#### Note on two-step scoping

Do not pass `scopeQuery` inline. `checkOwnership` handles the ownership check here — no additional `scopeQuery` call is needed since we're not querying recipe data in this route.

---

## 6. UI Components

### 6a. `types/index.ts`

Add `ModifiedRecipe` and `AIEditMessage` as described in §3.

### 6b. `components/recipes/ModifiedRecipeBadge.tsx` — new

Small amber pill badge.

Props: none (it is always shown when rendered).

```tsx
// Renders: amber pill "Modified for tonight"
// Style: bg-amber-100 text-amber-700 text-[11px] font-medium px-2 py-0.5 rounded-full
```

### 6c. `components/recipes/AIEditSheet.tsx` — new

Bottom sheet (mobile) / side panel (desktop) for the AI editing conversation.

**Props:**

```typescript
interface AIEditSheetProps {
  recipe:          Recipe
  isOpen:          boolean
  onClose:         () => void
  onCookModified:  (modified: ModifiedRecipe) => void
  onSaveAsNew:     (modified: ModifiedRecipe) => void
}
```

**Internal state:**

```typescript
const [currentRecipe, setCurrentRecipe]         = useState<ModifiedRecipe>(toModifiedRecipe(recipe))
const [history, setHistory]                      = useState<AIEditMessage[]>([])
const [input, setInput]                          = useState('')
const [isLoading, setIsLoading]                  = useState(false)
const [error, setError]                          = useState<string | null>(null)
const [hasModifications, setHasModifications]    = useState(false)
```

Define a helper `toModifiedRecipe(r: Recipe): ModifiedRecipe` that maps the Recipe fields to the ModifiedRecipe shape (title, ingredients, steps, notes, servings). Place it at module scope, not inside the component.

**Reset when `recipe` prop changes** (i.e. when a new recipe is passed in): `useEffect` that resets all state back to initial. Dependency: `[recipe.id]`.

**Layout:**

- Mobile: `fixed inset-x-0 bottom-0 z-50` with max-height `80vh`, rounded top corners (`rounded-t-2xl`), white background. Uses existing sheet pattern from e.g. `components/pantry/ScanPantrySheet.tsx`.
- Desktop (≥ `md`): `fixed right-0 top-0 h-full w-[400px] z-50 shadow-xl`, white background, no rounding needed on right edge.
- Backdrop: `fixed inset-0 bg-black/40 z-40` rendered behind the sheet.

**Header:**
- "Edit with AI" title (`font-display font-semibold text-stone-800`)
- Subtitle: "Changes are temporary — your saved recipe won't be affected" (`text-[11px] text-stone-400`)
- Close button (×) calls `onClose`

**Chat area** (scrollable, `flex-1 overflow-y-auto`):
- Empty state (no messages): italic placeholder text per brief.
- User messages: right-aligned, sage background (`bg-sage-100 text-stone-800`).
- Assistant messages: left-aligned, stone background (`bg-stone-100 text-stone-700`). If the message has `changes`, render them as a bulleted list below the message text.
- Loading indicator (when `isLoading`): left-aligned bubble with "Thinking…" + a simple CSS spinner or animated dots.
- Inline error (when `error` is set): `text-red-500 text-sm` message below the last assistant message. Do NOT clear `history` on error.

**Input area** (pinned to bottom of sheet above footer):
- `<textarea>` or `<input>` — "What would you like to change?" placeholder.
- Disabled while `isLoading`.
- Enter key (without shift) submits.
- "Send" button: sage primary, disabled while `isLoading` or input is empty.

**Send handler:**
1. Trim input. If empty, no-op.
2. Append `{ role: 'user', content: input }` to `history`.
3. Clear `input`, set `isLoading = true`, clear `error`.
4. `POST /api/recipes/${recipe.id}/ai-edit` with `{ message, current_recipe: currentRecipe, conversation_history: history.filter(m => m.role !== ... ) }` — pass only `role` and `content` fields (not `changes`) in the history sent to the API.
5. On success: update `currentRecipe`, append `{ role: 'assistant', content: data.message, changes: data.changes }` to `history`, set `hasModifications = true`.
6. On error: set `error = 'Something went wrong — try again.'` Keep `history` intact.
7. Always set `isLoading = false`.

**Footer actions** (shown only when `hasModifications === true`):
- "Cook from this version" — sage primary button — calls `onCookModified(currentRecipe)`.
- "Save as new recipe" — ghost sage button — calls `onSaveAsNew(currentRecipe)`.
- "Reset changes" — small link-style button (`text-stone-400 text-xs underline`) — resets `currentRecipe` to `toModifiedRecipe(recipe)`, clears `history`, sets `hasModifications = false`, clears `error`.

### 6d. `AddRecipeModal.tsx` — modify

**File:** `components/recipes/AddRecipeModal.tsx`

Add a new optional prop `prefillManual?: Partial<RecipeFormValues>` to `AddRecipeModalProps` (line 9–15).

When this prop is provided:
- Force `initialTab` to `'manual'` (override the existing default logic on line 24).
- Pass `prefillManual` as `initialValues` to the `RecipeForm` in the manual tab branch (line 210–215).

No changes to the URL tab path.

### 6e. `app/(app)/recipes/[id]/page.tsx` — modify

**File:** `app/(app)/recipes/[id]/page.tsx`

**Remove (lines 312–325):** The entire `{isOwner && (...<ShareToggle .../>...)}` block. Also remove the `ShareToggle` import if it becomes unused.

**Add state:**

```typescript
const [showAIEdit, setShowAIEdit]           = useState(false)
const [modifiedRecipe, setModifiedRecipe]   = useState<ModifiedRecipe | null>(null)
```

**Add "Edit with AI" button** inside the footer `flex` container (line 352), alongside the existing owner-only buttons. Place it between Edit and Log Made:

```tsx
{isOwner && (
  <button
    onClick={() => setShowAIEdit(true)}
    className="font-display font-medium text-[13px] text-sage-600 border border-sage-200 rounded-xl py-2 px-4 bg-white hover:bg-sage-50"
  >
    Edit with AI
  </button>
)}
```

**Display modified recipe content:** When `modifiedRecipe` is set, show modified values in place of the original recipe content. The recipe detail view renders `recipe.title`, `recipe.ingredients`, `recipe.steps`, `recipe.notes`. Compute a display version:

```typescript
const displayRecipe = modifiedRecipe
  ? { ...recipe, ...modifiedRecipe }
  : recipe
```

Use `displayRecipe` everywhere in the JSX that currently reads `recipe.title`, `recipe.ingredients`, `recipe.steps`, `recipe.notes`, `recipe.servings`. The `recipe` variable itself (the DB state) must not be mutated.

**"Modified for tonight" badge:** When `modifiedRecipe !== null`, render `<ModifiedRecipeBadge />` adjacent to the recipe title.

**Mount AIEditSheet:**

```tsx
{recipe && (
  <AIEditSheet
    recipe={recipe}
    isOpen={showAIEdit}
    onClose={() => {
      setShowAIEdit(false)
      setModifiedRecipe(null)
    }}
    onCookModified={(modified) => {
      sessionStorage.setItem(
        `ai-modified-recipe-${recipe.id}`,
        JSON.stringify(modified)
      )
      router.push(`/recipes/${recipe.id}/cook`)
    }}
    onSaveAsNew={(modified) => {
      setShowAIEdit(false)
      setSaveAsNewPrefill(modified)
      setShowAddRecipe(true)
    }}
  />
)}
```

This requires two more state variables:

```typescript
const [showAddRecipe, setShowAddRecipe]       = useState(false)
const [saveAsNewPrefill, setSaveAsNewPrefill] = useState<ModifiedRecipe | null>(null)
```

And render `AddRecipeModal` when `showAddRecipe` is true:

```tsx
{showAddRecipe && (
  <AddRecipeModal
    onClose={() => { setShowAddRecipe(false); setSaveAsNewPrefill(null) }}
    onSaved={() => { setShowAddRecipe(false); setSaveAsNewPrefill(null) }}
    getToken={getAccessToken}
    initialTab="manual"
    prefillManual={
      saveAsNewPrefill
        ? {
            title:       `${saveAsNewPrefill.title} (modified)`,
            ingredients: saveAsNewPrefill.ingredients,
            steps:       saveAsNewPrefill.steps,
            notes:       saveAsNewPrefill.notes ?? undefined,
            servings:    saveAsNewPrefill.servings !== null
                           ? String(saveAsNewPrefill.servings)
                           : '',
          }
        : undefined
    }
  />
)}
```

Note: `RecipeFormValues.servings` is `string` (see `AddRecipeModal.tsx` line 82 — `Number(values.servings)`), so convert `number | null` to `string | ''`.

**Closing the sheet** must set `modifiedRecipe` to `null` so the recipe preview reverts to the original.

**Add required imports:**
- `AIEditSheet` from `@/components/recipes/AIEditSheet`
- `ModifiedRecipeBadge` from `@/components/recipes/ModifiedRecipeBadge`
- `AddRecipeModal` (already imported if it exists in the file; add if not)
- `ModifiedRecipe` from `@/types`

Check whether `AddRecipeModal` is already imported before adding it.

### 6f. `app/(cook)/recipes/[id]/cook/page.tsx` — modify

**File:** `app/(cook)/recipes/[id]/cook/page.tsx`

After the existing recipe fetch in the `load()` function (currently lines 40–59), add a sessionStorage override:

```typescript
// Check for AI-modified version
const stored = sessionStorage.getItem(`ai-modified-recipe-${params.id}`)
if (stored) {
  try {
    const modified: ModifiedRecipe = JSON.parse(stored)
    data = { ...data, ...modified }
    setIsModified(true)
  } catch {
    // Ignore malformed sessionStorage value
  }
}
```

Add state: `const [isModified, setIsModified] = useState(false)`

Add a cleanup `useEffect` to clear the sessionStorage key on unmount:

```typescript
useEffect(() => {
  return () => {
    sessionStorage.removeItem(`ai-modified-recipe-${params.id}`)
  }
}, [params.id])
```

Add a "Modified for tonight" banner at the top of the cook view (above the step content), shown when `isModified === true`:

```tsx
{isModified && (
  <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-[12px] font-medium text-amber-700">
    Modified for tonight
  </div>
)}
```

Add import: `import type { ModifiedRecipe } from '@/types'`

---

## 7. Business Logic Rules

The Writer must enforce all of the following:

1. **Original recipe never mutated.** The `recipe` state variable in the detail page is never changed by AI edits. Only `modifiedRecipe` and `displayRecipe` are derived from modifications.

2. **Session-scoped only.** No API calls persist modification state. sessionStorage is the only cross-component storage, and only for Cook Mode handoff.

3. **sessionStorage key format:** `ai-modified-recipe-{recipe_id}`. Cook Mode clears this key on unmount.

4. **Conversation history in component state.** Never persisted. A page refresh loses the conversation.

5. **Owner-only.** "Edit with AI" button rendered only when `isOwner === true` (same guard as Edit and Delete — this is already available as a local variable in the detail page).

6. **Loading state disables input.** While `isLoading` is true, both the text input and Send button are disabled. The recipe preview does not update until the response arrives.

7. **Error handling preserves history.** If the API call fails, show the inline error message but do not clear `history` or `currentRecipe`. The user can retry.

8. **Reset changes** clears `currentRecipe` back to the original recipe props, clears `history`, sets `hasModifications = false`, and clears any `error`.

9. **Closing the sheet** reverts the recipe preview (sets `modifiedRecipe` to `null` in the parent) and dismisses the sheet. It does NOT clear sessionStorage (that's only cleared by Cook Mode on unmount).

10. **Multi-turn context.** Each send includes the full `conversation_history` up to that point plus `current_recipe` (the cumulative modified state). The API never reads previous DB state — the client owns the current version.

11. **Cook Mode reads sessionStorage on mount.** If the key is present and parseable, override the fetched recipe fields. If it is not present or malformed, Cook Mode proceeds normally with the saved recipe.

---

## 8. Test Cases

The Writer must write tests covering all 22 cases from the brief. Map them to these test files:

### `app/api/recipes/[id]/ai-edit/__tests__/route.test.ts` — new

| ID | Test |
|----|------|
| T07 | Returns 403 when user does not own the recipe |
| T20 | Returns 400 for empty `message` |
| T06* | Happy path: valid body returns `{ message, recipe, changes }` with correct shape |

*T06 also has a UI side (the fetch call); the route test covers the server side.

Test 403 via `checkOwnership` returning `{ owned: false, status: 403 }`. Mock `callLLM` to return a valid JSON string for the happy-path test.

### `components/recipes/__tests__/AIEditSheet.test.tsx` — new

| ID | Test |
|----|------|
| T04 | Clicking "Edit with AI" opens `AIEditSheet` |
| T05 | Empty state message shown before first message |
| T06 | Sending a message calls `POST /api/recipes/[id]/ai-edit` |
| T08 | AI response updates `currentRecipe` state |
| T09 | Recipe preview reflects modifications after AI response |
| T10 | "Modified for tonight" badge appears after first change |
| T11 | Second message builds on first modification (multi-turn) — check that `conversation_history` in the second request body includes the first turn |
| T17 | "Reset changes" reverts recipe to original |
| T18 | "Reset changes" clears conversation history |
| T19 | Closing the sheet reverts recipe preview to original |
| T21 | LLM failure shows inline error without losing conversation |

### `app/(app)/recipes/[id]/__tests__/page.test.tsx` (existing or new)

| ID | Test |
|----|------|
| T01 | "Edit with AI" button renders for recipe owner |
| T02 | "Edit with AI" button hidden for non-owners |
| T03 | "Share with community" toggle removed from recipe detail page |

### `app/(cook)/recipes/[id]/cook/__tests__/page.test.tsx` (existing or new)

| ID | Test |
|----|------|
| T12 | "Cook from this version" stores modified recipe in sessionStorage with key `ai-modified-recipe-{id}` |
| T13 | Cook Mode reads modified recipe from sessionStorage on mount |
| T14 | Cook Mode shows "Modified for tonight" banner when using modified recipe |
| T22 | sessionStorage key is removed on Cook Mode unmount |

### `components/recipes/__tests__/AddRecipeModal.test.tsx` (existing or new)

| ID | Test |
|----|------|
| T15 | "Save as new recipe" opens `AddRecipeModal` pre-filled with modified recipe |
| T16 | Pre-filled title is `"[Original Title] (modified)"` |

---

## 9. Out of Scope

Per brief — do not implement:
- Persisting modification history across sessions or page reloads
- Sharing modified recipes with household members in real time
- AI-suggested modifications without user prompting
- Nutritional recalculation
- Photo updates when ingredients change
- Version history / rollback to a specific prior modification state
- Applying the same modification across multiple recipes at once

---

Awaiting owner approval before Writer proceeds.
