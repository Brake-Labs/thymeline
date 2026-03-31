interface ThymelineLogoProps {
  variant?: 'light' | 'dark'
}

export default function ThymelineLogo({ variant = 'dark' }: ThymelineLogoProps) {
  const thymeColor  = variant === 'dark' ? '#8CB89A' : '#4A7C59'
  const lineText    = variant === 'dark' ? '#D9EBE0' : '#1F2D26'
  const dotBg       = variant === 'dark' ? 'bg-[#8CB89A]'     : 'bg-[#4A7C59]'
  const dotBorder   = variant === 'dark' ? 'border-[#8CB89A]' : 'border-[#4A7C59]'

  return (
    <div className="flex flex-col">
      <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] leading-none">
        <span style={{ color: thymeColor }}>Thyme</span>
        <span style={{ color: lineText }}>line</span>
      </span>
      <div className="flex items-center mt-[3px]">
        {/* line — past dot — line — now dot — line — future dot — line */}
        <div className={`h-[2px] ${dotBg} flex-1 rounded-[1px]`} />
        <div className={`w-[7px] h-[7px] rounded-full ${dotBg} mx-[3px]`} />
        <div className={`h-[2px] ${dotBg} flex-1 rounded-[1px]`} />
        <div className="w-[7px] h-[7px] rounded-full bg-terra-500 mx-[3px]" />
        <div className={`h-[2px] ${dotBg} flex-1 rounded-[1px]`} />
        <div className={`w-[7px] h-[7px] rounded-full bg-transparent border-2 ${dotBorder} mx-[3px]`} />
        <div className={`h-[2px] ${dotBg} flex-1 rounded-[1px]`} />
      </div>
    </div>
  )
}
