export const STYLE_TAGS = [
  'Comfort', 'Entertain', 'Favorite', 'Gluten-Free', 'Grill', 'Healthy',
  'One Pot', 'Pizza', 'Quick', 'Seafood', 'Sheet Pan', 'Slow Cooker',
  'Soup', 'Sourdough', 'Spicy', 'Vegetarian',
] as const

export const SEASONAL_TAGS = [
  'Autumn', 'Spring', 'Summer', 'Winter',
] as const

export const CUISINE_TAGS = [
  'American', 'Asian', 'Chinese', 'French', 'Greek', 'Hungarian',
  'Indian', 'Irish', 'Italian', 'Japanese', 'Mediterranean', 'Mexican',
  'Middle Eastern', 'Thai',
] as const

export const PROTEIN_TAGS = [
  'Chicken', 'Beef', 'Pork', 'Sausage', 'Lamb', 'Turkey', 'Shrimp',
  'Salmon', 'Fish', 'Tofu', 'Tempeh', 'Seitan', 'Beans', 'Lentils',
  'Chickpeas', 'Eggs',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_TAGS,
  ...SEASONAL_TAGS,
  ...CUISINE_TAGS,
  ...PROTEIN_TAGS,
]
