import { notFound } from 'next/navigation';
import AdminPanel from '../_secure/AdminPanel';

export const metadata = {
  title: 'Admin Portal',
  robots: {
    index: false,
    follow: false
  }
};

export const dynamic = 'force-dynamic';

function configuredAdminPath() {
  return (process.env.ADMIN_FRONTEND_PATH || 'secure-dashboard').replace(/^\/+|\/+$/g, '');
}

export default async function HiddenAdminPage({ params }) {
  const resolvedParams = await params;
  const adminPath = String(resolvedParams?.adminPath || '');
  const allowedPath = configuredAdminPath();

  if (!allowedPath || adminPath !== allowedPath || adminPath === 'admin') {
    notFound();
  }

  return <AdminPanel />;
}
