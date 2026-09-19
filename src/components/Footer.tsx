import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

export default function Footer() {
  const dk = useThemeStore(s => s.theme === 'dark');
  return (
    <footer className={cn('border-t transition-colors', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-gray-50 border-gray-200')}>
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/images/logo.jpeg" alt="DB" className="h-12 w-12 rounded-full object-cover" />
              <div>
                <span className={cn('font-extrabold text-lg', dk ? 'text-white' : 'text-gray-900')}>Delivery</span>
                <span className="font-extrabold text-lg text-brand ml-1">Boys</span>
              </div>
            </div>
            <p className={cn('text-sm leading-relaxed', dk ? 'text-white/40' : 'text-gray-500')}>Ghana's most reliable delivery service. We go the extra mile for you.</p>
          </div>
          <div>
            <h4 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Quick Links</h4>
            <div className="space-y-2">
              {[{n:'Services',p:'/services'},{n:'Book Delivery',p:'/book'},{n:'Track Order',p:'/track'},{n:'Become a Rider',p:'/auth/signup?role=rider'},{n:'About Us',p:'/about'}].map(l=>
                <Link key={l.p} to={l.p} className={cn('block text-sm transition', dk?'text-white/40 hover:text-brand':'text-gray-500 hover:text-brand')}>{l.n}</Link>
              )}
            </div>
          </div>
          <div>
            <h4 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Contact</h4>
            <div className="space-y-3">
              {[
                { icon: Phone, text: '+233 544 188 778' },
                { icon: Mail, text: 'support.deliveryboys.gh@gmail.com' },
                { icon: MapPin, text: 'Accra, Ghana' },
                { icon: Clock, text: 'Mon-Sun: 6AM - 10PM' },
              ].map((c,i) => (
                <div key={i} className="flex items-start gap-2">
                  <c.icon size={16} className="text-brand mt-0.5 shrink-0" />
                  <span className={cn('text-sm', dk ? 'text-white/40' : 'text-gray-500')}>{c.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Get the App</h4>
            <p className={cn('text-sm mb-3', dk ? 'text-white/40' : 'text-gray-500')}>Install our web app on your phone for the best experience.</p>
            <a href="https://wa.me/233544188778" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#25D366] text-white text-sm font-bold hover:bg-[#1DA851] transition">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp Us
            </a>
          </div>
        </div>
      </div>
      <div className={cn('border-t py-5', dk ? 'border-white/5' : 'border-gray-200')}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className={cn('text-xs', dk ? 'text-white/20' : 'text-gray-400')}>&copy; {new Date().getFullYear()} Delivery Boys. All rights reserved.</p>
          <Link to="/manager/login" className={cn('text-xs transition', dk ? 'text-white/10 hover:text-white/30' : 'text-gray-300 hover:text-gray-400')}>Manager Access</Link>
        </div>
      </div>
    </footer>
  );
}
