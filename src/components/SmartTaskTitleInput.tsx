import { useEffect, useId, useRef } from 'react'
import {
  parseSmartTitle,
  type SmartParseResult,
} from '../lib/taskParsers'

type Props = {
  value: string
  onChange: (value: string) => void
  onParsed: (parsed: SmartParseResult) => void
  onSubmit: () => void
  placeholder?: string
  autoFocus?: boolean
  ignoredTokens?: string[]
}

/**
 * Plain single-line title. NLP feedback lives in chips below the field
 * (parent), so caret and typed glyphs stay perfectly aligned.
 */
export function SmartTaskTitleInput({
  value,
  onChange,
  onParsed,
  onSubmit,
  placeholder = 'What needs doing? Try “tomorrow 10am #work P1”',
  autoFocus = true,
  ignoredTokens = [],
}: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      onParsed(parseSmartTitle(value, ignoredTokens))
    }, 80)
    return () => window.clearTimeout(handle)
  }, [value, onParsed, ignoredTokens])

  useEffect(() => {
    if (!autoFocus) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [autoFocus])

  return (
    <input
      ref={inputRef}
      id={inputId}
      type="text"
      value={value}
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSubmit()
        }
      }}
      className="box-border w-full border-0 bg-transparent px-0 py-0.5 text-lg font-medium leading-8 text-[var(--ink)] outline-none placeholder:font-normal placeholder:text-[var(--muted)]"
      aria-label="Task title"
    />
  )
}
