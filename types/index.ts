// ─── Shared const arrays (single source of truth for types + Zod schemas) ────

export const RECIPE_CATEGORIES = ['main_dish', 'breakfast', 'dessert', 'side_dish'] as const
export type RecipeCategory = typeof RECIPE_CATEGORIES[number]

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const
export type MealType = typeof MEAL_TYPES[number]

export const TAG_SECTIONS = ['style', 'dietary', 'seasonal', 'cuisine', 'protein'] as const
export type TagSection = typeof TAG_SECTIONS[number]

// ─── Domain types ────────────────────────────────────────────────────────────

export interface LimitedTag {
  tag: string
  cap: number  // 1–7
}

export interface UserPreferences {
  id: string
  userId: string
  optionsPerDay: number
  cooldownDays: number
  seasonalMode: boolean
  preferredTags: string[]
  avoidedTags: string[]
  limitedTags: LimitedTag[]
  seasonalRules: Record<string, { favor?: string[]; cap?: Record<string, number>; exclude?: string[] }> | null
  onboardingCompleted: boolean
  isActive: boolean
  mealContext: string | null
  hiddenTags: string[]
  createdAt: string
}

export interface HomeData {
  userName:              string | null
  recipeCount:           number
  groceryListWeekStart:  string | null
  currentWeekPlan: {
    id:         string
    weekStart: string
    entries: {
      plannedDate:       string
      recipeId:          string
      recipeTitle:       string
      position:           number
      confirmed:          boolean
      totalTimeMinutes: number | null
    }[]
  } | null
  recentlyMade: {
    recipeId:    string
    recipeTitle: string
    madeOn:      string
    tags:         string[]
  }[]
}

export interface Recipe {
  id: string
  userId: string
  title: string
  url: string | null
  category: RecipeCategory
  tags: string[]
  notes: string | null
  isShared: boolean
  ingredients: string | null
  steps: string | null
  imageUrl: string | null
  createdAt: string
  datesMade?: string[]  // sorted descending; returned by GET /api/recipes/[id]
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  servings:              number | null
  source: 'scraped' | 'manual' | 'generated'
  stepPhotos: { stepIndex: number; imageUrl: string }[]
}

export interface RecipeListItem {
  id: string
  userId: string
  title: string
  category: RecipeCategory
  tags: string[]
  isShared: boolean
  lastMade: string | null  // "YYYY-MM-DD"
  timesMade: number
  createdAt: string
  totalTimeMinutes: number | null
}

export interface RecipeFilters {
  tags: string[]
  categories: Recipe['category'][]
  maxTotalMinutes: number | null  // null = inactive (show all)
  lastMadeFrom: string | null     // "YYYY-MM-DD"
  lastMadeTo: string | null       // "YYYY-MM-DD"
  neverMade: boolean
}

export type CookingFrequency = 'light' | 'moderate' | 'frequent'

export interface TasteProfile {
  lovedRecipeIds:    string[]
  dislikedRecipeIds: string[]
  topTags:            string[]
  avoidedTags:        string[]
  preferredTags:      string[]
  mealContext:        string | null
  cookingFrequency:   CookingFrequency
  recentRecipes:      { recipeId: string; title: string; madeOn: string }[]
}

export interface WasteMatch {
  ingredient:    string
  wasteRisk:    'high' | 'medium'
  sharedWith:   string[]
  hasNextWeek: boolean
}

export interface RecipeSuggestion {
  recipeId:         string
  recipeTitle:      string
  reason?:           string
  wasteMatches?:    WasteMatch[]
  wasteBadgeText?: string
}

export interface MealTypeSuggestions {
  mealType: MealType
  options:   RecipeSuggestion[]
}

export interface DaySuggestions {
  date:       string
  mealTypes: MealTypeSuggestions[]
}

export interface DaySelection {
  date:         string
  mealType:    MealType
  recipeId:    string
  recipeTitle: string
  fromVault:   boolean
}

export interface SavedPlanEntry {
  id:              string
  mealPlanId:    string
  recipeId:       string
  recipeTitle?:   string
  plannedDate:    string
  position:        number
  confirmed:       boolean
  mealType:       MealType
  isSideDish:    boolean
  parentEntryId: string | null
}

export interface PlanEntry {
  id:                  string
  recipeId:           string
  recipeTitle:        string
  plannedDate:        string
  mealType:           MealType
  isSideDish:        boolean
  parentEntryId:     string | null
  confirmed:           boolean
  position:            number
  totalTimeMinutes?: number | null
}

// ── Plan wizard types ─────────────────────────────────────────────────────────

export interface PlanSetup {
  weekStart:       string
  activeDates:     string[]
  activeMealTypes: MealType[]
  preferThisWeek:  string[]
  avoidThisWeek:   string[]
  freeText:        string
}

export type SelectionsMap = Record<string, DaySelection | null>

export type GrocerySection =
  | 'Produce'
  | 'Proteins'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Canned & Jarred'
  | 'Bakery'
  | 'Frozen'
  | 'Beverages'
  | 'Deli'
  | 'Other'

export interface GroceryItem {
  id:        string
  name:      string
  amount:    number | null
  unit:      string | null
  section:   GrocerySection
  isPantry: boolean
  checked:   boolean
  bought?:   boolean   // true = item is in the "Got it" section
  recipes:   string[]
}

export interface RecipeScale {
  recipeId:    string
  recipeTitle: string
  servings:     number | null  // null = use plan-level default
}

export interface GroceryList {
  id:            string
  userId:       string
  mealPlanId:  string
  weekStart:    string
  dateFrom?:    string | null
  dateTo?:      string | null
  servings:      number
  recipeScales: RecipeScale[]
  items:         GroceryItem[]
  createdAt:    string
  updatedAt:    string
}


export interface GeneratedRecipe {
  title:                 string
  ingredients:           string
  steps:                 string
  tags:                  string[]
  category:              RecipeCategory
  servings:              number | null
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  notes:                 string | null
  wasteMatches?:        Pick<WasteMatch, 'ingredient' | 'wasteRisk'>[]
  wasteBadgeText?:     string
}

export type HouseholdRole = 'owner' | 'co_owner' | 'member'

export interface Household {
  id:         string
  name:       string
  ownerId:   string
  createdAt: string
}

export interface HouseholdMember {
  householdId:  string
  userId:       string
  role:          HouseholdRole
  joinedAt:     string
  email?:        string
  displayName?: string
}

export interface HouseholdContext {
  householdId: string
  role:        HouseholdRole
}

// ─── Discover ────────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  title:          string
  url:            string
  siteName:      string
  description:    string | null
  suggestedTags: string[]
  vaultMatch?: {
    similarRecipeTitle: string
    similarity: 'exact' | 'similar'
  }
  wasteMatches?:    Pick<WasteMatch, 'ingredient' | 'wasteRisk'>[]
  wasteBadgeText?: string
}

/** Scraped recipe data — returned by POST /api/recipes/scrape and used in the discover flow */
export interface ScrapeResult {
  title:               string | null
  ingredients:         string | null
  steps:               string | null
  imageUrl:            string | null
  sourceUrl:           string
  partial:             boolean
  suggestedTags:       string[]
  suggestedNewTags:    { name: string; section: 'style' | 'dietary' | 'seasonal' | 'cuisine' | 'protein' }[]
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  servings:            number | null
}

// ─── Import ───────────────────────────────────────────────────────────────────

/** A recipe parsed from any import source, before it's saved to the vault */
export interface ParsedRecipe {
  title:                 string
  category:              'main_dish' | 'breakfast' | 'dessert' | 'side_dish' | null
  ingredients:           string | null
  steps:                 string | null
  notes:                 string | null
  url:                   string | null
  imageUrl:             string | null
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  servings:              number | null
  tags:                  string[]
  source:                'scraped' | 'manual' | 'generated'
  stepPhotos:            unknown[]
  history:               { madeOn: string }[]
}

export interface ModifiedRecipe {
  title:                string
  ingredients:          string
  steps:                string
  notes:                string | null
  servings:             number | null
  prepTimeMinutes?:   number | null
  cookTimeMinutes?:   number | null
  totalTimeMinutes?:  number | null
}

export interface AIEditMessage {
  role:    'user' | 'assistant'
  content: string
  changes?: string[]
}

/** A result row in the import review table */
export interface ImportResult {
  id:               string   // client-generated uuid for keying rows
  status:           'ready' | 'partial' | 'failed' | 'pending'
  recipe?:          ParsedRecipe
  error?:           string
  sourceUrl?:      string   // for URL imports
  sourceLabel:     string   // e.g. "budgetbytes.com" or "Paprika"
  duplicate?: {
    recipeId:    string
    recipeTitle: string
  }
  duplicateAction?: 'skip' | 'keep_both' | 'replace'
}

export interface GenerateRefinementMessage {
  role:     'user' | 'assistant'
  content:  string
  changes?: string[]   // populated on assistant turns; bullet list of what changed
}
