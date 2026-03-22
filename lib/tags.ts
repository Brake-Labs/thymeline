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
  'Beans', 'Beef', 'Chicken', 'Chickpeas', 'Eggs', 'Fish',
  'Lamb', 'Lentils', 'Pork', 'Salmon', 'Sausage', 'Seitan',
  'Shrimp', 'Tempeh', 'Tofu', 'Turkey',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_TAGS, ...DIETARY_TAGS, ...SEASONAL_TAGS,
  ...CUISINE_TAGS, ...PROTEIN_TAGS,
]
