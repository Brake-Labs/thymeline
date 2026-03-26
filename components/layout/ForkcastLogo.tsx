interface ForkcastLogoProps {
  variant?: 'light' | 'dark'
}

export default function ForkcastLogo({ variant = 'dark' }: ForkcastLogoProps) {
  // On dark nav: sage-300 icon (#8DC1A3), white text
  // On light bg: sage-600 icon (#3D6849), dark text
  const iconColor = variant === 'light' ? '#8DC1A3' : '#3D6849'
  const textColor = variant === 'light' ? 'text-white' : 'text-[#1F2D26]'

  return (
    <div className="flex items-center gap-2">
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Fork — two tines + U connector + handle */}
        <path
          d="M4 1 L4 9 Q4 13 6 13 Q8 13 8 9 L8 1"
          stroke={iconColor}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="6" y1="13" x2="6" y2="21"
          stroke={iconColor}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Knife — blade curves right at top, straight handle */}
        <path
          d="M13 1 C15 2 15 7 13 8 L13 21"
          stroke={iconColor}
          strokeWidth="1.6"
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
