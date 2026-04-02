# Brief 18 — Edit Recipe with AI

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/ai-recipe-edit`
**Target:** PR into `main`
**Depends on:** Briefs 01–07 merged to main

---

## User Story

As a Thymeline user, I want to quickly tweak a recipe using AI conversation —
"I don't have chickpeas", "my daughter hates spice", "I want to make this
gluten-free" — and cook from the modified version tonight, without permanently
changing my saved recipe. If the tweak turns out to be a keeper, I can save it
as a new recipe.

---

## Changes to Recipe Detail Page

### Remove
- Remove the "Share with community" toggle from the recipe detail page footer.

### Add — "Edit with AI" button
- Add an "Edit with AI" button in the recipe footer alongside Edit and Delete
- Owner only (same visibility rules as Edit/Delete)
- Style: ghost sage button
- Clicking opens the AI Edit Sheet

---

## AI Edit Sheet

A bottom sheet (mobile) or side panel (desktop) that opens alongside the recipe
detail page. The original recipe remains visible behind/beside it.

### Layout

**Header:**
- Title: "Edit with AI"
- Subtitle: "Changes are temporary — your saved recipe won't be affected"
- Close (×) button

**Chat area:**
- Message history (user messages + AI responses)
- Empty state: "Tell me what you'd like to change. For example: 'I don't have
  chickpeas', 'make it less spicy', 'make it gluten-free', 'I only have 2
  chicken breasts instead of 4'"
- AI responses show the specific changes made, not the full recipe

**Input area:**
- Text input: "What would you like to change?"
- Send button (sage primary)
- Enter key sends message

**Footer actions (shown after first modification):**
- "Cook from this version" button (sage primary) — opens Cook Mode with the
  modified recipe
- "Save as new recipe" button (ghost sage) — opens RecipeForm pre-filled with
  the modified recipe
- "Reset changes" link — reverts all AI modifications, returns to original

### Behavior

**Conversation flow:**
1. User types a modification request
2. AI responds with a brief confirmation of what it changed:
   "Done — I substituted black beans for chickpeas throughout. I also adjusted
   the seasoning to complement the beans."
3. The recipe preview (visible alongside or behind the sheet) updates in real
   time to reflect the changes
4. User can continue the conversation: "Actually can you also reduce the chili
   to make it milder?"
5. AI applies the new change on top of previous changes
6. This continues until the user is happy

**Multi-turn context:**
- The full modification history is maintained in the session
- Each AI turn is aware of all previous changes
- The AI works on the cumulative modified recipe, not the original

**Recipe preview updates:**
- As modifications are confirmed, the recipe detail view updates to show the
  current modified version
- A subtle "Modified" badge appears on the recipe title when changes are active
- The original recipe is stored in session state — never mutated

---

## API Route

### `POST /api/recipes/[id]/ai-edit`

**Auth:** Authenticated session required. User must own the recipe.

**Input:**
```typescript
{
  message:          string           // the user's modification request
  current_recipe:   {                // the current state of the recipe
    title:       string
    ingredients: string
    steps:       string
    notes?:      string
    servings?:   number
  }
  conversation_history: {            // all previous turns
    role:    'user' | 'assistant'
    content: string
  }[]
}
```

**Behavior:**
1. Verify the user owns the recipe (403 if not)
2. Build the prompt (see §LLM Prompt)
3. Call LLM via `callLLM()` from `lib/llm.ts` using `LLM_MODEL_CAPABLE`
4. Parse the structured response
5. Return the modified recipe fields + a short explanation message

**Response:**
```typescript
{
  message:       string    // brief explanation of what changed
  recipe: {
    title:       string
    ingredients: string
    steps:       string
    notes:       string | null
    servings:    number | null
  }
  changes: string[]        // bullet list of specific changes made
}
```

**Errors:**
- `400` — empty message
- `403` — user does not own recipe
- `500` — LLM failure

---

## LLM Prompt

### System message

```
You are a helpful cooking assistant making real-time modifications to a recipe
based on the cook's needs tonight.

Rules:
- Make only the changes the user requests — don't alter anything else
- Be practical: suggest the best substitution if an ingredient is missing
- Keep the recipe realistic and cookable
- Respond conversationally — briefly confirm what you changed
- Return the COMPLETE modified recipe, not just the changed parts

Return ONLY valid JSON with no prose, preamble, or markdown fences:
{
  "message": "Brief confirmation of what changed (1-2 sentences)",
  "changes": ["specific change 1", "specific change 2"],
  "title": "Recipe title (unchanged unless user asked to rename)",
  "ingredients": "full ingredient list with modifications applied",
  "steps": "full steps with modifications applied",
  "notes": "updated notes or null",
  "servings": 4
}
```

### User message (first turn)

```
Here is the recipe I'm cooking tonight:

Title: {title}
Servings: {servings}

Ingredients:
{ingredients}

Steps:
{steps}

Notes: {notes}

My request: {user_message}
```

### User message (subsequent turns)

```
Current recipe state:

Title: {current_title}
Servings: {current_servings}

Ingredients:
{current_ingredients}

Steps:
{current_steps}

My new request: {user_message}
```

---

## UI Components

**`components/recipes/AIEditSheet.tsx`** — new component

Props:
```typescript
{
  recipe:   Recipe
  isOpen:   boolean
  onClose:  () => void
  onCookModified:    (modifiedRecipe: ModifiedRecipe) => void
  onSaveAsNew:       (modifiedRecipe: ModifiedRecipe) => void
}
```

State:
- `currentRecipe: ModifiedRecipe` — starts as the original, updated with each AI turn
- `conversationHistory: Message[]`
- `isLoading: boolean`
- `hasModifications: boolean`

**`components/recipes/ModifiedRecipeBadge.tsx`** — small badge

Shown on the recipe title when `hasModifications === true`:
- Style: amber pill badge, "Modified for tonight"
- Disappears when sheet is closed or changes are reset

**Updates to `app/(app)/recipes/[id]/page.tsx`:**
- Remove "Share with community" toggle
- Add "Edit with AI" button (owner only)
- Manage `AIEditSheet` open/close state
- When sheet is open: show modified recipe content in the main view
- When sheet is closed: revert to original recipe content

**`types/index.ts`** — add:
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

## Cook Mode Integration

When "Cook from this version" is clicked:
- Navigate to `/recipes/[id]/cook` with the modified recipe passed as state
  (or via URL-safe serialization)
- Cook Mode renders the modified recipe instead of the saved original
- A "Modified for tonight" banner appears at the top of Cook Mode
- The original recipe is not affected

Implementation: pass the modified recipe via `sessionStorage` keyed by recipe
ID, cleared when Cook Mode exits. Cook Mode checks for a session-modified
version on mount.

---

## Save as New Recipe

When "Save as new recipe" is clicked:
- Open `AddRecipeModal` in Manual tab, pre-filled with the modified recipe
- Title pre-filled as: "[Original Title] (modified)" — user can change it
- `source` field set to `'manual'` (it's now the user's own recipe)
- User edits and saves normally via existing flow

---

## Business Logic

1. **Original recipe is never mutated** — the saved recipe in the DB is never
   touched by this feature. All modifications exist in component state only.

2. **Session is per-page-visit** — closing the sheet or navigating away clears
   all modifications. The next time the user opens the recipe, it shows the
   original.

3. **Cook Mode receives modified recipe via sessionStorage** — keyed as
   `ai-modified-recipe-{recipe_id}`. Cook Mode checks for this on mount and
   uses it if present. Cleared on Cook Mode unmount.

4. **Conversation history stays in component state** — not persisted. Refresh
   = start over.

5. **"Edit with AI" is owner-only** — non-owners viewing a shared recipe (e.g.
   household members viewing someone else's recipe) cannot use this feature.
   They see only the Edit/Delete buttons for recipes they own.

6. **Loading state** — while the AI is processing, the input is disabled and
   a "Thinking…" indicator appears in the chat. The recipe preview does not
   update until the response arrives.

7. **Error handling** — if the LLM call fails, show an inline error in the
   chat: "Something went wrong — try again." Keep the conversation history
   intact so the user doesn't lose context.

8. **"Reset changes"** — clears `currentRecipe` back to the original,
   clears `conversationHistory`, sets `hasModifications` to false. The recipe
   view reverts to the original.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | "Edit with AI" button renders for recipe owner |
| T02 | "Edit with AI" button hidden for non-owners |
| T03 | "Share with community" toggle removed from recipe detail page |
| T04 | Clicking "Edit with AI" opens AIEditSheet |
| T05 | Empty state message shown before first message |
| T06 | Sending a message calls POST /api/recipes/[id]/ai-edit |
| T07 | POST /api/recipes/[id]/ai-edit returns 403 for non-owner |
| T08 | AI response updates currentRecipe state |
| T09 | Recipe preview reflects modifications after AI response |
| T10 | "Modified for tonight" badge appears after first change |
| T11 | Second message builds on first modification (multi-turn) |
| T12 | "Cook from this version" stores modified recipe in sessionStorage |
| T13 | Cook Mode reads modified recipe from sessionStorage |
| T14 | Cook Mode shows "Modified for tonight" banner when using modified recipe |
| T15 | "Save as new recipe" opens AddRecipeModal pre-filled with modified recipe |
| T16 | Saved new recipe has title "[Original] (modified)" |
| T17 | "Reset changes" reverts recipe to original |
| T18 | "Reset changes" clears conversation history |
| T19 | Closing the sheet reverts recipe preview to original |
| T20 | POST /api/recipes/[id]/ai-edit returns 400 for empty message |
| T21 | LLM failure shows inline error without losing conversation |
| T22 | sessionStorage key cleared on Cook Mode unmount |

---

## Out of Scope

- Persisting modification history across sessions
- Sharing modified recipes with household members in real time
- AI-suggested modifications (proactive suggestions without user prompting)
- Nutritional recalculation after modifications
- Photo updates when ingredients change
- Version history / rollback to previous modification states
- Applying the same modification across multiple recipes at once
