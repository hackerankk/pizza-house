// The operator confirmed this production origin. Never derive it from an
// untrusted Host header, a local development URL, or a deployment preview.
export const PRODUCTION_ORIGIN = 'https://thepizzahouse.online';

export function siteOrigin(environment = process.env) {
  try {
    const value = environment.NEXT_PUBLIC_SITE_URL || PRODUCTION_ORIGIN;
    const url = new URL(value);
    if (url.origin !== PRODUCTION_ORIGIN || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return PRODUCTION_ORIGIN;
  } catch { return null; }
}

export function indexableSite(environment = process.env) {
  const mode = environment.NEXT_PUBLIC_SITE_ENV;
  if (mode && mode !== 'production') return false;
  if (environment.VERCEL_ENV && environment.VERCEL_ENV !== 'production') return false;
  if (environment.CONTEXT && environment.CONTEXT !== 'production') return false;
  return Boolean(siteOrigin(environment) && (mode === 'production' || environment.NODE_ENV === 'production'));
}
