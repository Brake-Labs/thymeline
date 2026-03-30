# Forkcast — Reliability Sprint TODOs

## Priority 0: CI Pipeline (DO FIRST)

### Create GitHub Actions CI workflow
- **What:** `.github/workflows/test.yml` — runs `vitest run` on push/PR
- **Why:** No CI exists. 1,010+ tests run locally but never automatically. Regressions go undetected.
- **Effort:** CC: ~10 min
- **Depends on:** Nothing — do this first, before any other changes.

## Priority 1: Design Infrastructure

### Add zod schemas for API validation + generate Supabase types
- **What:** Add `zod` for runtime validation on all API routes. Run `supabase gen types typescript` for DB types. Replace `as unknown` casts with generated types. Prune ~100 redundant validation tests.
- **Why:** Every route manually checks request bodies with if/else. Supabase responses are untyped (`as unknown as { title: string }`). ~40% of existing tests compensate for this gap.
- **Effort:** CC: ~2 hrs
- **Depends on:** CI pipeline (so pruned tests don't silently break)

### Centralize auth in middleware
- **What:** Create `withAuth()` wrapper or Next.js middleware. Replace per-route auth boilerplate. Prune ~20 per-route auth tests.
- **Why:** Auth check copy-pasted across 34 routes. One place to get auth right instead of 34.
- **Effort:** CC: ~1 hr
- **Depends on:** CI pipeline

### Add LLM resilience layer
- **What:** Single Anthropic client with retry (exponential backoff), timeout, structured errors. Consolidate duplicate clients (`lib/llm.ts` + `plan/helpers.ts`). Distinguish rate limit / bad response / service down.
- **Why:** LLM calls are the most failure-prone dependency and the core feature. Silent failures break the value prop.
- **Effort:** CC: ~45 min
- **Depends on:** CI pipeline

## Priority 2: Error Handling & UX

### Add error.tsx + loading.tsx to all route groups
- **What:** Create error.tsx (error boundary with retry) and loading.tsx (skeleton/spinner) for all 13+ route groups.
- **Why:** Zero exist. Runtime errors show blank white page. Page transitions freeze without loading indicators.
- **Effort:** CC: ~15 min
- **Depends on:** Nothing — can be done in parallel with Priority 1

### Fix silent error suppression in client code
- **What:** Replace empty catch blocks with error state + retry UI on every page with API calls. Critical: preferences form (changes appear saved but aren't), recipe detail, plan page, recipe search.
- **Why:** Users get no feedback when API calls fail. Preferences form silently losing changes is a data loss bug.
- **Effort:** CC: ~45 min
- **Depends on:** Error boundaries (Priority 2, item above)

## Priority 3: Core Test Gaps

### Add buildSystemMessage() tests
- **What:** Comprehensive tests for the constraint engine's prompt construction: avoided tags, preferred tags, tag caps, seasonal rules (winter vs summer), options_per_day. Pure function — no mocks needed.
- **Why:** This is the heart of Forkcast's value prop (constraint enforcement) and has ZERO tests. If it has a bug, the LLM ignores user constraints silently.
- **Effort:** CC: ~15 min
- **Depends on:** Nothing — pure function tests

### Add LLM error path tests
- **What:** Test callLLMNonStreaming with malformed JSON, empty response, rate limit simulation. Test validateSuggestions with missing meal_types field.
- **Why:** LLM responses are non-deterministic. Error paths are the most likely failure mode.
- **Effort:** CC: ~15 min
- **Depends on:** LLM resilience layer (Priority 1)

## Priority 4: Performance

### Parallelize meal type queries
- **What:** Change `fetchRecipesByMealTypes()` from sequential to parallel (`Promise.all`). Deduplicate the history query (same for all meal types).
- **Why:** Multi-meal-type plan generation does 8 sequential DB round-trips. Parallelization halves the wait.
- **Effort:** CC: ~15 min
- **Depends on:** Nothing

## Deferred (after reliability sprint)

### Build shared test utilities
- **What:** Extract common Supabase mock factories and test helpers into shared utilities. Build for the new patterns (zod schemas, generated types, auth middleware).
- **Why:** ~600 lines of mock code duplicated across test files. BUT: this should wait until after Priority 1 changes land, or you'll build utilities for the old patterns.
- **Depends on:** Priority 1 (zod + auth middleware) must land first.

### Update CLAUDE.md to reflect actual LLM usage
- **What:** Change "any-llm" reference to `@anthropic-ai/sdk`. Document actual LLM routing pattern.
- **Why:** CLAUDE.md is inaccurate. Agents reading it get confused about the LLM setup.
- **Effort:** CC: ~5 min

### Formalize design system into DESIGN.md
- **What:** Run `/design-consultation` to document the implicit design system: sage/stone/terra palette, Plus Jakarta Sans + Manrope fonts, borders-not-shadows, warm cream backgrounds (#FFFDF9), card patterns with 3px sage accent bars, button styles, section header patterns.
- **Why:** The codebase has a strong implicit design system but no documentation. As real users arrive and iteration speeds up, visual drift will creep in without a reference document. New contributors (human or AI) will introduce inconsistencies.
- **Effort:** CC: ~30 min
- **Depends on:** Reliability sprint complete (this is polish, not reliability).
