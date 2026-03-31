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

## Code Quality Sprint — DONE

### ~~Fix household scoping bugs~~ ✅
- 7 routes fixed: pantry/[id], pantry/import, recipes/[id]/share, recipes/[id]/log, recipes/scrape, recipes/generate, pantry/match
- Added `scopeQuery()`, `scopeInsert()`, `checkOwnership()` to `lib/household.ts`
- Added `validateTags()` to `lib/tags.ts`
- 12 tests in `lib/__tests__/household.test.ts`, 5 tests in `lib/__tests__/tags.test.ts`

### ~~Centralize all LLM calls~~ ✅
- Added `callLLMMultimodal()`, `parseLLMJsonSafe()`, `LLM_MODEL_FAST`, `LLM_MODEL_CAPABLE` to `lib/llm.ts`
- Migrated 7 routes from direct `anthropic.messages.create()` to `callLLM()`/`callLLMMultimodal()`
- Added error field to pantry/scan and pantry/match responses on LLM failure

### ~~Centralize env var config~~ ✅
- `lib/config.ts` — `requireEnv()` for Supabase vars, optional for LLM/Firecrawl
- `lib/supabase-server.ts` uses `config.supabase.*` instead of `process.env.*`

### ~~LLM output validation~~ ✅
- Added `parseLLMJsonSafe()` validation to `plan/suggest/route.ts` and `plan/suggest/swap/route.ts`

### ~~Extract business logic from groceries/generate~~ ✅
- `resolveRecipeIngredients()` extracted to `lib/grocery.ts`

### ~~Constants & configuration~~ ✅
- `lib/constants.ts` — `TOAST_DURATION_MS`, `TOAST_DURATION_LONG_MS`, `MAX_VISIBLE_TAGS`
- 11 component files migrated from magic numbers

### ~~Test mock factory consolidation~~ ✅
- `test/helpers.ts` — added `chainMock()` and `tableMockWithChain()` helpers
- Search test migrated as proof of concept

## Remaining (not in code quality sprint scope)

### Client-side fetch hook (`useAuthFetch`)
- **What:** Create `lib/hooks/use-auth-fetch.ts` to replace repeated getAccessToken + fetch + setState pattern
- **Why:** ~13 components duplicate this pattern. Would reduce boilerplate 30-40%.
- **Complexity:** Components use varied patterns (mutations, multi-step flows, optimistic updates) — needs careful per-component migration to avoid UI regressions.

### `deductPantryIngredients` redesign
- **What:** Currently fire-and-forget in `recipes/[id]/log/route.ts`, no household scoping, errors silently swallowed
- **Why:** Needs architectural rethink — should it be a background job? Should it support household pantries?

### `planServings = 4` hardcoded in groceries/generate
- **What:** Line 66 of `app/api/groceries/generate/route.ts` hardcodes servings to 4
- **Why:** Should come from user preferences or the meal plan's stored servings

### Remaining `scopeQuery` migration
- **What:** ~60 total call sites across 33 files, only 7 migrated in code quality sprint
- **Why:** Remaining routes already work correctly for solo users but should use the helper for consistency

### Remaining test files to migrate to shared mock helpers
- **What:** 8+ test files still build their own Supabase mock chains
- **Why:** `chainMock()` and `tableMockWithChain()` are ready; can migrate incrementally

### Generate Supabase types
- **What:** Run `supabase gen types typescript` for full DB types.
- **Why:** Would give end-to-end type safety on Supabase queries. Currently mitigated by typed join interfaces.
- **Blocked by:** Needs `SUPABASE_ACCESS_TOKEN` or `supabase login` (not available in sandbox)

### Formalize design system into DESIGN.md
- **What:** Run `/design-consultation` to document the implicit design system.
- **Why:** Polish, not reliability. Defer to after sprint lands.
