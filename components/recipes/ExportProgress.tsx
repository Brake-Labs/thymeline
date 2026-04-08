'use client'

interface Props {
  message: string
}

export default function ExportProgress({ message }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm text-stone-500">
      <span className="inline-block w-4 h-4 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
      {message}
    </div>
  )
}
