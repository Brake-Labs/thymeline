export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      custom_tags: {
        Row: {
          created_at: string | null
          household_id: string | null
          id: string
          name: string
          section: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          name: string
          section?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          name?: string
          section?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_tags_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_lists: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          household_id: string | null
          id: string
          items: Json
          meal_plan_id: string | null
          recipe_scales: Json
          servings: number
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          household_id?: string | null
          id?: string
          items?: Json
          meal_plan_id?: string | null
          recipe_scales?: Json
          servings?: number
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          household_id?: string | null
          id?: string
          items?: Json
          meal_plan_id?: string | null
          recipe_scales?: Json
          servings?: number
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_lists_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          created_at: string
          expires_at: string
          household_id: string
          id: string
          invited_by: string
          token: string
          used_by: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          household_id: string
          id?: string
          invited_by: string
          token?: string
          used_by?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string
          token?: string
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      meal_plan_entries: {
        Row: {
          confirmed: boolean
          id: string
          is_side_dish: boolean
          meal_plan_id: string
          meal_type: string
          parent_entry_id: string | null
          planned_date: string
          position: number
          recipe_id: string
        }
        Insert: {
          confirmed?: boolean
          id?: string
          is_side_dish?: boolean
          meal_plan_id: string
          meal_type?: string
          parent_entry_id?: string | null
          planned_date: string
          position: number
          recipe_id: string
        }
        Update: {
          confirmed?: boolean
          id?: string
          is_side_dish?: boolean
          meal_plan_id?: string
          meal_type?: string
          parent_entry_id?: string | null
          planned_date?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          household_id: string | null
          id: string
          servings: number | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          household_id?: string | null
          id?: string
          servings?: number | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          household_id?: string | null
          id?: string
          servings?: number | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          added_at: string
          expiry_date: string | null
          household_id: string | null
          id: string
          name: string
          quantity: string | null
          section: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          expiry_date?: string | null
          household_id?: string | null
          id?: string
          name: string
          quantity?: string | null
          section?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          expiry_date?: string | null
          household_id?: string | null
          id?: string
          name?: string
          quantity?: string | null
          section?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_history: {
        Row: {
          created_at: string
          id: string
          made_on: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          made_on: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          made_on?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          category: string
          cook_time_minutes: number | null
          created_at: string
          household_id: string | null
          id: string
          image_url: string | null
          inactive_time_minutes: number | null
          ingredients: string | null
          is_shared: boolean
          notes: string | null
          prep_time_minutes: number | null
          servings: number | null
          source: string
          step_photos: Json
          steps: string | null
          tags: string[]
          title: string
          total_time_minutes: number | null
          url: string | null
          user_id: string
        }
        Insert: {
          category: string
          cook_time_minutes?: number | null
          created_at?: string
          household_id?: string | null
          id?: string
          image_url?: string | null
          inactive_time_minutes?: number | null
          ingredients?: string | null
          is_shared?: boolean
          notes?: string | null
          prep_time_minutes?: number | null
          servings?: number | null
          source?: string
          step_photos?: Json
          steps?: string | null
          tags?: string[]
          title: string
          total_time_minutes?: number | null
          url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          cook_time_minutes?: number | null
          created_at?: string
          household_id?: string | null
          id?: string
          image_url?: string | null
          inactive_time_minutes?: number | null
          ingredients?: string | null
          is_shared?: boolean
          notes?: string | null
          prep_time_minutes?: number | null
          servings?: number | null
          source?: string
          step_photos?: Json
          steps?: string | null
          tags?: string[]
          title?: string
          total_time_minutes?: number | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          avoided_tags: string[]
          cadence_rules: Json | null
          comfort_limit_per_week: number | null
          cooldown_days: number
          created_at: string
          healthy_bias: boolean | null
          hidden_tags: string[]
          household_id: string | null
          id: string
          is_active: boolean
          limited_tags: Json
          onboarding_completed: boolean
          options_per_day: number
          preferred_tags: string[]
          seasonal_mode: boolean
          seasonal_rules: Json | null
          user_id: string
        }
        Insert: {
          avoided_tags?: string[]
          cadence_rules?: Json | null
          comfort_limit_per_week?: number | null
          cooldown_days?: number
          created_at?: string
          healthy_bias?: boolean | null
          hidden_tags?: string[]
          household_id?: string | null
          id?: string
          is_active?: boolean
          limited_tags?: Json
          onboarding_completed?: boolean
          options_per_day?: number
          preferred_tags?: string[]
          seasonal_mode?: boolean
          seasonal_rules?: Json | null
          user_id: string
        }
        Update: {
          avoided_tags?: string[]
          cadence_rules?: Json | null
          comfort_limit_per_week?: number | null
          cooldown_days?: number
          created_at?: string
          healthy_bias?: boolean | null
          hidden_tags?: string[]
          household_id?: string | null
          id?: string
          is_active?: boolean
          limited_tags?: Json
          onboarding_completed?: boolean
          options_per_day?: number
          preferred_tags?: string[]
          seasonal_mode?: boolean
          seasonal_rules?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
