interface WhyThisProps {
  text: string | undefined
}

export default function WhyThis({ text }: WhyThisProps) {
  if (!text) return null
  return <p className="text-sm text-stone-400 italic">{text}</p>
}
