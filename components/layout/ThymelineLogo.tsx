interface ThymelineLogoProps {
  variant?: 'light' | 'dark'
}

export default function ThymelineLogo({ variant = 'dark' }: ThymelineLogoProps) {
  const lineColor = variant === 'dark' ? '#8CB89A' : '#4A7C59'
  const futureBorder = variant === 'dark' ? '#8CB89A' : '#4A7C59'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{
        fontFamily: 'var(--font-jakarta)',
        fontSize: '22px',
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>
        <span style={{ color: variant === 'dark' ? '#8CB89A' : '#4A7C59' }}>Thyme</span>
        <span style={{ color: variant === 'dark' ? '#D9EBE0' : '#1F2D26' }}>line</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: '3px' }}>
        {/* line — past dot — line — now dot — line — future dot — line */}
        <div style={{ height: 2, background: lineColor, flex: 1, borderRadius: 1 }} />
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: lineColor, margin: '0 3px' }} />
        <div style={{ height: 2, background: lineColor, flex: 1, borderRadius: 1 }} />
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C97D4E', margin: '0 3px' }} />
        <div style={{ height: 2, background: lineColor, flex: 1, borderRadius: 1 }} />
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'transparent', border: `2px solid ${futureBorder}`, margin: '0 3px' }} />
        <div style={{ height: 2, background: lineColor, flex: 1, borderRadius: 1 }} />
      </div>
    </div>
  )
}
