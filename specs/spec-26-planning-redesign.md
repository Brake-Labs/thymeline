# Technical Spec — Planning UX Redesign

**Spec status:** Draft — Awaiting owner approval before Writer proceeds.
**Design doc:** `~/.gstack/projects/Brake-Labs-thymeline/katiebrake-main-design-20260410-ux-planning-redesign.md`
**Branch:** `feature/planning-redesign` from `main`
**Depends on:** Current `main` (all prior features merged)

---

## 1. Summary

Redesign the weekly planning flow from a 3-step wizard (SetupStep -> SuggestionsStep -> SummaryStep) into a 2-screen flow (ContextScreen -> SuggestionsScreen). The goals:

1. **Reduce friction** — Settings persist across weeks so most weeks are "open, hit Generate." The free text box ("anything special this week?") becomes the primary input, not the settings toggles.
2. **AI transparency** — Each day gets a one-line `whyThisDay` explanation. Each recipe option gets a `confidenceScore` (0-4) showing how well it matches preferences.
3. **Grocery integration** — "Save & Build Grocery List" as primary action collapses a 3-screen journey into one button press.
4. **Delete dead code** — Remove SummaryStep and PostSaveModal, which are replaced by the merged SuggestionsScreen.

---

## 2. DB Changes

### 2a. Add columns to `user_preferences`

```sql
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS last_active_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_active_meal_types text[] DEFAULT '{}';
```

These persist the user's last-used day selection and meal type selection from the ContextScreen collapsible panel, so next week auto-populates with the same settings.

### 2b. Update `UserPreferences` type in `types/index.ts`

Add:
```typescript
lastActiveDays: string[] | null      // e.g. ['monday','tuesday','wednesday','thursday','friday']
lastActiveMealTypes: string[] | null // e.g. ['dinner']
```

### 2c. Migration

Run `npm run db:generate` after schema change. No data migration needed — new columns have nullable/empty defaults. Existing users fall back to current behavior (all days, dinner only) when these are null/empty.

---

## 3. API Routes

### 3a. `POST /api/plan/suggest` — Extend response

**Existing route, modified.**

Add two new fields to the LLM response format:

1. **`whyThisDay: string`** on `DaySuggestions` — one-line AI explanation per day
2. **`confidenceScore: number`** (0-4) on `RecipeSuggestion` — server-computed, NOT from LLM

**Type changes in `types/index.ts`:**

```typescript
export interface DaySuggestions {
  date:       string
  mealTypes:  MealTypeSuggestions[]
  whyThisDay?: string  // NEW — AI-generated explanation
}

export interface RecipeSuggestion {
  recipeId:         string
  recipeTitle:      string
  reason?:          string
  wasteMatches?:    WasteMatch[]
  wasteBadgeText?:  string
  confidenceScore?: number  // NEW — 0-4, server-computed
}
```

**LLM prompt change:** Add to the system message format instructions:
```
For each day, also include a "whyThisDay" field: a one-sentence explanation
of why these recipes were chosen for this day, referencing the user's history,
preferences, seasonal context, or weekly context. Keep it conversational and
brief (under 20 words).
```

Update the JSON format example in `buildSystemMessage()`:
```json
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "whyThisDay": "Quick picks — you like fast meals on Mondays",
      "mealTypes": [...]
    }
  ]
}
```

**Confidence score computation** (server-side, in `helpers.ts`):

After `validateSuggestions()` runs, compute confidence for each option:

```typescript
function computeConfidence(
  recipe: RecipeForLLM,
  prefs: UserPreferences | null,
  season: string,
  freeTextMatched: boolean, // LLM flagged this recipe as matching weekly context
): number {
  let score = 0
  const preferredTags = prefs?.preferredTags ?? []
  const seasonalRules = prefs?.seasonalRules?.[season]

  // Tag overlap with preferred tags: +25 per overlap, max 50
  const tagOverlap = recipe.tags.filter(t => preferredTags.includes(t)).length
  score += Math.min(tagOverlap * 25, 50)

  // Seasonal match: +15 if recipe has a tag in seasonal favor list
  if (seasonalRules?.favor?.some(f => recipe.tags.includes(f))) {
    score += 15
  }

  // Weekly context match: +15 if LLM flagged this as matching freeText
  if (freeTextMatched) {
    score += 15
  }

  // Base score for being in the suggestion at all: +20
  score += 20

  // Map 0-100 to 0-4 bars
  return Math.min(Math.round(score / 25), 4)
}
```

Note: The design doc's `daysSinceLastMade > cooldownDays * 1.5: +20` factor requires data not currently on `RecipeSuggestion`. Since recipes are already cooldown-filtered, all suggestions have passed cooldown. Instead, give a flat +20 base score for being suggested at all (the LLM already biases toward well-rested recipes).

**`validateSuggestions()` update:** Must pass through `whyThisDay` field:

```typescript
export function validateSuggestions(
  days: DaySuggestions[],
  validIdsByMealType: Map<MealType, Set<string>>,
): DaySuggestions[] {
  return days.map((day) => ({
    date: day.date,
    whyThisDay: day.whyThisDay,  // NEW — pass through
    mealTypes: (day.mealTypes ?? []).map((mts) => ({
      mealType: mts.mealType,
      options: mts.options.filter((opt) => {
        const ids = validIdsByMealType.get(mts.mealType)
        return ids ? ids.has(opt.recipeId) : false
      }),
    })),
  }))
}
```

### 3b. `POST /api/plan/suggest/swap` — Extend response

**Existing route, modified.**

Add `whyThisSwap?: string` to the swap response:

```typescript
// Response shape
{ date: string; mealType: MealType; options: RecipeSuggestion[]; whyThisSwap?: string }
```

Add to the swap LLM prompt: "Write a one-sentence explanation of why these replacement recipes were chosen."

Parse `whyThisSwap` (or `whyThisDay`) from the LLM response and return it. The client replaces the day's explanation on swap completion.

Confidence scores are also computed server-side for swap results, same as the full suggest route.

### 3c. `PATCH /api/preferences` — Extend to persist new fields

**Existing route, modified.**

Accept `lastActiveDays` and `lastActiveMealTypes` in the request body. Write them to `user_preferences` alongside existing preference fields.

Update the Zod schema (`updatePreferencesSchema` in `lib/schemas.ts`) to accept:
```typescript
lastActiveDays: z.array(z.string()).optional()
lastActiveMealTypes: z.array(z.enum(MEAL_TYPES)).optional()
```

### 3d. `GET /api/preferences` — Return new fields

**Existing route, modified.**

Include `lastActiveDays` and `lastActiveMealTypes` in the response. Already handled if `fetchUserPreferences()` in `helpers.ts` is updated to include them.

---

## 4. UI Components

### 4a. Files to create

| File | Purpose |
|---|---|
| `components/plan/ContextScreen.tsx` | Screen 1: week context + collapsible settings panel. Replaces SetupStep. |
| `components/plan/SuggestionsScreen.tsx` | Screen 2: smart suggestions with inline confirm + grocery integration. Replaces SuggestionsStep + SummaryStep. |
| `components/plan/ConfidenceBar.tsx` | 4-segment confidence indicator (purely visual, receives `score: 0-4`). |
| `components/plan/WhyThis.tsx` | Renders the `whyThisDay` explanation text beneath the top-ranked option. |
| `components/plan/DayCard.tsx` | Single day with N options, radio select, confidence bars, swap button. Replaces SuggestionDayRow. |
| `components/plan/GroceryPreview.tsx` | Running grocery count at bottom of SuggestionsScreen ("22 items from 5 confirmed days"). |

### 4b. Files to modify

| File | Change |
|---|---|
| `app/(app)/plan/page.tsx` | Rewrite: 2-screen flow (context/suggestions) replaces 3-step wizard. Remove SummaryStep and PostSaveModal imports. Add grocery integration handler. |
| `types/index.ts` | Add `whyThisDay` to `DaySuggestions`, `confidenceScore` to `RecipeSuggestion`, `lastActiveDays`/`lastActiveMealTypes` to `UserPreferences`. |
| `app/api/plan/helpers.ts` | Update `validateSuggestions()` to pass through `whyThisDay`. Add `computeConfidence()`. Update `buildSystemMessage()` to request `whyThisDay` in LLM prompt. |
| `app/api/plan/suggest/route.ts` | Call `computeConfidence()` on validated results. |
| `app/api/plan/suggest/swap/route.ts` | Parse `whyThisSwap` from LLM response, compute confidence, return both. |
| `lib/db/schema.ts` | Add `lastActiveDays`, `lastActiveMealTypes` columns to `userPreferences`. |
| `lib/schemas.ts` | Update `updatePreferencesSchema` to accept new fields. |

### 4c. Files to delete

| File | Reason |
|---|---|
| `components/plan/SummaryStep.tsx` | Merged into SuggestionsScreen |
| `components/plan/PostSaveModal.tsx` | Replaced by inline "Save & Build Grocery List" button |

### 4d. Component details

#### `ContextScreen.tsx` (replaces SetupStep)

**Props:** `setup: PlanSetup`, `weekStartDay: number`, `onSetupChange`, `onGenerate: () => void`, `isGenerating: boolean`

**Layout:**
1. Week picker (reuse `WeekPicker.tsx`)
2. **Primary element:** Free text box — front and center, placeholder "Anything special this week?", max 300 chars with character counter. Same as current but moved above settings.
3. **Collapsible "Adjust settings" panel** (collapsed by default):
   - Active days (reuse `DayTogglePicker.tsx`)
   - Meal types (reuse `MealTypePicker.tsx`)
   - Options per day (dropdown: 1, 2, 3, 4 — reads from `prefs.optionsPerDay`)
   - Prefer this week (reuse `TagBucketPicker`)
   - Avoid this week (reuse `TagBucketPicker`)
4. **"Generate" button** — primary, full-width on mobile

**Persistence behavior:**
- On mount: load `GET /api/preferences`. Pre-populate `activeDates` from `lastActiveDays` (convert day names to dates for the selected week). Pre-populate `activeMealTypes` from `lastActiveMealTypes`.
- On generate: `PATCH /api/preferences` with current `lastActiveDays` and `lastActiveMealTypes` before calling suggest API (fire-and-forget).
- Free text does NOT persist.
- If user already has a plan for this week (check via `GET /api/plan?week_start=...`), show banner: "You already have a plan for this week. Regenerate?" with a confirm action.

#### `SuggestionsScreen.tsx` (replaces SuggestionsStep + SummaryStep)

**Props:** All current SuggestionsStep props, plus `onSaveAndGrocery: () => Promise<void>`, `onSaveOnly: () => Promise<void>`, `isSaving: boolean`

**Layout:**
- Top bar: week label + "Regenerate" button (secondary) + back arrow
- Day cards: one `DayCard` per active date, ordered chronologically
- Bottom section:
  - `GroceryPreview` — running item count from confirmed days
  - **[Save & Build Grocery List]** — primary button (sage-500)
  - **[Save Plan Only]** — secondary/text button

#### `DayCard.tsx` (replaces SuggestionDayRow)

**Props:** `date`, `mealTypes`, `whyThisDay`, `selection`, `isSwapping`, `activeDates`, event handlers

**Layout per day:**
```
MONDAY, Apr 14

● Chicken Stir Fry         ████  [checkmark]
  "Quick pick — you cook fast Mon"
○ Sheet Pan Veggies         ███░
○ One Pot Pasta             ██░░

[Swap]  [Skip]  [Pick from vault]
```

- Radio selection: pick one option per day, checkmark confirms
- `ConfidenceBar` rendered inline with each option
- `WhyThis` text shown beneath the top-ranked option only (the one with highest `confidenceScore`)
- On swap: replace `whyThisDay` with the `whyThisSwap` from the swap response
- Reuse existing `AssignDayPicker`, `VaultSearchSheet`, and free-text match functionality from current `SuggestionDayRow`

#### `ConfidenceBar.tsx`

**Props:** `score: number` (0-4)

Renders 4 segments. Filled segments use `bg-sage-500`, unfilled use `bg-stone-200`. Pure presentational component, no logic.

#### `WhyThis.tsx`

**Props:** `text: string | undefined`

Renders the explanation in `text-sm text-stone-400 italic`. If `text` is undefined/empty, renders nothing.

#### `GroceryPreview.tsx`

**Props:** `confirmedDates: string[]`, `weekStart: string`

Fetches `GET /api/groceries/count?dateFrom=...&dateTo=...` to get recipe count for confirmed dates. Displays: "N recipes from M confirmed days" with a cart icon. Updates when `confirmedDates` changes (debounced).

---

## 5. Business Logic

### 5a. Existing rules (unchanged)

All business rules from spec-05 remain in effect:
- Week start respects `weekStartDay` preference
- Past weeks disabled, 4-week future cap
- At least 1 active day required
- Cooldown filtering server-side
- LLM response validation (drop invalid recipe IDs)
- Tag caps per week (LLM responsibility)
- Upsert plan replaces all entries
- Session tag overrides merge with account preferences

### 5b. New rules

1. **Settings persistence.** On generate, persist `lastActiveDays` (as day-of-week names: "monday", "tuesday", etc.) and `lastActiveMealTypes` to `user_preferences`. On next visit, pre-populate from these saved values.

2. **Confidence score is server-computed.** Never call the LLM for confidence. Compute from tag overlap, seasonal match, and context match after the suggestion LLM call returns. Score range 0-4 (maps to filled segments in `ConfidenceBar`).

3. **`whyThisDay` is LLM-generated.** Added to the suggestion prompt. One sentence per day, not per option. ~50 tokens per day, ~350 tokens total. Acceptable cost.

4. **`whyThisDay` is replaced on swap.** When a day is swapped via `/api/plan/suggest/swap`, the new `whyThisSwap` replaces the old `whyThisDay` in the client state.

5. **Grocery integration — partial failure handling.** If plan save succeeds but grocery generation fails:
   - Redirect to `/groceries?weekStart=...&status=pending`
   - Show toast: "Plan saved! Grocery list generation failed — tap to retry."
   - The groceries page already handles the generate flow, so this is a graceful fallback.

6. **"Save & Build Grocery List" is the primary action.** "Save Plan Only" is secondary. This matches the design principle "the grocery list is the finish line."

7. **Collapsible panel defaults to collapsed.** Most weeks the user only types context and hits Generate. The panel is for the weeks where something changes.

8. **Existing plan warning.** When the user opens ContextScreen for a week that already has a saved plan, show a banner: "You already have a plan for this week. Generating will replace it." No blocking modal — just an informational notice.

---

## 6. Test Cases

| # | Test | Type |
|---|---|---|
| T01 | `lastActiveDays` and `lastActiveMealTypes` columns accept null and array values | Schema |
| T02 | `PATCH /api/preferences` persists `lastActiveDays` and `lastActiveMealTypes` | API |
| T03 | `GET /api/preferences` returns `lastActiveDays` and `lastActiveMealTypes` | API |
| T04 | ContextScreen loads and pre-populates days/meal types from saved preferences | UI |
| T05 | Free text box passes through to suggestion API | UI |
| T06 | Collapsible panel is collapsed by default | UI |
| T07 | Collapsible panel changes save to preferences on generate (fire-and-forget) | UI |
| T08 | `whyThisDay` field is included in LLM prompt format | API |
| T09 | `validateSuggestions()` preserves `whyThisDay` field (not stripped) | Unit |
| T10 | Confidence score computed correctly: tag overlap +25 (max 50), seasonal +15, context +15, base +20 | Unit |
| T11 | Confidence score clamped to 0-4 range | Unit |
| T12 | `ConfidenceBar` renders correct number of filled segments for scores 0-4 | UI |
| T13 | `WhyThis` renders explanation text; renders nothing when undefined | UI |
| T14 | SuggestionsScreen shows N options per day from preferences | UI |
| T15 | Swap replaces `whyThisDay` with `whyThisSwap` from response | UI |
| T16 | Swap response includes `confidenceScore` on each option | API |
| T17 | "Save & Build Grocery List" saves plan then calls grocery generate | UI |
| T18 | Grocery integration: if generate fails after save, redirects with `status=pending` | UI |
| T19 | "Save Plan Only" saves plan and stays on plan page (no grocery redirect) | UI |
| T20 | `GroceryPreview` shows recipe count from confirmed days | UI |
| T21 | Existing plan for week shows informational banner on ContextScreen | UI |
| T22 | Empty free text still generates suggestions (no crash) | UI |
| T23 | Radio selection highlights one option per day, dims others | UI |
| T24 | All existing functionality preserved: vault pick, free-text match, assign-to-day, skip, regenerate | UI |
| T25 | `SummaryStep.tsx` and `PostSaveModal.tsx` are deleted, no remaining imports | Cleanup |
| T26 | `plan/page.tsx` uses 2-screen flow (no `?step=summary`) | UI |

---

## 7. Out of Scope

- **Home page redesign** — home stays as-is
- **Household voting/collaboration** — deferred to V2
- **Chat/conversation-style planning** — deferred
- **Calendar view changes** — untouched
- **Recipe box changes** — no changes to recipe CRUD
- **New LLM model requirements** — uses existing `callLLM` / `callLLMNonStreaming`
- **Drag-and-drop** — not in this sprint
- **`daysSinceLastMade` on RecipeSuggestion** — the design doc mentions this for confidence scoring but the data isn't on the suggestion type and all suggestions are already cooldown-filtered. Use base score instead.
- **Side dish and dessert sub-selections** — these exist in the current flow. Preserve them as-is in the new DayCard but don't redesign them.

---

## 8. Build Order

1. **Schema + types** — Add `lastActiveDays`, `lastActiveMealTypes` to `userPreferences` in `lib/db/schema.ts`. Add `whyThisDay` to `DaySuggestions`, `confidenceScore` to `RecipeSuggestion`, new fields to `UserPreferences` in `types/index.ts`. Run `npm run db:generate`.
2. **API changes** — Update `validateSuggestions()` to pass through `whyThisDay`. Add `computeConfidence()` to `helpers.ts`. Update `buildSystemMessage()` to request `whyThisDay`. Wire confidence into suggest and swap routes. Update preference schema/endpoints.
3. **Screen 1: ContextScreen** — Build `ContextScreen.tsx`. Wire into `plan/page.tsx` replacing SetupStep. Implement settings persistence.
4. **Screen 2: SuggestionsScreen** — Build `SuggestionsScreen.tsx`, `DayCard.tsx`, `ConfidenceBar.tsx`, `WhyThis.tsx`, `GroceryPreview.tsx`. Wire into `plan/page.tsx` replacing SuggestionsStep + SummaryStep.
5. **Grocery integration** — Wire "Save & Build Grocery List" button. Handle partial failure gracefully.
6. **Delete dead code** — Remove `SummaryStep.tsx`, `PostSaveModal.tsx`. Remove all references.

---

*Awaiting owner approval before Writer proceeds.*
