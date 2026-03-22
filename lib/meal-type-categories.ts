import type { MealType } from '@/types'

export const MEAL_TYPE_CATEGORIES_CLIENT: Record<MealType, string[]> = {
  breakfast: ['breakfast'],
  lunch:     ['main_dish'],
  dinner:    ['main_dish'],
  snack:     ['side_dish', 'dessert'],
}
