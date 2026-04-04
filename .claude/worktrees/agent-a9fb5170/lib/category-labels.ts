import type { RecipeCategory } from '@/types'
import { RECIPE_CATEGORIES } from '@/types'

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  main_dish: 'Main Dish',
  breakfast: 'Breakfast',
  dessert: 'Dessert',
  side_dish: 'Side Dish',
}

/** For filter UIs — array of { value, label } for each category. */
export const CATEGORY_OPTIONS: { value: RecipeCategory; label: string }[] =
  RECIPE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))
