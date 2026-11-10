import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { services } from '../lib/services';
import { Link } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';


export default function Services() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const user = useAuthStore(s => s.user);
  const bookingPath = user?.role === 'customer' ? '/book' : '/auth/login?role=customer';
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
              <div className="relative rounded-3xl overflow-hidden h-64 lg:h-80">
                <img src={s.img} alt={s.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute top-4 left-4 w-12 h-12 rounded-full bg-brand flex items-center justify-center"><s.icon size={24} className="text-white" /></div>
              </div>
              <div>
                <h3 className={cn('text-3xl font-extrabold mb-4', dk ? 'text-white' : 'text-gray-900')}>{s.name}</h3>
                <div className="space-y-3 mb-6">
                  {s.paragraphs.map((p, j) => (
                    <p key={j} className={cn(dk ? 'text-white/60' : 'text-gray-600')}>{p}</p>
                  ))}
                </div>
                <Link to={bookingPath} className="inline-flex items-center gap-2 bg-brand text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-brand-dark transition">
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
