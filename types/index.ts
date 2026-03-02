export interface UserPreferences {
  id: string
  user_id: string
  options_per_day: number
  comfort_limit_per_week: number
  cooldown_days: number
  preferred_tags: string[]
  avoided_tags: string[]
  seasonal_mode: boolean
  healthy_bias: boolean
  weekly_tag_caps: Record<string, number>
  seasonal_rules: SeasonalRules
  cadence_rules: CadenceRule[]
  created_at: string
}

export interface SeasonalRules {
  [season: string]: {
    favor: string[]
    cap: Record<string, number>
    exclude: string[]
  }
}

export interface CadenceRule {
  tag: string
  min_per_window: number
  window_days: number
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
  url?: string
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  tags: string[]
  notes?: string
  created_at: string
}

export interface RecipeHistory {
  id: string
  recipe_id: string
  user_id: string
  made_on: string
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
