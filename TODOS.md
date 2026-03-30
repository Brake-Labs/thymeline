# Forkcast — Reliability Sprint TODOs

## Priority 0: CI Pipeline (DO FIRST) — DONE

### ~~Create GitHub Actions CI workflow~~ ✅
- Completed in PR #160.

## Priority 1: Design Infrastructure — DONE

### ~~Add zod schemas for API validation~~ ✅
- `lib/schemas.ts` — 25+ schemas covering all route bodies, plus `parseBody` helper
- Wired into 7 routes: tags, share, scrape, generate, bulk, search, recipes
- 29 tests in `lib/__tests__/schemas.test.ts`
- Remaining routes can be migrated incrementally (schemas exist, just need `parseBody` calls)

### ~~Centralize auth in middleware~~ ✅
- `lib/auth.ts` — `withAuth()` HOF provides `{ user, db, ctx }` to all handlers
- Applied to all 33 authenticated routes (only `invite/validate` excluded — public)
- 6 tests in `lib/__tests__/auth.test.ts`

### ~~Add LLM resilience layer~~ ✅
- `lib/llm.ts` — centralized Anthropic client with `maxRetries: 2`, `timeout: 60_000`
- `LLMError` class with typed error codes, `classifyLLMError()`, `callLLM()`, `parseLLMJson()`
- `plan/helpers.ts` delegates to `callLLM` instead of maintaining its own client
- 38 tests in `lib/__tests__/llm.test.ts`

## Priority 2: Error Handling & UX — DONE

### ~~Add error.tsx + loading.tsx to all route groups~~ ✅
- Completed in PR #160.

### ~~Fix silent error suppression in client code~~ ✅
- Completed in PR #160.

## Priority 3: Core Test Gaps — DONE

### ~~Add buildSystemMessage() tests~~ ✅
- 26 tests covering constraint engine prompt construction.

### ~~Add LLM error path tests~~ ✅
- 38 tests in `lib/__tests__/llm.test.ts` covering `classifyLLMError`, `callLLM` error paths, `parseLLMJson` malformed input.

## Priority 4: Performance — DONE

### ~~Parallelize meal type queries~~ ✅
- Completed in PR #160.

## Deferred (after reliability sprint)

### Build shared test utilities
- **What:** Extract common Supabase mock factories and test helpers into shared utilities. Build for the new patterns (zod schemas, generated types, auth middleware).
- **Why:** ~600 lines of mock code duplicated across test files. BUT: this should wait until after Priority 1 changes land, or you'll build utilities for the old patterns.
- **Depends on:** Priority 1 (zod + auth middleware) must land first.

### Migrate remaining routes to Zod
- **What:** Wire `parseBody` into the ~20 routes that still use manual `req.json()` + if/else validation.
- **Why:** Schemas exist in `lib/schemas.ts` — routes just need to call `parseBody` instead of manual parsing.
- **Effort:** CC: ~30 min

### Generate Supabase types
- **What:** Run `supabase gen types typescript` for DB types. Replace `as unknown` casts.
- **Why:** Supabase responses are untyped. Generated types eliminate runtime cast bugs.
- **Effort:** CC: ~30 min
- **Depends on:** Supabase CLI access

### Update CLAUDE.md to reflect actual LLM usage
- **What:** Change "any-llm" reference to `@anthropic-ai/sdk`. Document actual LLM routing pattern.
- **Why:** CLAUDE.md is inaccurate. Agents reading it get confused about the LLM setup.
- **Effort:** CC: ~5 min

### Formalize design system into DESIGN.md
- **What:** Run `/design-consultation` to document the implicit design system: sage/stone/terra palette, Plus Jakarta Sans + Manrope fonts, borders-not-shadows, warm cream backgrounds (#FFFDF9), card patterns with 3px sage accent bars, button styles, section header patterns.
- **Why:** The codebase has a strong implicit design system but no documentation. As real users arrive and iteration speeds up, visual drift will creep in without a reference document. New contributors (human or AI) will introduce inconsistencies.
- **Effort:** CC: ~30 min
- **Depends on:** Reliability sprint complete (this is polish, not reliability).
