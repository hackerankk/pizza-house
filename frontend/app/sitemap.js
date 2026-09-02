export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/account`, lastModified: new Date() }
  ];
}
