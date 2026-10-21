import HomeMenu from './components/HomeMenu';
import { publicMetadata, serializeJsonLd, websiteSchema } from './seo';

export const metadata = publicMetadata('The Pizza House | Order Pizza Online', 'Browse pizzas, sides and drinks at The Pizza House. Customize your order for delivery or takeaway and follow its status online.');

export default function HomePage() {
  const schema = websiteSchema();
  return <>{schema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} /> : null}<HomeMenu /></>;
}
