import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sanitizeHtml } from '../lib/html'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  autoFocus?: boolean
  /** Drop outer chrome when nested in a parent panel. */
  bare?: boolean
}

export function isEmptyHtml(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return text.length === 0
}

/** Lightweight rich notes - bold / italic / lists via contenteditable. */
export function RichDescriptionEditor({
  value,
  onChange,
  placeholder = 'Add notes, details, links…',
  autoFocus = false,
  bare = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const skipSync = useRef(false)
  const [empty, setEmpty] = useState(() => isEmptyHtml(value))

  useEffect(() => {
    const el = ref.current
    if (!el || skipSync.current) return
    if (el.innerHTML !== value) {
      el.innerHTML = value || ''
      setEmpty(isEmptyHtml(value))
    }
  }, [value])

  useEffect(() => {
    if (!autoFocus) return
    const t = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, 50)
    return () => window.clearTimeout(t)
  }, [autoFocus])

  function emit() {
    const el = ref.current
    if (!el) return
    skipSync.current = true
    const html = sanitizeHtml(el.innerHTML)
    const next = isEmptyHtml(html) ? '' : html
    setEmpty(isEmptyHtml(next))
    onChange(next)
    requestAnimationFrame(() => {
      skipSync.current = false
    })
  }

  function run(cmd: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  return (
    <div
      className={
        bare
          ? 'overflow-hidden'
          : 'overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] focus-within:border-[var(--accent)]/35'
      }
    >
      <div
        className={
          bare
            ? 'flex flex-wrap items-center gap-0.5 px-0 pb-1'
            : 'flex flex-wrap items-center gap-0.5 border-b border-[var(--hairline)] bg-[var(--quiet)]/40 px-1.5 py-1'
        }
      >
        <ToolbarBtn label="Bold" onClick={() => run('bold')}>
          <span className="font-semibold">B</span>
        </ToolbarBtn>
        <ToolbarBtn label="Italic" onClick={() => run('italic')}>
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn label="Underline" onClick={() => run('underline')}>
          <span className="underline">U</span>
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-[var(--hairline)]" />
        <ToolbarBtn label="Bullet list" onClick={() => run('insertUnorderedList')}>
          •••
        </ToolbarBtn>
        <ToolbarBtn label="Numbered list" onClick={() => run('insertOrderedList')}>
          1.
        </ToolbarBtn>
      </div>
      <div className="relative">
        {empty && (
          <span
            className={
              bare
                ? 'pointer-events-none absolute top-1 left-0 text-sm text-[var(--muted)]'
                : 'pointer-events-none absolute top-2.5 left-3 text-sm text-[var(--muted)]'
            }
          >
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="Description"
          contentEditable
          suppressContentEditableWarning
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          className={
            bare
              ? 'rich-desc min-h-[88px] px-0 py-1 text-sm leading-relaxed text-[var(--ink)] outline-none [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5'
              : 'rich-desc min-h-[96px] px-3 py-2.5 text-sm leading-relaxed text-[var(--ink)] outline-none [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5'
          }
          onInput={emit}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
            emit()
          }}
        />
      </div>
    </div>
  )
}

function ToolbarBtn({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
    >
      {children}
    </button>
  )
}
