export default function manifest() {
  return {
    name: 'The Pizza House',
    short_name: 'Pizza House',
    description: 'Order from The Pizza House.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fff8f0',
    theme_color: '#d62828',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  };
}
