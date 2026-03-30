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

## Deferred — DONE

### ~~Build shared test utilities~~ ✅
- `test/helpers.ts` — `mockSupabase`, `mockHousehold`, `makeRequest`, `defaultMockState`, `tableMock`, `defaultGetUser`
- Refactored 3 test files (home, tags, preferences) as proof of concept
- Remaining test files can be migrated incrementally

### ~~Migrate remaining routes to Zod~~ ✅
- All routes now use `parseBody()` — zero manual `req.json()` calls remain

### ~~Update CLAUDE.md to reflect actual LLM usage~~ ✅
- Documented `lib/llm.ts`, `lib/auth.ts`, `lib/schemas.ts` patterns
- Added testing guidelines (don't duplicate auth/validation tests)

## Type Consolidation — DONE

### ~~Consolidate shared types and remove `as unknown` casts~~ ✅
- `types/index.ts` — shared const arrays (`RECIPE_CATEGORIES`, `MEAL_TYPES`, `TAG_SECTIONS`) with derived types
- `RecipeCategory` named type replaces inline unions across `Recipe`, `RecipeListItem`, `GeneratedRecipe`
- Removed duplicate `MealTypeInput` (identical to `MealType`)
- `lib/schemas.ts` Zod enums now derived from shared const arrays
- `RecipeJoinResult`, `RecipeJoinFull`, `MealPlanJoinResult` typed interfaces replace 10 `as unknown` casts in 6 files
- `generate/route.ts` uses shared `RECIPE_CATEGORIES` instead of local `VALID_CATEGORIES`

## Remaining (not in reliability sprint scope)

### Generate Supabase types
- **What:** Run `supabase gen types typescript` for full DB types.
- **Why:** Would give end-to-end type safety on Supabase queries. Currently mitigated by typed join interfaces.
- **Blocked by:** Needs `SUPABASE_ACCESS_TOKEN` or `supabase login` (not available in sandbox)

### Formalize design system into DESIGN.md
- **What:** Run `/design-consultation` to document the implicit design system.
- **Why:** Polish, not reliability. Defer to after sprint lands.
