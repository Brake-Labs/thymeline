/**
 * Drizzle ORM schema definitions for all application tables.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'

// ── Better Auth tables ──────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── Recipes ─────────────────────────────────────────────────────────────────

export const recipes = pgTable('recipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  householdId: uuid('household_id'),
  title: text('title').notNull(),
  url: text('url'),
  category: text('category').notNull(), // main_dish, breakfast, dessert, side_dish
  tags: text('tags').array().notNull().default([]),
  notes: text('notes'),
  ingredients: text('ingredients'),
  steps: text('steps'),
  imageUrl: text('image_url'),
  isShared: boolean('is_shared').notNull().default(false),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  totalTimeMinutes: integer('total_time_minutes'),
  inactiveTimeMinutes: integer('inactive_time_minutes'),
  servings: integer('servings'),
  source: text('source').notNull().default('manual'), // scraped, manual, generated
  stepPhotos: jsonb('step_photos').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Recipe History ──────────────────────────────────────────────────────────

export const recipeHistory = pgTable('recipe_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  madeOn: date('made_on').notNull(),
  makeAgain: boolean('make_again'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Meal Plans ──────────────────────────────────────────────────────────────

export const mealPlans = pgTable('meal_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  householdId: uuid('household_id'),
  weekStart: date('week_start').notNull(),
  servings: integer('servings'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Meal Plan Entries ───────────────────────────────────────────────────────

export const mealPlanEntries = pgTable('meal_plan_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  mealPlanId: uuid('meal_plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  plannedDate: date('planned_date').notNull(),
  position: integer('position').notNull(),
  confirmed: boolean('confirmed').notNull().default(false),
  mealType: text('meal_type').notNull().default('dinner'),
  isSideDish: boolean('is_side_dish').notNull().default(false),
  parentEntryId: uuid('parent_entry_id'),
})

// ── User Preferences ────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  householdId: uuid('household_id'),
  optionsPerDay: integer('options_per_day').notNull().default(3),
  cooldownDays: integer('cooldown_days').notNull().default(28),
  seasonalMode: boolean('seasonal_mode').notNull().default(true),
  preferredTags: text('preferred_tags').array().notNull().default([]),
  avoidedTags: text('avoided_tags').array().notNull().default([]),
  limitedTags: jsonb('limited_tags').notNull().default([]),
  seasonalRules: jsonb('seasonal_rules'),
  cadenceRules: jsonb('cadence_rules'),
  comfortLimitPerWeek: integer('comfort_limit_per_week'),
  healthyBias: boolean('healthy_bias'),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  mealContext: text('meal_context'),
  hiddenTags: text('hidden_tags').array().notNull().default([]),
  weekStartDay: text('week_start_day').notNull().default('sunday'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Custom Tags ─────────────────────────────────────────────────────────────

export const customTags = pgTable('custom_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  householdId: uuid('household_id'),
  name: text('name').notNull(),
  section: text('section').notNull().default('style'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── User Tags (legacy) ──────────────────────────────────────────────────────

export const userTags = pgTable('user_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── Grocery Lists ───────────────────────────────────────────────────────────

export const groceryLists = pgTable('grocery_lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  householdId: uuid('household_id'),
  mealPlanId: uuid('meal_plan_id').references(() => mealPlans.id),
  weekStart: date('week_start').notNull(),
  dateFrom: date('date_from'),
  dateTo: date('date_to'),
  servings: integer('servings').notNull().default(4),
  recipeScales: jsonb('recipe_scales').notNull().default([]),
  items: jsonb('items').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Households ──────────────────────────────────────────────────────────────

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const householdMembers = pgTable('household_members', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull(), // owner, co_owner, member
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.householdId, t.userId] }),
])

export const householdInvites = pgTable('household_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  invitedBy: text('invited_by').notNull(),
  token: text('token').notNull().unique(),
  usedBy: text('used_by'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Pantry ───────────────────────────────────────────────────────────────────

export const pantryItems = pgTable('pantry_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  householdId: uuid('household_id'),
  name: text('name').notNull(),
  quantity: text('quantity'),
  section: text('section'),
  expiryDate: date('expiry_date'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Invites (app-level access control) ──────────────────────────────────────

export const invites = pgTable('invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: text('token').notNull(),
  createdBy: text('created_by'),
  usedBy: text('used_by'),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
