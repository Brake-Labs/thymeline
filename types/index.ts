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

export interface Invite {
  id:         string
  token:      string
  created_by: string | null
  used_by:    string | null
  used_at:    string | null
  expires_at: string
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
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
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
}

export interface RecipeListItem {
  id: string
  user_id: string
  title: string
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
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

export interface RecipeHistory {
  id: string
  recipe_id: string
  user_id: string
  made_on: string  // ISO date "YYYY-MM-DD"
  created_at: string
}

export interface MealPlan {
  id: string
  user_id: string
  week_start: string
  created_at: string
}

export interface MealPlanEntry {
  id: string
  meal_plan_id: string
  recipe_id: string
  planned_date: string
  position: number
  confirmed: boolean
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'

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

export interface SuggestionsResponse {
  days: DaySuggestions[]
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
  category:              'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  servings:              number | null
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  notes:                 string | null
}

export type MealTypeInput = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'
