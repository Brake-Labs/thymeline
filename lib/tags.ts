export const STYLE_TAGS = [
  'Comfort', 'Entertain', 'Favorite', 'Grill', 'One Pot',
  'Quick', 'Sheet Pan', 'Slow Cooker', 'Sourdough', 'Soup', 'Spicy',
] as const

export const DIETARY_TAGS = [
  'Dairy-Free', 'Egg-Free', 'Gluten-Free', 'High-Protein', 'Keto',
  'Low-Carb', 'Nut-Free', 'Paleo', 'Pescatarian', 'Vegan',
  'Vegetarian', 'Whole30',
] as const

export const SEASONAL_TAGS = ['Autumn', 'Spring', 'Summer', 'Winter'] as const

export const CUISINE_TAGS = [
  'American', 'Asian', 'Chinese', 'French', 'Greek', 'Hungarian',
  'Indian', 'Irish', 'Italian', 'Japanese', 'Mediterranean',
  'Mexican', 'Middle Eastern', 'Thai',
] as const

export const PROTEIN_TAGS = [
  'Bacon', 'Beans', 'Beef', 'Chicken', 'Chickpeas', 'Eggs', 'Fish',
  'Lamb', 'Lentils', 'Pork', 'Salmon', 'Sausage', 'Seafood', 'Seitan',
  'Shrimp', 'Tempeh', 'Tofu', 'Turkey',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_TAGS, ...DIETARY_TAGS, ...SEASONAL_TAGS,
  ...CUISINE_TAGS, ...PROTEIN_TAGS,
]

/**
 * Tags that must never be imported from external sources.
 * Meal-type tags ("Breakfast", "Lunch", etc.) belong in recipe `category`, not `tags`.
 * "Healthy" was removed from the taxonomy.
 */
export const BLOCKED_IMPORT_TAGS = new Set([
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'healthy',
])

// Tag validation is in lib/tags-server.ts (server-only, imports from lib/db)
