export const STYLE_DIETARY_TAGS = [
  'Healthy', 'Comfort', 'Quick', 'Seafood', 'Vegetarian', 'Gluten-Free', 'Soup',
  'Sheet Pan', 'One Pot', 'Slow Cooker', 'Grill', 'Entertain', 'Spicy',
  'Favorite', 'Sourdough', 'Garden', 'Pizza', 'Autumn', 'Winter', 'Summer',
] as const

export const CUISINE_TAGS = [
  'Hungarian', 'Mediterranean', 'Italian', 'Mexican', 'Thai', 'Indian',
  'Greek', 'French', 'Middle Eastern', 'American', 'Asian', 'Chinese', 'Japanese', 'Irish',
] as const

export const PROTEIN_TAGS = [
  'Chicken', 'Beef', 'Pork', 'Sausage', 'Lamb', 'Turkey', 'Shrimp',
  'Salmon', 'Fish', 'Tofu', 'Tempeh', 'Seitan', 'Beans', 'Lentils',
  'Chickpeas', 'Eggs',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_DIETARY_TAGS,
  ...CUISINE_TAGS,
  ...PROTEIN_TAGS,
]
