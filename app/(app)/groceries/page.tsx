import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GroceryList } from '@/types'
import GroceryListView from '@/components/groceries/GroceryListView'
import GenerateGroceriesButton from '@/components/groceries/GenerateGroceriesButton'
import { getCurrentWeekSunday } from '@/lib/grocery'

interface PageProps {
  searchParams: { week_start?: string }
}

async function fetchGroceryData(weekStart: string) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { list: null, hasPlan: false }

  // Check if grocery list exists
  const { data: list } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  if (list) return { list: list as GroceryList, hasPlan: true }

  // Check if meal plan exists
  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  return { list: null, hasPlan: !!plan }
}

export default async function GroceriesPage({ searchParams }: PageProps) {
  const weekStart = searchParams.week_start ?? getCurrentWeekSunday()
  const { list, hasPlan } = await fetchGroceryData(weekStart)

  if (list) {
    return <GroceryListView initialList={list} />
  }

  if (hasPlan) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-stone-800">Generate your grocery list</h1>
        <p className="text-stone-600">
          You have a meal plan for this week. Generate a grocery list from your recipes.
        </p>
        <GenerateGroceriesButton weekStart={weekStart} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-center space-y-4">
      <h1 className="text-xl font-bold text-stone-800">No meal plan for this week</h1>
      <p className="text-stone-600">Plan your meals first, then come back to generate a grocery list.</p>
      <Link
        href="/plan"
        className="inline-block px-5 py-2 bg-sage-500 text-white text-sm font-semibold rounded-lg hover:bg-sage-600"
      >
        Go to Plan
      </Link>
    </div>
  )
}
