import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function baseProps(
  { size = 20, className, ...rest }: IconProps,
  defaultClass?: string,
) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: [defaultClass, className].filter(Boolean).join(' '),
    'aria-hidden': true as const,
    ...rest,
  }
}

export function Check(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function Plus(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

export function Search(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function MoreHorizontal(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function Filter(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

export function ChevronLeft(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export function ChevronRight(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function ChevronDown(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function ArrowLeft(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

export function X(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

/** Brand mark: rounded square + check */
export function ZeoMark({
  size = 36,
  className,
  ...rest
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      aria-hidden
      {...rest}
    >
      <rect width="36" height="36" rx="10" fill="var(--accent)" />
      <path
        d="M10.5 18.5 15.5 23.5 25.5 12.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Tag(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42l-8.704-8.704z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  )
}
