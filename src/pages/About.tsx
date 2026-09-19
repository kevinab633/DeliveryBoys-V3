import { motion } from 'framer-motion';
import { Target, Eye, Heart, Award, Clock, Shield, Users, Truck } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useContentStore } from '../stores/contentStore';
import { cn } from '../lib/utils';

export default function About() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { getContent } = useContentStore();
  return (
    <div className="pt-20">
      <section className={cn('py-16', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-brand/10 text-brand text-sm font-semibold mb-4">About Us</span>
          <h1 className={cn('text-4xl md:text-5xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{getContent('about.title', 'About Delivery Boys')}</h1>
          <p className={cn('mt-4 text-lg max-w-2xl mx-auto', dk ? 'text-white/50' : 'text-gray-500')}>{getContent('about.description', 'Founded in Accra, we started with a small team of dedicated riders and a big dream.')}</p>
        </div>
      </section>
      <section className={cn('py-16', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className={cn('text-3xl font-extrabold mb-6', dk ? 'text-white' : 'text-gray-900')}>Our Story</h2>
              <div className={cn('space-y-4 leading-relaxed', dk ? 'text-white/60' : 'text-gray-600')}>
                <p>Delivery Boys was born from a simple observation: people in Ghana needed a faster, more reliable way to send and receive items across the city.</p>
                <p>Today, we've grown into one of the most trusted delivery services in Ghana, completing thousands of deliveries every month.</p>
                <p>Our motto: <strong className="text-brand">"We go the extra mile for you!"</strong></p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <img src="/images/img3.jpeg" alt="Banner" className="rounded-2xl shadow-2xl" />
            </motion.div>
          </div>
        </div>
      </section>
      <section className={cn('py-16', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-8">
          {[{ icon: Target, t: 'Our Mission', d: 'To provide fast, reliable, and affordable delivery services connecting people and businesses across Ghana.' },
            { icon: Eye, t: 'Our Vision', d: "To become West Africa's leading on-demand delivery platform." }].map((c, i) => (
            <motion.div key={c.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className={cn('p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-gray-50 border-gray-200')}>
              <div className="w-14 h-14 rounded-xl bg-brand/10 flex items-center justify-center mb-4"><c.icon size={28} className="text-brand" /></div>
              <h3 className={cn('text-2xl font-bold mb-3', dk ? 'text-white' : 'text-gray-900')}>{c.t}</h3>
              <p className={cn('leading-relaxed', dk ? 'text-white/60' : 'text-gray-600')}>{c.d}</p>
            </motion.div>
          ))}
        </div>
      </section>
      <section className={cn('py-16', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          <h2 className={cn('text-3xl font-extrabold text-center mb-12', dk ? 'text-white' : 'text-gray-900')}>Our Values</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[{ icon: Clock, t: 'Speed' }, { icon: Shield, t: 'Reliability' }, { icon: Heart, t: 'Care' }, { icon: Award, t: 'Excellence' }].map((v, i) => (
              <motion.div key={v.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={cn('p-6 rounded-2xl border text-center', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4"><v.icon size={24} className="text-brand" /></div>
                <h4 className={cn('font-bold text-lg', dk ? 'text-white' : 'text-gray-900')}>{v.t}</h4>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
