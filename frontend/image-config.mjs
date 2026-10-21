function validOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return null;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}

export function imageRemotePatterns() {
  const sources = ['https://images.unsplash.com', process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000', ...(process.env.NEXT_PUBLIC_IMAGE_ORIGINS || '').split(',')];
  const unique = new Map();
  sources.forEach(value => {
    const url = validOrigin(value.trim());
    // Local development uploads load directly in the browser. Do not weaken
    // Next's private-network protection to proxy a localhost PHP server.
    if (url?.protocol === 'https:') unique.set(url.origin, { protocol: 'https', hostname: url.hostname, port: url.port, pathname: '/**' });
  });
  return [...unique.values()];
}

export function isOptimizableImage(src) {
  if (typeof src !== 'string') return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  const url = validOrigin(src);
  return Boolean(url && imageRemotePatterns().some(pattern => url.protocol === `${pattern.protocol}:` && url.hostname === pattern.hostname && url.port === pattern.port));
}
