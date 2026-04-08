/**
 * Client-safe helpers for recipe export download/share.
 */

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function triggerDownloadOrShare(blob: Blob, filename: string, mimeType: string): void {
  const file = new File([blob], filename, { type: mimeType })

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file] })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
