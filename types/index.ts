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
  currentWeekPlan: {
    id:         string
    week_start: string
    entries: {
      planned_date:  string
      recipe_id:     string
      recipe_title:  string
      position:      number
      confirmed:     boolean
    }[]
  } | null
  recentlyMade: {
    recipe_id:    string
    recipe_title: string
    made_on:      string
  }[]
}

export interface UserTag {
  id: string
  user_id: string
  name: string
  created_at: string
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
