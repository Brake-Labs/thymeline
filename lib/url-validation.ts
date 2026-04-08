/**
 * Validates URLs before making server-side requests (Firecrawl, etc.)
 * to prevent SSRF attacks against internal services and cloud metadata.
 */
export function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()

    // Block localhost variants
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    if (/^10\./.test(host)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
    if (/^192\.168\./.test(host)) return true

    // Block link-local and metadata endpoints (169.254.x — AWS/GCP metadata)
    if (/^169\.254\./.test(host)) return true

    // Block non-http(s) schemes
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true

    return false
  } catch {
    return true
  }
}
