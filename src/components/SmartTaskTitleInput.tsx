import { useEffect, useId, useRef, useLayoutEffect } from 'react'
import { parseSmartTitle, type SmartParseResult } from '../lib/taskParsers'

type Highlight = {
  start: number
  end: number
  text: string
  kind: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onParsed: (parsed: SmartParseResult) => void
  onSubmit: () => void
  placeholder?: string
  autoFocus?: boolean
  ignoredTokens?: string[]
  onAtTrigger?: (active: boolean, query: string) => void
  onHashTrigger?: (active: boolean, query: string) => void
  highlights?: Highlight[]
}

// Retrieves absolute character offset of the caret within a contentEditable node.
function getCaretOffset(element: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(element)
  preCaretRange.setEnd(range.endContainer, range.endOffset)
  return preCaretRange.toString().length
}

// Sets absolute character offset of the caret within a contentEditable node.
function setCaretOffset(element: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return

  const charIndex = { count: 0 }
  let nodeToSet: Node | null = null
  let nodeOffset = 0

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length || 0
      if (charIndex.count + len >= offset && !nodeToSet) {
        nodeToSet = node
        nodeOffset = offset - charIndex.count
      }
      charIndex.count += len
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i])
        if (nodeToSet) break
      }
    }
  }

  traverse(element)

  const range = document.createRange()
  if (nodeToSet) {
    range.setStart(nodeToSet, nodeOffset)
    range.collapse(true)
  } else {
    // Fallback: place caret at the end
    range.selectNodeContents(element)
    range.collapse(false)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

const escapeHtml = (str: string) => {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Builds the raw HTML string with span wrappers for matched tokens.
const generateHighlightedHtml = (text: string, highlights: Highlight[]) => {
  if (!highlights || !highlights.length) return escapeHtml(text)

  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  let html = ''
  let lastIdx = 0

  for (const h of sorted) {
    if (h.start > lastIdx) {
      html += escapeHtml(text.slice(lastIdx, h.start))
    }
    const chunk = text.slice(h.start, h.end)

    let cls = 'rounded px-1 font-medium '
    if (h.kind === 'project') cls += 'text-[var(--accent)] bg-[var(--accent)]/10'
    else if (h.kind === 'label') cls += 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30'
    else if (h.kind === 'due') cls += 'text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/30'
    else if (h.kind === 'repeat') cls += 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30'
    else if (h.kind === 'priority') cls += 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/30'
    else cls += 'bg-[var(--quiet)] text-[var(--ink)]'

    html += `<span class="${cls}">${escapeHtml(chunk)}</span>`
    lastIdx = h.end
  }

  if (lastIdx < text.length) {
    html += escapeHtml(text.slice(lastIdx))
  }

  return html
}

/**
 * Single-layer semantic contentEditable input.
 * Avoids any dual-layer subpixel drift or duplicated text nodes.
 */
export function SmartTaskTitleInput({
  value,
  onChange,
  onParsed,
  onSubmit,
  placeholder = 'e.g., Team meeting tomorrow 10am #work P1',
  autoFocus = true,
  ignoredTokens = [],
  onAtTrigger,
  onHashTrigger,
  highlights = [],
}: Props) {
  const inputId = useId()
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)

  // Parse debounced so we don't block typing thread heavily
  useEffect(() => {
    const handle = window.setTimeout(() => {
      onParsed(parseSmartTitle(value, ignoredTokens))
    }, 60)
    return () => window.clearTimeout(handle)
  }, [value, onParsed, ignoredTokens])

  // Core synchronization: update DOM spans and restore caret perfectly
  useLayoutEffect(() => {
    if (!editorRef.current || isComposing.current) return
    const currentHtml = editorRef.current.innerHTML
    const targetHtml = generateHighlightedHtml(value, highlights)
    
    // Only write to DOM if HTML structurally diverges from what's currently there.
    // This strictly avoids destroying the caret every keystroke!
    if (currentHtml !== targetHtml && value === editorRef.current.textContent) {
      const caret = getCaretOffset(editorRef.current)
      editorRef.current.innerHTML = targetHtml
      if (document.activeElement === editorRef.current) {
        setCaretOffset(editorRef.current, caret)
      }
    } else if (value !== editorRef.current.textContent) {
      // Sync from an external value change (like parent setting value to '')
      editorRef.current.innerHTML = targetHtml
      if (document.activeElement === editorRef.current) {
        setCaretOffset(editorRef.current, value.length)
      }
    }
  }, [value, highlights])

  // Focus and caret positioning at end on mount
  useEffect(() => {
    if (!autoFocus || !editorRef.current) return
    const t = window.setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus()
        setCaretOffset(editorRef.current, editorRef.current.textContent?.length || 0)
      }
    }, 30)
    return () => window.clearTimeout(t)
  }, [autoFocus])

  // Read text content on input and bubble onChange
  const handleInput = () => {
    if (!editorRef.current) return
    let text = editorRef.current.textContent || ''
    // Strip hidden Zero Width characters just in case
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '')
    
    onChange(text)

    // Trigger autocomplete popups for @ and #
    const atIdx = text.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = text.slice(atIdx + 1)
      if (!/\s/.test(afterAt)) {
        onAtTrigger?.(true, afterAt)
        onHashTrigger?.(false, '')
        return
      }
    }
    onAtTrigger?.(false, '')

    const hashIdx = text.lastIndexOf('#')
    if (hashIdx !== -1) {
      const afterHash = text.slice(hashIdx + 1)
      if (!/\s/.test(afterHash)) {
        onHashTrigger?.(true, afterHash)
        return
      }
    }
    onHashTrigger?.(false, '')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  // Prevents pasting rich HTML by forcing plaintext extraction
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain').replace(/[\r\n]/g, ' ')
    // insertText executes properly at the active caret on all modern browsers
    document.execCommand('insertText', false, text)
  }

  return (
    <div className="relative w-full">
      <div
        ref={editorRef}
        id={inputId}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => (isComposing.current = true)}
        onCompositionEnd={() => {
          isComposing.current = false
          handleInput()
        }}
        data-placeholder={placeholder}
        className="box-border w-full min-h-[1.75rem] border-0 bg-transparent px-0 py-0.5 text-lg font-medium leading-7 text-[var(--ink)] outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--muted)] empty:before:font-normal empty:before:pointer-events-none"
        aria-label="Task title"
        spellCheck={false}
      />
    </div>
  )
}
