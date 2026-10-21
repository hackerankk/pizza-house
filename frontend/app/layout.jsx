import './globals.css';
import { indexableSite, siteOrigin } from './seo';
import { PrivacyPreferencesProvider } from './components/PrivacyPreferences';

export const metadata = {
  ...(siteOrigin() ? { metadataBase: new URL(siteOrigin()) } : {}),
  title: 'The Pizza House | Online Ordering',
  description: 'Order pizza, sides, and drinks with delivery tracking, coupons, partial payments, and secure Razorpay checkout.',
  applicationName: 'The Pizza House',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' }
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  robots: { index: indexableSite(), follow: true }
};

export default function RootLayout({ children }) {
  const themeScript = `
    try {
      var mode = localStorage.getItem('pizza_house_theme_mode') || 'system';
      var resolved = mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : mode === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.themeMode = mode;
      document.documentElement.dataset.colorScheme = resolved;
    } catch (e) {}
  `;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden bg-tph-bg font-tph text-tph-text antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <PrivacyPreferencesProvider>{children}</PrivacyPreferencesProvider>
      </body>
    </html>
  );
}
