/** Sanitize HTML for safe display of rich task notes. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed').forEach((n) => n.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    ;[...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name)
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return doc.body.innerHTML
}

export function isPlainOrEmptyDescription(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return text.length === 0
}
