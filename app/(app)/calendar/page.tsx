import WeekCalendar from '@/components/calendar/WeekCalendar'

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-bold text-stone-900 mb-6">Calendar</h1>
        <WeekCalendar />
      </div>
    </div>
  )
}
