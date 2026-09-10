import './globals.css';

export const metadata = {
  title: 'The Pizza House | Online Ordering',
  description: 'Order pizza, sides, and drinks with delivery tracking, coupons, partial payments, and secure Razorpay checkout.',
  openGraph: {
    title: 'The Pizza House',
    description: 'Fresh restaurant ordering with live status tracking.',
    type: 'website'
  }
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
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
