import { Link, useSearchParams } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

const pages = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'We collect only the information needed to create accounts, arrange deliveries, communicate order updates, and keep riders and customers safe.',
    sections: [
      ['Information we collect', 'Account details, contact information, delivery addresses, order details, rider vehicle information, and verification images when you choose to apply as a rider.'],
      ['How we use it', 'We use this information to match deliveries, provide live order status, process support requests, verify riders, prevent abuse, and send requested notifications.'],
      ['Your choices', 'You can request access, correction, or deletion of your account information by contacting support. Location access is optional and can be disabled in your browser or phone settings.'],
      ['Sharing', 'We share the minimum delivery details needed with the assigned rider or customer. We do not sell personal information.'],
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    intro: 'By using Delivery Boys, you agree to provide accurate information, use the service lawfully, and treat riders, customers, and support staff respectfully.',
    sections: [
      ['Bookings', 'A booking is a request for delivery. Availability, distance, vehicle type, and the displayed fare may affect whether a rider accepts it.'],
      ['Items', 'Do not use the service for illegal, dangerous, stolen, or prohibited items. Customers are responsible for accurate pickup and drop-off information.'],
      ['Accounts', 'Keep your contact details accurate and do not share access to your account. Rider accounts may require document and identity verification before they can work.'],
      ['Service limits', 'Delivery times can change because of traffic, weather, access restrictions, or rider availability. We show the information available to us and do not promise an exact arrival time unless explicitly stated.'],
    ],
  },
  refund: {
    title: 'Refund & Cancellation Policy',
    intro: 'We aim to resolve delivery problems fairly and quickly. Contact support with your order code and the issue you experienced.',
    sections: [
      ['Before dispatch', 'A customer may cancel a pending order before a rider accepts it. Any refund depends on whether payment has already been captured and any applicable payment-provider charges.'],
      ['After acceptance', 'If a rider has accepted or started a delivery, cancellation may incur a charge for work already performed. We review disputed cases individually.'],
      ['Failed delivery', 'If a delivery cannot be completed because of an incorrect address, unavailable recipient, prohibited item, or customer-caused delay, we may charge the completed portion of the service.'],
      ['How to request help', 'Contact support with the order code, phone number, and a short description. We will review the delivery record and respond through the available contact channel.'],
    ],
  },
  cookies: {
    title: 'Cookies & Tracking',
    intro: 'Delivery Boys uses essential browser storage to keep the app working and remember preferences. We do not use advertising trackers on this app.',
    sections: [
      ['Essential storage', 'Local storage keeps sign-in state, theme preference, draft app state, and other core product settings. Removing site data may sign you out and clear these preferences.'],
      ['Location', 'Location is requested only when you choose location-based features such as map positioning or rider tracking. You can deny permission and still use supported parts of the service.'],
      ['Notifications', 'Browser and push notifications are optional. You can allow or block them in your browser or device settings.'],
      ['Third parties', 'Maps, geocoding, Supabase, and payment or messaging providers may receive the limited information necessary for the feature you use.'],
    ],
  },
} as const;

type LegalKey = keyof typeof pages;

export default function LegalPage({ kind }: { kind: LegalKey }) {
  const dk = useThemeStore(s => s.theme === 'dark');
  const page = pages[kind];
  return <main className="min-h-screen px-4 pb-20 pt-28 sm:px-6"><article className="mx-auto max-w-3xl">
    <Link to="/" className="text-sm font-bold text-brand">← Back to Delivery Boys</Link>
    <p className="mt-8 text-sm font-bold uppercase tracking-[.14em] text-brand">Delivery Boys</p>
    <h1 className={cn('mt-2 text-4xl font-black md:text-5xl', dk ? 'text-white' : 'text-gray-900')}>{page.title}</h1>
    <p className={cn('mt-5 max-w-2xl text-lg leading-relaxed', dk ? 'text-white/60' : 'text-gray-600')}>{page.intro}</p>
    <div className="mt-10 space-y-5">{page.sections.map(([heading, body]) => <section key={heading} className={cn('rounded-2xl border p-5', dk ? 'border-white/10 bg-surface-dark-2' : 'border-gray-200 bg-white')}><h2 className={cn('text-lg font-bold', dk ? 'text-white' : 'text-gray-900')}>{heading}</h2><p className={cn('mt-2 text-sm leading-relaxed', dk ? 'text-white/55' : 'text-gray-600')}>{body}</p></section>)}</div>
    <p className={cn('mt-8 text-xs', dk ? 'text-white/35' : 'text-gray-500')}>Questions? Contact support.deliveryboys.gh@gmail.com. This page provides general product information and is not legal advice.</p>
  </article></main>;
}

export function LegalRoute() {
  const [params] = useSearchParams();
  const kind = (params.get('kind') || 'privacy') as LegalKey;
  return <LegalPage kind={kind in pages ? kind : 'privacy'} />;
}
