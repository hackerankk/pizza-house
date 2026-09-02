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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
