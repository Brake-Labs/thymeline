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
  user_id: string
  options_per_day: number
  cooldown_days: number
  seasonal_mode: boolean
  preferred_tags: string[]
  avoided_tags: string[]
  limited_tags: LimitedTag[]
  seasonal_rules: Record<string, { favor?: string[]; cap?: Record<string, number>; exclude?: string[] }> | null
  onboarding_completed: boolean
  is_active: boolean
  created_at: string
}

export interface HomeData {
  userName:              string | null
  recipeCount:           number
  groceryListWeekStart:  string | null
  currentWeekPlan: {
    id:         string
    week_start: string
    entries: {
      planned_date:       string
      recipe_id:          string
      recipe_title:       string
      position:           number
      confirmed:          boolean
      total_time_minutes: number | null
    }[]
  } | null
  recentlyMade: {
    recipe_id:    string
    recipe_title: string
    made_on:      string
    tags:         string[]
  }[]
}

export interface Recipe {
  id: string
  user_id: string
  title: string
  url: string | null
  category: RecipeCategory
  tags: string[]
  notes: string | null
  is_shared: boolean
  ingredients: string | null
  steps: string | null
  image_url: string | null
  created_at: string
  dates_made?: string[]  // sorted descending; returned by GET /api/recipes/[id]
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  servings:              number | null
  source: 'scraped' | 'manual' | 'generated'
  step_photos: { stepIndex: number; imageUrl: string }[]
}

export interface RecipeListItem {
  id: string
  user_id: string
  title: string
  category: RecipeCategory
  tags: string[]
  is_shared: boolean
  last_made: string | null  // "YYYY-MM-DD"
  times_made: number
  created_at: string
  total_time_minutes: number | null
}

export interface RecipeFilters {
  tags: string[]
  categories: Recipe['category'][]
  maxTotalMinutes: number | null  // null = inactive (show all)
  lastMadeFrom: string | null     // "YYYY-MM-DD"
  lastMadeTo: string | null       // "YYYY-MM-DD"
  neverMade: boolean
}

export interface RecipeSuggestion {
  recipe_id:    string
  recipe_title: string
  reason?:      string
}

export interface MealTypeSuggestions {
  meal_type: MealType
  options:   RecipeSuggestion[]
}

export interface DaySuggestions {
  date:       string
  meal_types: MealTypeSuggestions[]
}

export interface DaySelection {
  date:         string
  meal_type:    MealType
  recipe_id:    string
  recipe_title: string
  from_vault:   boolean
}

export interface SavedPlanEntry {
  id:              string
  meal_plan_id:    string
  recipe_id:       string
  recipe_title?:   string
  planned_date:    string
  position:        number
  confirmed:       boolean
  meal_type:       MealType
  is_side_dish:    boolean
  parent_entry_id: string | null
}

export interface PlanEntry {
  id:                  string
  recipe_id:           string
  recipe_title:        string
  planned_date:        string
  meal_type:           MealType
  is_side_dish:        boolean
  parent_entry_id:     string | null
  confirmed:           boolean
  position:            number
  total_time_minutes?: number | null
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
  | 'Other'

export interface GroceryItem {
  id:        string
  name:      string
  amount:    number | null
  unit:      string | null
  section:   GrocerySection
  is_pantry: boolean
  checked:   boolean
  bought?:   boolean   // true = item is in the "Got it" section
  recipes:   string[]
}

export interface RecipeScale {
  recipe_id:    string
  recipe_title: string
  servings:     number | null  // null = use plan-level default
}

export interface GroceryList {
  id:            string
  user_id:       string
  meal_plan_id:  string
  week_start:    string
  date_from?:    string | null
  date_to?:      string | null
  servings:      number
  recipe_scales: RecipeScale[]
  items:         GroceryItem[]
  created_at:    string
  updated_at:    string
}

export interface PantryItem {
  id:          string
  user_id:     string
  name:        string
  quantity:    string | null
  section:     string | null   // GrocerySection value or null
  expiry_date: string | null   // "YYYY-MM-DD"
  added_at:    string
  updated_at:  string
}

export interface PantryMatch {
  recipe_id:     string
  recipe_title:  string
  match_count:   number
  matched_items: string[]
}

export interface GeneratedRecipe {
  title:                 string
  ingredients:           string
  steps:                 string
  tags:                  string[]
  category:              RecipeCategory
  servings:              number | null
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  notes:                 string | null
}

export type HouseholdRole = 'owner' | 'co_owner' | 'member'

export interface Household {
  id:         string
  name:       string
  owner_id:   string
  created_at: string
}

export interface HouseholdMember {
  household_id:  string
  user_id:       string
  role:          HouseholdRole
  joined_at:     string
  email?:        string
  display_name?: string
}

export interface HouseholdContext {
  householdId: string
  role:        HouseholdRole
}

// ─── Discover ────────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  title:          string
  url:            string
  site_name:      string
  description:    string | null
  suggested_tags: string[]
  vault_match?: {
    similar_recipe_title: string
    similarity: 'exact' | 'similar'
  }
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
