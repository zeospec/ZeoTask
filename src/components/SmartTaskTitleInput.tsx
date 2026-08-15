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
  /** Called when user types '@' — parent should show inline project autocomplete */
  onAtTrigger?: (active: boolean, query: string) => void
  /** Called when user types '#' — parent should show inline label autocomplete */
  onHashTrigger?: (active: boolean, query: string) => void
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
  placeholder = 'What needs doing? Try "tomorrow 10am #work P1"',
  autoFocus = true,
  ignoredTokens = [],
  onAtTrigger,
  onHashTrigger,
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

  function handleChange(newVal: string) {
    onChange(newVal)

    // Check for @ trigger — find the last @ in the string
    const atIdx = newVal.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = newVal.slice(atIdx + 1)
      if (!/\s/.test(afterAt)) {
        onAtTrigger?.(true, afterAt)
        onHashTrigger?.(false, '')
        return
      }
    }
    onAtTrigger?.(false, '')

    // Check for # trigger — find the last # in the string
    const hashIdx = newVal.lastIndexOf('#')
    if (hashIdx !== -1) {
      const afterHash = newVal.slice(hashIdx + 1)
      if (!/\s/.test(afterHash)) {
        onHashTrigger?.(true, afterHash)
        return
      }
    }
    onHashTrigger?.(false, '')
  }

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
      onChange={(e) => handleChange(e.target.value.replace(/[\r\n]/g, ' '))}
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
