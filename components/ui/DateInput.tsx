'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react'
import { getTodayISO, formatShortDate } from '@/lib/date-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateInputProps {
  value: string                       // ISO "YYYY-MM-DD", or "" when unset
  onChange: (v: string) => void       // called with "YYYY-MM-DD" or "" on clear
  min?: string                        // ISO "YYYY-MM-DD", inclusive lower bound
  max?: string                        // ISO "YYYY-MM-DD", inclusive upper bound
  placeholder?: string                // shown in trigger when value is ""
  id?: string                         // forwarded to hidden input for label association
  className?: string                  // merged onto the outer wrapper div
  disabled?: boolean
}

interface CalendarProps {
  viewYear:    number
  viewMonth:   number                 // 1–12
  selectedISO: string
  min?:        string
  max?:        string
  onSelectDay: (iso: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onClose:     () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDateParts(iso: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return { year: y, month: m, day: d }
}

function getCalendarGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0=Sun
  const daysInMonth  = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)
  return cells
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ─── CalendarPopover ──────────────────────────────────────────────────────────

function CalendarPopover({
  viewYear,
  viewMonth,
  selectedISO,
  min,
  max,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onClose,
}: CalendarProps) {
  const todayISO = getTodayISO()
  const cells    = getCalendarGrid(viewYear, viewMonth)

  // Keyboard-focused day within the visible month (1-based, or null)
  const parts     = parseDateParts(selectedISO)
  const initFocus = parts?.year === viewYear && parts?.month === viewMonth ? parts.day : 1
  const [focusedDay, setFocusedDay] = useState<number>(initFocus)
  const gridRef = useRef<HTMLDivElement>(null)

  // Focus the button for focusedDay whenever it changes
  useEffect(() => {
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-day="${focusedDay}"]`,
    )
    btn?.focus()
  }, [focusedDay])

  function handleKeyDown(e: React.KeyboardEvent) {
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'ArrowRight':
        e.preventDefault()
        if (focusedDay < daysInMonth) setFocusedDay(focusedDay + 1)
        else { onNextMonth(); setFocusedDay(1) }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (focusedDay > 1) setFocusedDay(focusedDay - 1)
        else { onPrevMonth(); setFocusedDay(new Date(viewYear, viewMonth - 1, 0).getDate()) }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (focusedDay + 7 <= daysInMonth) setFocusedDay(focusedDay + 7)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (focusedDay - 7 >= 1) setFocusedDay(focusedDay - 7)
        break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const iso = buildISO(viewYear, viewMonth, focusedDay)
        const disabled = (min && iso < min) || (max && iso > max)
        if (!disabled) onSelectDay(iso)
        break
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Choose date"
      className="absolute top-full left-0 mt-1 z-50 bg-[#FFFDF9] border border-stone-200 rounded-lg shadow-lg p-3 w-64"
      onKeyDown={handleKeyDown}
    >
      {/* Month / year header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-display text-sm font-semibold text-stone-800 select-none">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d) => (
          <span
            key={d}
            className="font-sans text-[10px] text-stone-400 text-center py-0.5 select-none"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7" ref={gridRef}>
        {cells.map((day, i) => {
          if (day === null) {
            return <span key={`pad-${i}`} />
          }
          const iso      = buildISO(viewYear, viewMonth, day)
          const isSelected = iso === selectedISO
          const isToday    = iso === todayISO
          const isDisabled = !!(min && iso < min) || !!(max && iso > max)

          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === focusedDay ? 0 : -1}
              disabled={isDisabled}
              onClick={() => onSelectDay(iso)}
              onFocus={() => setFocusedDay(day)}
              aria-label={iso}
              aria-pressed={isSelected}
              className={[
                'font-sans text-[13px] rounded-full w-8 h-8 flex items-center justify-center transition-colors mx-auto',
                isSelected
                  ? 'bg-sage-500 text-white hover:bg-sage-600'
                  : isToday
                  ? 'ring-1 ring-sage-400 text-stone-700 hover:bg-stone-100'
                  : 'text-stone-700 hover:bg-stone-100',
                isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
              ].filter(Boolean).join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── DateInput ────────────────────────────────────────────────────────────────

export default function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  id,
  className,
  disabled,
}: DateInputProps) {
  const [open, setOpen]           = useState(false)
  const [viewYear, setViewYear]   = useState<number>(() => {
    const p = parseDateParts(value || getTodayISO())
    return p?.year ?? new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const p = parseDateParts(value || getTodayISO())
    return p?.month ?? (new Date().getMonth() + 1)
  })

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Keep view in sync when value changes externally
  useEffect(() => {
    const p = parseDateParts(value)
    if (p) { setViewYear(p.year); setViewMonth(p.month) }
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function handlePrevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }

  function handleNextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  function handleSelectDay(iso: string) {
    onChange(iso)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const label = value ? formatShortDate(value) : (placeholder ?? 'Pick a date')

  return (
    <div ref={wrapperRef} className={['relative inline-block', className].filter(Boolean).join(' ')}>
      {/* Hidden input for label/form association */}
      <input
        id={id}
        type="text"
        readOnly
        value={value}
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          'flex items-center gap-1.5 bg-[#FFFDF9] border border-stone-200 rounded-[4px] px-2 py-1.5',
          'font-sans text-[13px] text-sage-900 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-sage-500',
          'hover:border-stone-300',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <CalendarDays size={13} className="text-stone-400 flex-shrink-0" />
        <span className={value ? 'text-sage-900' : 'text-stone-400'}>{label}</span>
        {value && (
          <X
            size={11}
            className="text-stone-400 hover:text-stone-600 flex-shrink-0 transition-colors"
            onClick={handleClear}
            aria-label="Clear date"
          />
        )}
      </button>

      {/* Popover */}
      {open && (
        <CalendarPopover
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedISO={value}
          min={min}
          max={max}
          onSelectDay={handleSelectDay}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
