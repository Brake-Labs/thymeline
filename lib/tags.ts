export const STYLE_DIETARY_TAGS = [
  'Seafood', 'Vegetarian', 'Gluten-Free', 'Garden', 'Slow Cooker',
  'Sheet Pan', 'One Pot', 'Quick', 'Favorite', 'Sourdough', 'Healthy',
  'Comfort', 'Spicy', 'Entertain', 'Soup', 'Hungarian', 'Pizza', 'Grill',
  'Autumn', 'Winter', 'Summer', 'Mediterranean',
] as const

export const PROTEIN_TAGS = [
  'Chicken', 'Beef', 'Pork', 'Sausage', 'Lamb', 'Turkey', 'Shrimp',
  'Salmon', 'Fish', 'Tofu', 'Tempeh', 'Seitan', 'Beans', 'Lentils',
  'Chickpeas', 'Eggs',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_DIETARY_TAGS,
  ...PROTEIN_TAGS,
]
