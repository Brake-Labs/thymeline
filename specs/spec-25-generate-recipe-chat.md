# Spec 25 — Conversational Recipe Generation

**Brief:** No separate brief — enhancement to `briefs/brief-13-ai-recipe-generation.md`
**Depends on:** spec-13 (AI Recipe Generation) merged to staging
**Branch:** `feature/generate-recipe-chat` from `staging`
**Status:** Awaiting owner approval before Writer proceeds.

---

## 1. Summary

Today, "Generate with AI" produces a recipe in one shot and immediately dumps
it into the edit form. This sprint adds a conversational refinement step
**between** the initial generation and the final form — modelled on the
"Edit with AI" chat sheet (spec-18).

After the first recipe is generated, the user lands in a chat panel where they
can say things like "I don't have heavy cream", "make this gluten-free", or
"cut the prep time" and see the recipe update in real time before committing
it to their vault. When they are happy, they click **"Use this recipe"** and
the form pre-fills as before.

The original one-shot generate → form flow is replaced by:

```
GenerateRecipeTab  →  (initial generation)  →  GenerateRecipeChatPanel  →  RecipeForm
```

No changes to the database schema, the existing `POST /api/recipes/generate`
route, or the `RecipeForm` itself.

---

## 2. DB Changes

None. The refinement conversation lives entirely in component state and is
never persisted.

---

## 3. New TypeScript Types (`types/index.ts`)

Append after `GeneratedRecipe`:

```typescript
export interface GenerateRefinementMessage {
  role:     'user' | 'assistant'
  content:  string
  changes?: string[]   // populated on assistant turns; bullet list of what changed
}
```

No changes to `GeneratedRecipe` — the refinement API returns the same shape.

---

## 4. New API Route

### `POST /api/recipes/generate/refine`

**File:** `app/api/recipes/generate/refine/route.ts`

**Auth:** Authenticated session required.

**Purpose:** Apply a conversational modification to a draft generated recipe.
This is intentionally parallel to `POST /api/recipes/[id]/ai-edit` but operates
on an unsaved draft rather than a saved recipe.

**Input:**
```typescript
{
  message:              string                    // user's modification request
  current_recipe:       GeneratedRecipe           // current draft state
  conversation_history: GenerateRefinementMessage[]  // all prior turns
  generation_context: {                           // the original generation inputs
    meal_type:            string
    style_hints:          string
    dietary_restrictions: string[]
  }
}
```

**Validation:**
- `message` must be a non-empty string after trimming. Return `400` if empty.
- `current_recipe.title` must be a non-empty string. Return `400` if missing
  (indicates a malformed draft — do not attempt generation).
- `conversation_history` may be an empty array (first refinement turn).

**Behavior:**
1. Validate auth. Return `401` if not authenticated.
2. Validate the request body (see above).
3. Construct the LLM prompt (see §LLM Prompt).
4. Call via `callLLM()` from `lib/llm.ts` using `LLM_MODEL_CAPABLE`.
5. Parse the structured response with `parseLLMJson<GeneratedRefinementResponse>()`.
6. Validate returned fields using the same rules as `POST /api/recipes/generate`
   (§5 of spec-13): filter tags to `FIRST_CLASS_TAGS`, validate category,
   default numeric fields to `null` on invalid.
7. Return `200` with the updated recipe + explanation.

**Response:**
```typescript
{
  message:  string           // 1-2 sentence confirmation of what changed
  changes:  string[]         // bullet list of specific changes
  recipe:   GeneratedRecipe  // complete updated draft
}
```

**Errors:**
- `400` — empty message or malformed draft
- `401` — not authenticated
- `500` — LLM failure (log real error server-side, return generic message)

---

### LLM Prompt

**System message:**

```
You are a creative recipe developer helping a home cook refine a recipe
before they save it.

Rules:
- Make only the changes the user requests — do not alter anything else
- Be practical: suggest the best substitution if an ingredient is unavailable
- Respect any dietary restrictions already in the recipe unless the user
  asks you to change them
- Keep the recipe realistic and cookable for a home cook
- Respond conversationally — briefly confirm what you changed (1-2 sentences)
- Return the COMPLETE updated recipe — all fields, not just the changed parts
- Suggest tags only from this list: ${FIRST_CLASS_TAGS.join(', ')}

Return ONLY valid JSON with no prose or markdown:
{
  "message": "Brief confirmation of what changed (1-2 sentences)",
  "changes": ["specific change 1", "specific change 2"],
  "title": "Recipe title",
  "ingredients": "full ingredient list with modifications",
  "steps": "full steps with modifications",
  "tags": ["Tag1"],
  "category": "main_dish|breakfast|dessert|side_dish",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "totalTimeMinutes": 45,
  "inactiveTimeMinutes": null,
  "notes": "updated notes or null"
}
```

**User message — first refinement turn:**

```
I just generated a ${generation_context.meal_type} recipe with these preferences:
Style: ${generation_context.style_hints || 'none'}
Dietary restrictions: ${generation_context.dietary_restrictions.join(', ') || 'none'}

Here is the current recipe:

Title: ${current_recipe.title}
Servings: ${current_recipe.servings ?? 'not specified'}

Ingredients:
${current_recipe.ingredients}

Steps:
${current_recipe.steps}

Notes: ${current_recipe.notes ?? 'none'}

My request: ${message}
```

**User message — subsequent turns:**

```
Current recipe:

Title: ${current_recipe.title}
Servings: ${current_recipe.servings ?? 'not specified'}

Ingredients:
${current_recipe.ingredients}

Steps:
${current_recipe.steps}

Notes: ${current_recipe.notes ?? 'none'}

My new request: ${message}
```

**Conversation history:** Pass all prior turns as the `messages` array to
`callLLM()`. The system message is constant across turns. This gives the model
context about what has already been changed without needing to re-state the full
generation context on every turn.

---

## 5. New UI Component

### `components/recipes/GenerateRecipeChatPanel.tsx`

**Purpose:** The conversational refinement step shown after the initial recipe
is generated and before the user commits to the `RecipeForm`. Mirrors the UX
pattern of `AIEditSheet` (spec-18) but is embedded inline in `AddRecipeModal`
rather than a side sheet.

**Props:**
```typescript
interface GenerateRecipeChatPanelProps {
  initialRecipe:     GeneratedRecipe
  generationContext: {
    meal_type:            string
    style_hints:          string
    dietary_restrictions: string[]
  }
  onUseRecipe:    (recipe: GeneratedRecipe) => void   // user accepts, go to form
  onStartOver:    () => void                          // discard, return to generate tab
}
```

**State:**
```typescript
currentRecipe:        GeneratedRecipe           // starts as initialRecipe
conversationHistory:  GenerateRefinementMessage[]  // starts empty
inputValue:           string
isLoading:            boolean
error:                string | null
hasRefinements:       boolean   // true after first successful refinement
```

**Layout (top-to-bottom, scrollable within the modal):**

**Header area:**
- Title: "Refine your recipe"
- Subtitle: "Make any changes before saving to your vault"
- A compact read-only preview of `currentRecipe`:
  - Recipe title (bold)
  - Ingredient count: `"${ingredients.split('\n').filter(Boolean).length} ingredients"`
  - Step count: `"${steps.split('\n').filter(Boolean).length} steps"`
  - Time summary if available: e.g. `"45 min total"`
  - "View full recipe" expand/collapse chevron — expands to show full ingredient
    list and steps in a scrollable area (max-h-48, overflow-y-auto). Default: collapsed.

**Chat area:**
- Message list — scrollable (max-h-64, overflow-y-auto), anchored to bottom
- Each user message: right-aligned bubble, stone-100 background
- Each assistant message: left-aligned, sage-50 or stone-50 background
  - Shows `message` text
  - If `changes` array is non-empty: renders as a small indented bullet list
    below the message text in a slightly muted style
- Empty state (no messages yet):
  > "Not quite right? Tell me what you'd like to change.
  > For example: 'I don't have heavy cream', 'make it gluten-free',
  > 'reduce this to 2 servings', 'less spicy'"
- While loading: show a "Thinking…" animated indicator as the latest message

**Input area:**
- Text input: placeholder "What would you like to change?"
- Send button (sage primary) — disabled while `isLoading`
- Enter key submits (but Shift+Enter inserts a newline)
- Input disabled while `isLoading`

**Footer actions:**
- **"Use this recipe"** — sage primary button, full width on mobile
  - Always visible (user can accept the initial recipe without any refinement)
  - Calls `onUseRecipe(currentRecipe)`
- **"Start over"** — ghost/text link below the button
  - Calls `onStartOver()` (returns to `GenerateRecipeTab` with inputs intact)

**On submit (send message):**
1. Append `{ role: 'user', content: inputValue }` to `conversationHistory`
2. Clear `inputValue`
3. Set `isLoading = true`, `error = null`
4. Call `POST /api/recipes/generate/refine` with current state
5. On success:
   - Update `currentRecipe` with the returned `recipe`
   - Append `{ role: 'assistant', content: response.message, changes: response.changes }`
     to `conversationHistory`
   - Set `hasRefinements = true`
6. On error:
   - Append `{ role: 'assistant', content: 'Something went wrong — try again.' }`
     to `conversationHistory`
   - Set `error = 'Something went wrong — try again.'`
   - Do NOT roll back `conversationHistory` (user retains context)
7. Set `isLoading = false`

**Scroll behaviour:** After each new message (user or assistant), auto-scroll
the chat area to the bottom. Use a `useEffect` on `conversationHistory` with a
ref on the bottom sentinel element.

---

## 6. Changes to Existing Components

### `AddRecipeModal.tsx`

Add a new generation state to track which sub-step of the generate tab is active:

```typescript
type GenerateStep = 'input' | 'refining' | 'finalized'
```

Add state:
```typescript
const [generateStep, setGenerateStep] = useState<GenerateStep>('input')
const [draftRecipe, setDraftRecipe] = useState<GeneratedRecipe | null>(null)
const [generationContext, setGenerationContext] = useState<{
  meal_type: string
  style_hints: string
  dietary_restrictions: string[]
} | null>(null)
```

**Update `GenerateRecipeTab` callback:**

`GenerateRecipeTab`'s `onGenerated` prop currently receives a `GeneratedRecipe`
and the parent immediately sets `generatedRecipe` to show the `RecipeForm`. Change
this so the parent:
1. Stores the result in `draftRecipe`
2. Stores the generation context in `generationContext` (requires `GenerateRecipeTab`
   to pass context back — see §6a)
3. Sets `generateStep = 'refining'` to show `GenerateRecipeChatPanel`

**Tab body rendering — generate tab:**

```
generateStep === 'input'    → <GenerateRecipeTab ... />
generateStep === 'refining' → <GenerateRecipeChatPanel ... />
generateStep === 'finalized'→ <AIGeneratedBadge /> + <RecipeForm ... />
```

When `generateStep === 'finalized'`:
- Show `<AIGeneratedBadge />` above the form (same as spec-13)
- Show "Regenerate" button (ghost, small) — clicking it sets
  `generateStep = 'input'`, clears `draftRecipe` and `generationContext`
  (returns to the input form; existing `initialGenerateIngredients`
  and `initialPantryEnabled` props still seed the tab on remount)

**`GenerateRecipeChatPanel` wiring:**

```tsx
{generateStep === 'refining' && draftRecipe && generationContext && (
  <GenerateRecipeChatPanel
    initialRecipe={draftRecipe}
    generationContext={generationContext}
    onUseRecipe={(recipe) => {
      setDraftRecipe(recipe)
      setGenerateStep('finalized')
    }}
    onStartOver={() => {
      setGenerateStep('input')
      setDraftRecipe(null)
      setGenerationContext(null)
    }}
  />
)}
```

**Tab state preservation:** `generateStep`, `draftRecipe`, and `generationContext`
all survive tab switches within a single modal open/close cycle. They are cleared
only on modal close (existing `onClose` handler). This preserves the in-progress
refinement if the user accidentally taps to another tab and back.

### 6a. `GenerateRecipeTab.tsx` — surface generation context

Update the `onGenerated` callback signature to also pass the generation context,
so `AddRecipeModal` can forward it to `GenerateRecipeChatPanel`:

```typescript
onGenerated: (recipe: GeneratedRecipe, context: {
  meal_type: string
  style_hints: string
  dietary_restrictions: string[]
}) => void
```

The tab already has all three values in its local state — pass them alongside
the recipe in the callback.

---

## 7. Business Logic Rules

1. **Refinement conversation is never persisted.** All turns live in component
   state. Refreshing the page or closing the modal clears everything — the user
   starts fresh.

2. **Initial recipe is never mutated.** `GenerateRecipeChatPanel` holds its own
   `currentRecipe` state. `AddRecipeModal`'s `draftRecipe` is only updated
   when the user clicks "Use this recipe" (via `onUseRecipe`). The original
   generated recipe held by the tab is not touched.

3. **"Use this recipe" is always available.** The user can accept the initial
   generated recipe without any refinement. `onUseRecipe` is wired from the
   first render of `GenerateRecipeChatPanel`.

4. **"Start over" returns to the input form with inputs intact.** `onStartOver`
   sets `generateStep = 'input'`. `GenerateRecipeTab` remounts with its original
   `initialIngredients` / `initialPantryEnabled` props (from the modal) as
   one-time seeds, but its internal state was already initialised on first mount
   and is only reset on modal close — so if the user just came back from
   refinement, the inputs they typed are still there.

   Implementation note: since `GenerateRecipeTab` unmounts during `'refining'`
   and `'finalized'` steps, its state is lost. To preserve input state across
   the `'input' → 'refining' → 'input'` round trip, lift the generate tab's
   form values into `AddRecipeModal` state, or keep the tab mounted but
   hidden via CSS (`display: none`) during the refine/finalized steps.
   **Preferred approach:** keep `GenerateRecipeTab` always-mounted and
   CSS-hidden when `generateStep !== 'input'`. This is simpler and avoids
   prop-drilling the full form state.

5. **Tag and category validation is server-side.** The refinement route applies
   the same `FIRST_CLASS_TAGS` filter and category validation as the original
   generate route. The client renders whatever the server returns.

6. **Loading state disables input.** While `isLoading` is true in
   `GenerateRecipeChatPanel`, the text input and send button are disabled.
   The "Use this recipe" and "Start over" buttons remain interactive — the user
   can accept or discard at any time, including mid-request. If the user clicks
   "Use this recipe" or "Start over" while a request is in flight, the in-flight
   request should be abandoned (abort the fetch using `AbortController`).

7. **Error handling preserves conversation.** On LLM failure, an error message
   is appended to the chat as an assistant turn. The `conversationHistory` is
   not rolled back — the user retains all prior context and can retry the same
   or a different request.

8. **`generateStep` survives tab switches.** If the user is in `'refining'`
   state and taps the "From URL" tab, then taps "Generate with AI" again, the
   chat panel is restored exactly as left. This is handled by the always-mounted
   approach for `GenerateRecipeTab` (rule 4) and normal React state retention
   for `GenerateRecipeChatPanel`.

---

## 8. Test Cases

| # | Test case | File hint |
|---|---|---|
| T01 | After `onGenerated` fires, `AddRecipeModal` shows `GenerateRecipeChatPanel`, not `RecipeForm` | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T02 | `GenerateRecipeChatPanel` renders initial recipe title and ingredient/step counts | `components/recipes/__tests__/GenerateRecipeChatPanel.test.tsx` |
| T03 | Empty state prompt shown before first message | same |
| T04 | Sending a message calls `POST /api/recipes/generate/refine` | same |
| T05 | `POST /api/recipes/generate/refine` returns `400` for empty message | `app/api/recipes/generate/refine/__tests__/refine.test.ts` |
| T06 | `POST /api/recipes/generate/refine` returns `400` for missing `current_recipe.title` | same |
| T07 | `POST /api/recipes/generate/refine` returns `401` for unauthenticated request | same |
| T08 | `POST /api/recipes/generate/refine` returns `500` on LLM failure | same |
| T09 | Successful refinement updates `currentRecipe` in panel state | `components/recipes/__tests__/GenerateRecipeChatPanel.test.tsx` |
| T10 | Assistant response appended to chat with `message` text and `changes` bullets | same |
| T11 | User message appended to chat before request fires | same |
| T12 | Input cleared after send | same |
| T13 | Input and send button disabled while `isLoading` | same |
| T14 | LLM failure appends error message to chat without losing conversation history | same |
| T15 | Second refinement turn sends full `conversation_history` (multi-turn context) | `app/api/recipes/generate/refine/__tests__/refine.test.ts` |
| T16 | "Use this recipe" calls `onUseRecipe` with `currentRecipe` (not `initialRecipe`) | `components/recipes/__tests__/GenerateRecipeChatPanel.test.tsx` |
| T17 | "Use this recipe" available before any refinement (no messages required) | same |
| T18 | "Start over" calls `onStartOver` | same |
| T19 | After "Use this recipe", `AddRecipeModal` shows `RecipeForm` pre-filled with refined recipe | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T20 | After "Start over", `AddRecipeModal` returns to `GenerateRecipeTab` | same |
| T21 | `generateStep` survives switching to URL tab and back | same |
| T22 | `GenerateRecipeTab` form inputs preserved after returning from `'refining'` (always-mounted) | same |
| T23 | Tags from refinement response filtered to `FIRST_CLASS_TAGS` | `app/api/recipes/generate/refine/__tests__/refine.test.ts` |
| T24 | Chat scrolls to bottom after each new message | `components/recipes/__tests__/GenerateRecipeChatPanel.test.tsx` |
| T25 | "View full recipe" expand/collapse toggles ingredient+step list | same |
| T26 | In-flight refine request is aborted when user clicks "Use this recipe" | same |
| T27 | In-flight refine request is aborted when user clicks "Start over" | same |
| T28 | Closing the modal clears `generateStep`, `draftRecipe`, `generationContext` | `components/recipes/__tests__/AddRecipeModal.test.tsx` |

---

## 9. Out of Scope

- Persisting refinement conversation history across sessions or page refreshes
- Streaming the refinement response token-by-token (deferred — same as spec-13)
- Surfacing refinement in the "Regenerate" flow on the recipe detail page
  (the Regenerate button still opens the modal at the input step, not the chat step)
- Proactive AI suggestions during refinement (AI asking clarifying questions
  without user prompting)
- Displaying a full side-by-side diff of what changed between recipe versions
- Undo/redo within the refinement session
- Sharing in-progress refinement state with household members

---

Awaiting owner approval before Writer proceeds.
