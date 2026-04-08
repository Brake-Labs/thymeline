import GroceriesPageClient from '@/components/groceries/GroceriesPageClient'

interface Props {
  searchParams: { dateFrom?: string; dateTo?: string }
}

export default function GroceriesPage({ searchParams }: Props) {
  return (
    <GroceriesPageClient
      initialDateFrom={searchParams.dateFrom}
      initialDateTo={searchParams.dateTo}
    />
  )
}
