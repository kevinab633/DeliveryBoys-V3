import { Package, UtensilsCrossed, FileText, Zap, Bike, type LucideIcon } from 'lucide-react';

// Shared by the Services page and the home page services section,
// so both always show the same services with the same text.
export interface ServiceInfo {
  icon: LucideIcon;
  name: string;
  /** Each entry is one paragraph. */
  paragraphs: string[];
  img: string;
}

export const services: ServiceInfo[] = [
  {
    icon: Package,
    name: 'Parcel Delivery',
    paragraphs: [
      'Involves collecting, transporting and delivering packages or items from one location to another, either within the same city or across regions.',
      'Parcels may include documents, clothing, electronics, groceries, gifts, personal belongings and other packaged goods.',
    ],
    img: '/images/parcel-delivery.jpg',
  },
  {
    icon: UtensilsCrossed,
    name: 'Food Delivery',
    paragraphs: [
      'Hot meals and groceries delivered fresh from your favorite restaurants.',
    ],
    img: '/images/food-delivery.jpg',
  },
  {
    icon: FileText,
    name: 'Document Delivery',
    paragraphs: [
      'Involves the collection, transportation and delivery of important documents from one person, business or organisation to another, ensuring that paperwork reaches its intended recipient safely, securely and within the agreed timeframe.',
      'Documents may include contracts, certificates, legal papers, business proposals, invoices, academic records, application forms and other official correspondence.',
    ],
    img: '/images/document-delivery.jpg',
  },
  {
    icon: Zap,
    name: 'Express Delivery',
    paragraphs: [
      'Fast-track delivery service designed to transport packages, documents, food and other items to their intended destinations within the shortest possible time. It prioritises speed, efficiency and convenience, making it suitable for customers and businesses with urgent delivery needs.',
      'Unlike standard delivery, express delivery receives priority handling to minimise waiting and transportation time.',
    ],
    img: '/images/express-delivery.jpg',
  },
  {
    icon: Bike,
    name: 'On-Demand Delivery',
    paragraphs: [
      'On-demand delivery is a delivery service that allows customers to request the collection and transportation of items whenever they need them, without having to make advance arrangements or follow a fixed delivery schedule.',
      'It provides immediate access to delivery services by connecting customers with available riders who collect and transport requested items to their preferred destinations.',
      'Unlike scheduled delivery, on-demand delivery is initiated by the customer’s immediate request.',
    ],
    img: '/images/ondemand-delivery.jpg',
  },
];
