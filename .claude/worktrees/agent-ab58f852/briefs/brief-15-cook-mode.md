# Brief 15 — Cook Mode

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/cook-mode`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07 merged to staging

---

## User Story

As a Forkcast user, I want a dedicated cooking view for my recipes — large text,
one step at a time, timers I can set per step, step photos, voice control, and
my screen staying on — so I can cook without squinting at my phone or constantly
tapping to keep it awake.

---

## Core Concept

Cook Mode is a focused, distraction-free cooking experience at
`/recipes/[id]/cook`. It is optimized for use while actively cooking:
large text, minimal UI chrome, touch-friendly controls, screen keep-awake,
and all the tools needed in one place (steps, ingredients, timers, servings,
voice control).

Cook Mode is read-only — no editing. At the end, a "Log Made Today" prompt
is shown.

---

## Screen Layout

### Entry

- "Start Cooking" button on the recipe detail page (`/recipes/[id]`)
- Links to `/recipes/[id]/cook`
- Only shown when the recipe has at least one step
- Pre-selected servings default to `recipe.servings ?? 4`

### Page structure

`/recipes/[id]/cook` — `'use client'` page. Full viewport, no standard app nav
(nav is hidden in cook mode). Custom minimal header only.

**Header (slim, always visible):**
- Left: back arrow linking to `/recipes/[id]` with "Exit cook mode" label
- Center: recipe title (truncated if long), Plus Jakarta Sans 500
- Right: servings scaler + wake lock indicator
- Background: forest green (#1F2D26), white text

**Body:** two tabs — "Steps" (default) and "Ingredients"

**Footer (always visible):**
- Current step indicator: "Step 2 of 8" (one-step view only)
- Previous / Next buttons (one-step view only)
- "Log Made Today" button — shown on final step or in scroll view

**Floating mic button:**
- Bottom-right corner, above footer
- Tap and hold to activate voice control
- Hidden if Web Speech API not supported

---

## Features

### 1. Steps — Two Views

Toggle via segmented control: "One at a time" (default) / "All steps"

**One at a time view:**
- One step, large and centered
- Step number badge (sage circle, white text) top-left
- Step photo (if present): full width, max-height 240px, object-fit cover,
  rounded corners — above step text. No placeholder if absent.
- Step text: Manrope, 20px, line-height 1.7, generous padding
- Previous / Next buttons (min 56px height)
- Previous disabled on step 1; Next replaced by "Done" on final step
- Swipe left/right to navigate (mobile)
- Dot progress indicators below step text

**All steps (scroll) view:**
- All steps listed vertically with photos
- Current step: sage left border
- Completed steps: 50% opacity

**Per-step timer:**
- "Set timer" button (clock icon) per step
- Time picker: minutes + seconds (+/- buttons)
- Countdown display with Start / Pause / Reset
- At zero: 3-tone Web Audio chime + "Time's up!" banner for 3 seconds
- Multiple timers run simultaneously, persist across step navigation
- In-memory only — not persisted across page reloads

### 2. Ingredient Checklist

"Ingredients" tab — full checklist with scaled quantities.

- Tappable rows with checkbox — struck-through when checked
- Quantities scaled to current servings in real time
- "Check all" / "Uncheck all" toggle
- In-memory only

### 3. Servings Scaler

Compact header control: − 4 servings +

- Min 1, no max. Default: recipe.servings ?? 4
- Rescales all ingredient quantities in real time via lib/scale-ingredients.ts
- Lines with no leading quantity displayed unchanged

**Fraction display rules:**
- 0.25 → "1/4", 0.333 → "1/3", 0.5 → "1/2", 0.666 → "2/3", 0.75 → "3/4"
- Whole numbers → integer, mixed: 1.5 → "1 1/2"
- ≤0.125 or no clean fraction → 1 decimal place

### 4. Screen Keep-Awake

navigator.wakeLock API.

- Request on mount, release on unmount
- Fail silently if unsupported
- Re-acquire once on visibilitychange to visible if previously held
- Subtle indicator in header when active

### 5. Step Photos

Stored in recipe.step_photos: { stepIndex: number, imageUrl: string }[]

**Sources:**
- Scraped from recipe URLs (see Scrape Changes)
- Uploaded manually per step in RecipeForm (see Recipe Form Changes)

**Cook Mode display:**
- Show above step text when stepIndex matches current step
- No placeholder if absent

### 6. Voice Control (Push-to-Talk)

Floating mic button — tap and hold to listen, release to process.
Uses Web Speech API. Hidden if unsupported.

**Commands:**

| Spoken | Action |
|--------|--------|
| "Next" / "Next step" | Advance one step |
| "Back" / "Previous" / "Go back" | Previous step |
| "Set timer for X minutes" | Start timer (X min, 0 sec) |
| "Set timer for X minutes and Y seconds" | Start timer (X min, Y sec) |
| "Check [ingredient name]" | Check off closest matching ingredient |
| "Read step" / "Read this step" | Read step aloud via Speech Synthesis |

- Keyword/regex parsing — no LLM needed
- Unknown command: "Didn't catch that" toast for 2 seconds

### 7. Log Made Today

- One-at-a-time: button on final step
- Scroll: sticky banner at bottom
- Calls POST /api/recipes/[id]/log
- already_logged: false → "✓ Logged" then "Exit Cook Mode →"
- already_logged: true → "Already logged today"

---

## DB Changes

```sql
alter table recipes
  add column if not exists step_photos jsonb not null default '[]';
  -- [{ "stepIndex": 0, "imageUrl": "https://..." }]
```

Migration number: Architect to assign.

TypeScript — add to Recipe:
```typescript
step_photos: { stepIndex: number, imageUrl: string }[]
```

---

## Scrape Changes

Add to LLM prompt:
```
- "stepPhotos": [{ "stepIndex": number, "imageUrl": string }], 0-based. [] if none.
```

Return in scrape response. Save to step_photos on recipe create.

---

## Recipe Form Changes

Per-step photo upload in steps section:
- "Add photo" button per step line
- File picker (images only)
- Upload to Supabase Storage: recipe-step-photos/{user_id}/{recipe_id}/{stepIndex}
- Architect to confirm bucket + RLS setup
- Existing photo shows thumbnail + "Remove"
- step_photos included in POST/PATCH payloads

---

## API Changes

POST /api/recipes, PATCH /api/recipes/[id]: accept and save step_photos.
GET /api/recipes/[id]: return step_photos.
No new API routes needed.

---

## Component / File Structure

```
app/(app)/recipes/[id]/cook/page.tsx
components/cook/CookHeader.tsx
components/cook/StepView.tsx
components/cook/SingleStepView.tsx
components/cook/ScrollStepView.tsx
components/cook/StepTimer.tsx
components/cook/IngredientChecklist.tsx
components/cook/ServingsScaler.tsx
components/cook/VoiceControl.tsx
lib/scale-ingredients.ts
```

---

## Business Logic

1. Nav hidden in cook mode — Architect to spec cleanest approach
2. Scaling is client-side only — original data never modified
3. Multiple timers keyed by step index, cleaned up on unmount
4. Wake lock re-acquisition: once on visibilitychange, not indefinitely
5. Swipe navigation: 50px threshold, one-at-a-time view only
6. Voice unknown command: toast only, never crash
7. stepIndex is 0-based (line index of steps split by newline)
8. Supabase Storage bucket needed — Architect to spec RLS

---

## Test Cases

| # | Test case |
|----|-----------|
| T01 | "Start Cooking" renders when steps exist |
| T02 | "Start Cooking" hidden when no steps |
| T03 | Cook page loads, shows title in header |
| T04 | Default: one-at-a-time, first step shown |
| T05 | "Next" advances step; indicator updates |
| T06 | "Previous" disabled on step 1 |
| T07 | "Next" → "Done" on final step |
| T08 | Toggle to scroll shows all steps |
| T09 | Toggle back to one-at-a-time returns to current step |
| T10 | Dot progress reflects current step |
| T11 | Servings defaults to recipe.servings |
| T12 | Increasing servings scales quantities |
| T13 | "2 cups flour" at 2x → "4 cups flour" |
| T14 | "1/2 tsp salt" at 2x → "1 tsp salt" |
| T15 | "Salt to taste" → unchanged |
| T16 | Ingredient checklist renders all ingredients |
| T17 | Tapping ingredient checks it off |
| T18 | "Check all" checks every ingredient |
| T19 | "Uncheck all" clears all checks |
| T20 | "Set timer" button renders per step |
| T21 | Timer counts down after start |
| T22 | Timer persists across step navigation |
| T23 | Timer at zero → "Time's up!" shown |
| T24 | Wake lock requested on mount |
| T25 | Wake lock released on unmount |
| T26 | "Log Made Today" on final step |
| T27 | Log button calls POST /api/recipes/[id]/log |
| T28 | Success → "✓ Logged" |
| T29 | already_logged → "Already logged today" |
| T30 | scaleIngredients doubles quantities at 2x |
| T31 | Handles mixed numbers (1 1/2 → 3) |
| T32 | Returns clean fractions (0.5 → "1/2") |
| T33 | AppNav not rendered on cook route |
| T34 | Step photo renders above step text when present |
| T35 | No photo space when step has no photo |
| T36 | Scrape returns stepPhotos array |
| T37 | step_photos saved on POST /api/recipes |
| T38 | step_photos returned on GET /api/recipes/[id] |
| T39 | Mic button hidden when SpeechRecognition unsupported |
| T40 | "Next" command fires NextStep |
| T41 | "Set timer for 5 minutes" fires SetTimer { minutes: 5, seconds: 0 } |
| T42 | Unknown command shows "Didn't catch that" toast |
| T43 | "Read step" triggers speech synthesis |

---

## Out of Scope

- Wake word detection (future brief)
- Syncing cook progress across devices
- Offline mode / service worker caching
- Cook history beyond the log entry
- Real-time household cook mode sharing
- AirPlay / Chromecast
- Video per step
