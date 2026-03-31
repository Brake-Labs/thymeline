interface ThymelineLogoProps {
  variant?: 'light' | 'dark'
}

export default function ThymelineLogo({ variant = 'dark' }: ThymelineLogoProps) {
  const lineColor = variant === 'dark' ? 'bg-[#8CB89A]' : 'bg-sage-500'
  const borderColor = variant === 'dark' ? 'border-[#8CB89A]' : 'border-sage-500'

  return (
    <div className="flex flex-col">
      <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] leading-none">
        <span className={variant === 'dark' ? 'text-[#8CB89A]' : 'text-sage-500'}>Thyme</span>
        <span className={variant === 'dark' ? 'text-sage-100' : 'text-sage-900'}>line</span>
      </span>
      <div className="flex items-center mt-[3px]">
        {/* line — past dot — line — now dot — line — future dot — line */}
        <div className={`h-[2px] ${lineColor} flex-1 rounded-[1px]`} />
        <div className={`w-[7px] h-[7px] rounded-full ${lineColor} mx-[3px]`} />
        <div className={`h-[2px] ${lineColor} flex-1 rounded-[1px]`} />
        <div className="w-[7px] h-[7px] rounded-full bg-terra-500 mx-[3px]" />
        <div className={`h-[2px] ${lineColor} flex-1 rounded-[1px]`} />
        <div className={`w-[7px] h-[7px] rounded-full bg-transparent border-2 ${borderColor} mx-[3px]`} />
        <div className={`h-[2px] ${lineColor} flex-1 rounded-[1px]`} />
      </div>
    </div>
  )
}
