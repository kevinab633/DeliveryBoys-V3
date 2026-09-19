import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2, MessageCircle } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

export default function Contact() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', subject: '', message: '' });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setSent(true);
    const msg = `*Contact:* ${form.name}%0A*Phone:* ${form.phone}%0A*Subject:* ${form.subject}%0A*Message:* ${form.message}`;
    setTimeout(() => window.open(`https://wa.me/233544188778?text=${msg}`, '_blank'), 1000);
  };
  if (sent) return (
    <div className="pt-20 min-h-screen flex items-center justify-center"><motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center p-12">
      <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40} className="text-white" /></div>
      <h2 className={cn('text-3xl font-extrabold mb-3', dk ? 'text-white' : 'text-gray-900')}>Message Sent!</h2>
      <p className={cn('', dk ? 'text-white/50' : 'text-gray-500')}>We'll get back to you soon.</p>
    </motion.div></div>
  );
  const inp = cn('w-full px-4 py-3 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');
  return (
    <div className="pt-20">
      <section className={cn('py-16', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-brand/10 text-brand text-sm font-semibold mb-4">Contact</span>
          <h1 className={cn('text-4xl md:text-5xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Get In Touch</h1>
        </div>
      </section>
      <section className={cn('py-12', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {[{ icon: Phone, t: 'Call Us', v: '+233 544 188 778', l: 'tel:+233544188778' },
              { icon: MessageCircle, t: 'WhatsApp', v: '+233 544 188 778', l: 'https://wa.me/233544188778' },
              { icon: Mail, t: 'Email', v: 'support.deliveryboys.gh@gmail.com', l: 'mailto:support.deliveryboys.gh@gmail.com' },
              { icon: Clock, t: 'Hours', v: 'Mon-Sun: 6AM-10PM', l: '' }].map((c, i) => (
              <motion.div key={c.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={cn('p-6 rounded-2xl border text-center', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                <div className="w-14 h-14 rounded-xl bg-brand/10 flex items-center justify-center mx-auto mb-3"><c.icon size={24} className="text-brand" /></div>
                <h4 className={cn('font-bold mb-1', dk ? 'text-white' : 'text-gray-900')}>{c.t}</h4>
                {c.l ? <a href={c.l} target={c.l.startsWith('http') ? '_blank' : undefined} className={cn('text-sm break-all', dk ? 'text-white/50' : 'text-gray-500')}>{c.v}</a> : <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>{c.v}</p>}
              </motion.div>
            ))}
          </div>
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <input name="name" required value={form.name} onChange={handleChange} placeholder="Your Name" className={inp} />
                <input name="phone" required value={form.phone} onChange={handleChange} placeholder="Phone" className={inp} />
              </div>
              <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className={inp} />
              <select name="subject" required value={form.subject} onChange={handleChange} className={inp}>
                <option value="">Select Subject</option>
                <option>General Inquiry</option><option>Delivery Issue</option><option>Partnership</option><option>Feedback</option>
              </select>
              <textarea name="message" rows={5} required value={form.message} onChange={handleChange} placeholder="Your message..." className={cn(inp, 'resize-none')} />
              <button type="submit" className="inline-flex items-center gap-2 bg-brand text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-dark transition"><Send size={18} /> Send Message</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
