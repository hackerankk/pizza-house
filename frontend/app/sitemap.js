import { indexableSite, siteOrigin } from './seo';

export default function sitemap() {
  if (!indexableSite()) return [];
  const origin = siteOrigin();
  return [{ url: `${origin}/` }, { url: `${origin}/privacy` }];
}
