interface ForkcastLogoProps {
  variant?: 'light' | 'dark'
}

export default function ForkcastLogo({ variant = 'dark' }: ForkcastLogoProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-[#1F2D26]'
  const strokeColor = variant === 'light' ? '#ffffff' : '#1F2D26'

  return (
    <div className="flex items-center gap-2">
      {/* Fork and knife SVG */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Fork — left */}
        <line x1="5" y1="2" x2="5" y2="10" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="3" y1="2" x2="3" y2="6" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="7" y1="2" x2="7" y2="6" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 6 Q3 10 5 10 Q7 10 7 6" stroke={strokeColor} strokeWidth="1.5" fill="none" />
        <line x1="5" y1="10" x2="5" y2="20" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* Knife — right */}
        <path
          d="M17 2 C17 2 19 5 19 9 L17 10 L17 20"
          stroke={strokeColor}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-display text-xl font-black tracking-tight ${textColor}`}>
        Forkcast
      </span>
    </div>
  )
}
