import { motion } from 'framer-motion';
import { Package, UtensilsCrossed, ShoppingCart, FileText, Building2, Zap, Bike, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

const services = [
  { icon: Package, name: 'Parcel Delivery', desc: 'Send and receive parcels of all sizes safely and securely.', features: ['Same-day delivery', 'Package insurance', 'Real-time tracking', 'Signature confirmation'], img: '/images/parcel-delivery.jpg' },
  { icon: UtensilsCrossed, name: 'Food Delivery', desc: 'Hot meals delivered fresh from your favorite restaurants.', features: ['Temperature-controlled', 'Fast pickup', 'Multiple restaurants', 'Contactless delivery'], img: '/images/food-delivery.jpg' },
  { icon: ShoppingCart, name: 'Grocery Delivery', desc: 'Fresh groceries delivered right to your doorstep.', features: ['Fresh produce guarantee', 'Market shopping', 'Scheduled deliveries', 'Bulk discounts'], img: '/images/grocery-delivery.jpg' },
  { icon: FileText, name: 'Document Delivery', desc: 'Confidential document courier services.', features: ['Confidential handling', 'Proof of delivery', 'Express options', 'Corporate accounts'], img: '/images/document-delivery.jpg' },
  { icon: Building2, name: 'Corporate Deliveries', desc: 'Tailored delivery solutions for businesses.', features: ['Dedicated manager', 'Volume discounts', 'Monthly invoicing', 'Custom SLA'], img: '/images/corporate-delivery.jpg' },
  { icon: Zap, name: 'Express / Same-Day', desc: 'Guaranteed same-day delivery within the city.', features: ['1-3 hour window', 'Priority handling', 'Live GPS tracking', 'Guaranteed time'], img: '/images/express-delivery.jpg' },
  { icon: Bike, name: 'On-Demand Delivery', desc: 'Request a rider anytime for immediate pickups.', features: ['Instant dispatch', '7 days a week', 'Flexible scheduling', 'Pay per delivery'], img: '/images/ondemand-delivery.jpg' },
];

export default function Services() {
  const dk = useThemeStore(s => s.theme === 'dark');
  return (
    <div className="pt-20">
      <section className={cn('py-16', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-brand/10 text-brand text-sm font-semibold mb-4">Our Services</span>
          <h1 className={cn('text-4xl md:text-5xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>What We Deliver</h1>
          <p className={cn('mt-4 text-lg max-w-2xl mx-auto', dk ? 'text-white/50' : 'text-gray-500')}>From parcels to food, groceries to documents — we handle it all.</p>
        </div>
      </section>
      <section className={cn('py-12', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          {services.map((s, i) => (
            <motion.div key={s.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className={cn('grid lg:grid-cols-2 gap-8 items-center', i % 2 === 1 && 'lg:[direction:rtl] lg:[&>*]:[direction:ltr]')}>
              <div className="relative rounded-2xl overflow-hidden h-64 lg:h-80">
                <img src={s.img} alt={s.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute top-4 left-4 w-12 h-12 rounded-xl bg-brand flex items-center justify-center"><s.icon size={24} className="text-white" /></div>
              </div>
              <div>
                <h3 className={cn('text-3xl font-extrabold mb-4', dk ? 'text-white' : 'text-gray-900')}>{s.name}</h3>
                <p className={cn('mb-6', dk ? 'text-white/60' : 'text-gray-600')}>{s.desc}</p>
                <ul className="space-y-2 mb-6">
                  {s.features.map(f => (
                    <li key={f} className={cn('flex items-center gap-2 text-sm', dk ? 'text-white/70' : 'text-gray-600')}>
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/book" className="inline-flex items-center gap-2 bg-brand text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-brand-dark transition">
                  Book This Service <ArrowRight size={16} />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
