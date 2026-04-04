import GroceriesPageClient from '@/components/groceries/GroceriesPageClient'

interface Props {
  searchParams: { date_from?: string; date_to?: string }
}

export default function GroceriesPage({ searchParams }: Props) {
  return (
    <GroceriesPageClient
      initialDateFrom={searchParams.date_from}
      initialDateTo={searchParams.date_to}
    />
  )
}
