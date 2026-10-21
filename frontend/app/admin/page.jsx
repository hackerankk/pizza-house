import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Page not found | The Pizza House',
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminNotFoundPage() {
  notFound();
}
