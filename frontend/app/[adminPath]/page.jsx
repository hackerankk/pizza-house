import { notFound } from 'next/navigation';
import AdminPanel from '../_secure/AdminPanel';

export const dynamic = 'force-dynamic';

function configuredAdminPath() {
  return (process.env.ADMIN_FRONTEND_PATH || 'secure-dashboard').replace(/^\/+|\/+$/g, '');
}

function isAdminPath(value) {
  const allowedPath = configuredAdminPath();
  return Boolean(allowedPath && value === allowedPath && value !== 'admin');
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  return {
    title: isAdminPath(String(resolvedParams?.adminPath || '')) ? 'Admin Portal' : 'Page not found | The Pizza House',
    robots: { index: false, follow: false }
  };
}

export default async function HiddenAdminPage({ params }) {
  const resolvedParams = await params;
  const adminPath = String(resolvedParams?.adminPath || '');
  if (!isAdminPath(adminPath)) {
    notFound();
  }

  return <AdminPanel />;
}
