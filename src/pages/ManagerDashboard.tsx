import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Users, Package, DollarSign, CheckCircle2, XCircle, Edit3, Bike, Shield, AlertTriangle, ChevronDown, ArrowLeft } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useContentStore } from '../stores/contentStore';
import { cn, formatCurrency, formatDate, timeAgo } from '../lib/utils';
import { RiderProfile, PriceRule } from '../lib/types';
import MapView from '../components/MapView';

type Tab = 'overview' | 'orders' | 'riders' | 'map' | 'pricing' | 'content';

export default function ManagerDashboard() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user, getRiders, getCustomers, approveRider, rejectRider, suspendRider } = useAuthStore();
  const { orders, getTotalRevenue } = useOrderStore();
  const { content, updateContent, priceRules, updatePriceRule, pricingMode, setPricingMode, manualOverrides, setManualOverride, removeManualOverride } = useContentStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(requestedTab && ['overview', 'orders', 'riders', 'map', 'pricing', 'content'].includes(requestedTab) ? requestedTab : 'overview');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newOverrideKey, setNewOverrideKey] = useState('');
  const [newOverridePrice, setNewOverridePrice] = useState('');
  const [orderFilter, setOrderFilter] = useState<'active' | 'available' | 'completed'>('active');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedRiderId = searchParams.get('rider');

  useEffect(() => {
    if (requestedTab && ['overview', 'orders', 'riders', 'map', 'pricing', 'content'].includes(requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setSearchParams(nextTab === 'overview' ? {} : { tab: nextTab });
  };

  const openOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    selectTab('orders');
  };

  const openRider = (riderId: string) => {
    setSearchParams({ tab: 'riders', rider: riderId });
  };

  const closeRider = () => setSearchParams({ tab: 'riders' });

  if (!user || user.role !== 'manager') return <div className="pt-20 min-h-screen flex items-center justify-center"><p className={dk?'text-white/50':'text-gray-500'}>Access denied. Manager login required.</p></div>;

  const riders = getRiders();
  const customers = getCustomers();
  const totalRevenue = getTotalRevenue();
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const pendingRiders = riders.filter(r => r.status === 'pending');
  const onlineRiders = riders.filter(r => r.availability === 'online' && r.status === 'approved');

  const card = cn('app-card p-6', dk ? '' : 'bg-white');
  const inp = cn('w-full px-4 py-2.5 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900');

  const riderMarkers = riders
    // Strict gate: riders with null/missing/malformed locations (e.g. never
    // set a location / malformed rider_location jsonb) are dropped here so
    // a NaN coordinate never reaches MapView -> LngLat (crash).
    .filter(r => r.location && Number.isFinite(r.location.lat) && Number.isFinite(r.location.lng) && r.status === 'approved' && r.availability !== 'offline')
    .map(r => ({
      lat: r.location!.lat, lng: r.location!.lng,
      color: r.availability === 'online' ? '#22C55E' : r.availability === 'busy' ? '#F59E0B' : '#666',
      popup: `${r.name} (${r.availability})`,
    }));

  return (
    <div className={tab === 'map' ? 'min-h-screen' : 'pt-20 min-h-screen'}>
      {tab !== 'map' && <section className={cn('py-6', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield size={24} className="text-brand" />
            <div>
              <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Manager Dashboard</h1>
              <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>Manage orders, riders, pricing & content</p>
            </div>
          </div>
          <p className={cn('text-sm', dk ? 'text-white/45' : 'text-gray-500')}>Overview</p>
        </div>
      </section>}

      <section className={tab === 'map' ? 'fixed inset-0 z-10 pt-16' : cn('py-6', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className={tab === 'map' ? 'h-full' : 'max-w-7xl mx-auto px-6'}>
          {tab === 'overview' && (
            <div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { icon: DollarSign, label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-success' },
                  { icon: Package, label: 'Total Orders', value: orders.length, color: 'text-brand' },
                  { icon: Users, label: 'Total Riders', value: riders.length, color: 'text-info' },
                  { icon: Bike, label: 'Online Riders', value: onlineRiders.length, color: 'text-success' },
                ].map(s => (
                  <div key={s.label} className={card}>
                    <s.icon size={20} className={`${s.color} mb-2`} />
                    <p className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>{s.value}</p>
                    <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>{s.label}</p>
                  </div>
                ))}
              </div>
              {pendingRiders.length > 0 && (
                <div className={cn('p-4 rounded-xl border mb-6 flex items-center gap-3', 'border-warning/30 bg-warning/5')}>
                  <AlertTriangle size={20} className="text-warning" />
                  <span className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>{pendingRiders.length} rider(s) pending approval</span>
                  <button onClick={() => selectTab('riders')} className="ml-auto text-brand text-sm font-bold">Review</button>
                </div>
              )}
              <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Recent Orders</h3>
              <div className="space-y-3">
                {orders.slice(0, 8).map(o => (
                  <button type="button" key={o.id} onClick={() => openOrder(o.id)} className={cn('w-full p-4 rounded-xl border flex flex-wrap items-center gap-4 text-left transition hover:border-brand/40', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                    <span className={cn('font-bold text-sm', dk ? 'text-white' : 'text-gray-900')}>{o.displayCode}</span>
                    <span className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>{o.customerName}</span>
                    <span className={cn('text-sm', dk ? 'text-white/40' : 'text-gray-400')}>{o.riderName || 'No rider'}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize ml-auto',
                      o.status==='delivered'?'bg-success/10 text-success':o.status==='cancelled'?'bg-danger/10 text-danger':'bg-warning/10 text-warning')}>{o.status.replace('_',' ')}</span>
                    <span className="text-brand font-bold text-sm">{formatCurrency(o.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'orders' && (() => {
            const selectedOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : undefined;
            const filteredOrders = orders.filter(o => orderFilter === 'active'
              ? ['accepted', 'picked_up', 'in_transit'].includes(o.status)
              : orderFilter === 'available'
                ? o.status === 'pending'
                : ['delivered', 'cancelled'].includes(o.status));

            if (selectedOrder) return (
              <div className="space-y-5">
                <button type="button" onClick={() => setSelectedOrderId(null)} className={cn('inline-flex items-center gap-2 text-sm font-bold', dk ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-900')}>
                  <ArrowLeft size={17} /> Back to orders
                </button>
                <div className={cn('rounded-3xl border p-5 md:p-7', dk ? 'border-white/10 bg-surface-dark-3' : 'border-gray-200 bg-white')}>
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.14em] text-brand">Order {selectedOrder.displayCode}</p>
                      <h2 className={cn('mt-1 text-2xl font-black capitalize', dk ? 'text-white' : 'text-gray-900')}>{selectedOrder.status.replace('_', ' ')}</h2>
                    </div>
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand">{formatCurrency(selectedOrder.price)}</span>
                  </div>
                  <div className="mb-5 grid gap-3 sm:grid-cols-2">
                    <div className={cn('rounded-2xl p-4', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}><p className="text-xs text-gray-400">Customer</p><p className={cn('mt-1 font-bold', dk ? 'text-white' : 'text-gray-900')}>{selectedOrder.customerName}</p><p className="text-xs text-gray-500">{selectedOrder.customerPhone}</p></div>
                    <div className={cn('rounded-2xl p-4', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}><p className="text-xs text-gray-400">Rider</p><p className={cn('mt-1 font-bold', dk ? 'text-white' : 'text-gray-900')}>{selectedOrder.riderName || 'Waiting for a rider'}</p><p className="text-xs capitalize text-gray-500">{selectedOrder.vehicleType}</p></div>
                  </div>
                  <div className="mb-5 space-y-3"><div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-success" /><div><p className="text-xs text-gray-400">Pickup</p><p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-800')}>{selectedOrder.pickup.address}</p></div></div><div className="ml-1 h-5 border-l border-dashed border-gray-300" /><div className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand" /><div><p className="text-xs text-gray-400">Drop-off</p><p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-800')}>{selectedOrder.dropoff.address}</p></div></div></div>
                  <MapView center={[selectedOrder.pickup.lat, selectedOrder.pickup.lng]} zoom={11} className="h-[360px] rounded-2xl" markers={[{ lat: selectedOrder.pickup.lat, lng: selectedOrder.pickup.lng, color: '#10B981', popup: 'Pickup', icon: 'pickup' }, { lat: selectedOrder.dropoff.lat, lng: selectedOrder.dropoff.lng, color: '#C41E1E', popup: 'Drop-off', icon: 'dropoff' }]} route={[[selectedOrder.pickup.lat, selectedOrder.pickup.lng], [selectedOrder.dropoff.lat, selectedOrder.dropoff.lng]]} />
                </div>
              </div>
            );

            return (
              <div className="space-y-5">
                <div><h2 className={cn('text-2xl font-black', dk ? 'text-white' : 'text-gray-900')}>Orders</h2><p className={cn('mt-1 text-sm', dk ? 'text-white/45' : 'text-gray-500')}>Review active, available, and completed deliveries.</p></div>
                <div className={cn('flex w-full max-w-xl gap-1 rounded-2xl p-1', dk ? 'bg-surface-dark-3' : 'bg-gray-100')}>
                  {(['active', 'available', 'completed'] as const).map(filter => <button key={filter} type="button" onClick={() => setOrderFilter(filter)} className={cn('flex-1 rounded-xl px-3 py-2.5 text-sm font-bold capitalize transition', orderFilter === filter ? 'bg-brand text-white shadow' : dk ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900')}>{filter} <span className="ml-1 text-xs opacity-70">({orders.filter(o => filter === 'active' ? ['accepted','picked_up','in_transit'].includes(o.status) : filter === 'available' ? o.status === 'pending' : ['delivered','cancelled'].includes(o.status)).length})</span></button>)}
                </div>
                <div className="space-y-3">
                  {filteredOrders.length === 0 && <div className={cn('rounded-2xl border p-10 text-center text-sm', dk ? 'border-white/10 text-white/40' : 'border-gray-200 text-gray-500')}>No {orderFilter} orders right now.</div>}
                  {filteredOrders.map(o => <button type="button" key={o.id} onClick={() => setSelectedOrderId(o.id)} className={cn('flex w-full flex-wrap items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40', dk ? 'border-white/5 bg-surface-dark-3' : 'border-gray-200 bg-white')}><div className="min-w-[95px]"><p className={cn('font-black', dk ? 'text-white' : 'text-gray-900')}>{o.displayCode}</p><p className="text-xs text-gray-400">{timeAgo(o.createdAt)}</p></div><div className="min-w-[180px] flex-1"><p className={cn('text-sm font-semibold', dk ? 'text-white/80' : 'text-gray-800')}>{o.customerName}</p><p className="truncate text-xs text-gray-400">{o.pickup.address} → {o.dropoff.address}</p></div><span className="capitalize text-xs font-bold text-brand">{o.status.replace('_', ' ')}</span><span className="font-bold text-brand">{formatCurrency(o.price)}</span><ChevronDown className="-rotate-90 text-gray-400" size={18} /></button>)}
                </div>
              </div>
            );
          })()}

          {tab === 'riders' && (() => {
            const selectedRider = selectedRiderId ? riders.find(r => r.id === selectedRiderId) : undefined;
            if (selectedRider) return (
              <div className="space-y-5">
                <button type="button" onClick={closeRider} className={cn('inline-flex items-center gap-2 text-sm font-bold', dk ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-900')}><ArrowLeft size={17} /> Back to riders</button>
                <div className={cn('rounded-3xl border p-5 md:p-7', dk ? 'border-white/10 bg-surface-dark-3' : 'border-gray-200 bg-white')}>
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-black text-white">{selectedRider.name[0]}</div><div><h2 className={cn('text-2xl font-black', dk ? 'text-white' : 'text-gray-900')}>{selectedRider.name}</h2><p className="text-sm capitalize text-gray-500">{selectedRider.vehicleType} · {selectedRider.vehiclePlate}</p></div></div>
                    <div className="flex gap-2"><span className={cn('rounded-full px-3 py-1 text-xs font-bold capitalize', selectedRider.status === 'approved' ? 'bg-success/10 text-success' : selectedRider.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger')}>{selectedRider.status}</span>{selectedRider.status === 'pending' && <><button onClick={() => approveRider(selectedRider.id)} className="rounded-full bg-success px-3 py-1 text-xs font-bold text-white">Approve</button><button onClick={() => rejectRider(selectedRider.id)} className="rounded-full bg-danger px-3 py-1 text-xs font-bold text-white">Reject</button></>}</div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2"><div className={cn('rounded-2xl border p-4', dk ? 'border-white/10 bg-surface-dark-2' : 'border-gray-200 bg-gray-50')}><h3 className={cn('mb-3 font-bold', dk ? 'text-white' : 'text-gray-900')}>National ID / document</h3>{selectedRider.nationalIdUrl ? <img src={selectedRider.nationalIdUrl} alt={`${selectedRider.name} national ID`} className="max-h-72 w-full rounded-xl object-contain" /> : <p className="text-sm text-gray-500">No document uploaded yet.</p>}</div><div className={cn('rounded-2xl border p-4', dk ? 'border-white/10 bg-surface-dark-2' : 'border-gray-200 bg-gray-50')}><h3 className={cn('mb-3 font-bold', dk ? 'text-white' : 'text-gray-900')}>Profile photo</h3>{selectedRider.photoUrl ? <img src={selectedRider.photoUrl} alt={`${selectedRider.name} verification photo`} className="max-h-72 w-full rounded-xl object-contain" /> : <p className="text-sm text-gray-500">No photo uploaded yet.</p>}</div></div>
                  <div className={cn('mt-5 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-3', dk ? 'bg-surface-dark-2 text-white/65' : 'bg-gray-50 text-gray-600')}><span>Email: {selectedRider.email || '—'}</span><span>Phone: {selectedRider.phone || '—'}</span><span>Availability: {selectedRider.availability}</span></div>
                </div>
              </div>
            );
            const renderRider = (r: RiderProfile) => <button type="button" key={r.id} onClick={() => openRider(r.id)} className={cn('flex w-full flex-wrap items-center gap-4 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/40', dk ? 'border-white/5 bg-surface-dark-3' : 'border-gray-200 bg-white')}><div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{r.name[0]}</div><div className="min-w-[200px] flex-1"><p className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{r.name}</p><p className="text-xs text-gray-500">{r.email || r.phone} · {r.vehicleType} · {r.vehiclePlate}</p><span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold capitalize', r.status === 'approved' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{r.status}</span></div><span className="text-sm font-semibold capitalize text-gray-500">{r.availability}</span><ChevronDown className="-rotate-90 text-gray-400" size={18} /></button>;
            return <div className="space-y-7"><div><h2 className={cn('text-2xl font-black', dk ? 'text-white' : 'text-gray-900')}>Riders & verification</h2><p className="mt-1 text-sm text-gray-500">Review accepted riders and applications waiting for document approval.</p></div><section><div className="mb-3 flex items-center justify-between"><h3 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>Accepted riders ({riders.filter(r => r.status === 'approved').length})</h3><span className="text-xs text-success">Ready to work</span></div><div className="space-y-3">{riders.filter(r => r.status === 'approved').map(renderRider)}</div></section><section><div className="mb-3 flex items-center justify-between"><h3 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>Pending verification ({pendingRiders.length})</h3><span className="text-xs text-warning">Needs review</span></div><div className="space-y-3">{pendingRiders.length ? pendingRiders.map(renderRider) : <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No riders are waiting for verification.</p>}</div></section></div>;
          })()}

          {tab === 'map' && (
            <div className="relative h-full">
              <MapView markers={riderMarkers} className="h-full w-full rounded-none" zoom={12} />
            </div>
          )}

          {tab === 'pricing' && (
            <div className="space-y-6">
              <div className={card}>
                <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Pricing Mode</h3>
                <div className="flex gap-3">
                  {(['auto', 'manual', 'hybrid'] as const).map(m => (
                    <button key={m} onClick={() => setPricingMode(m)}
                      className={cn('px-4 py-2 rounded-full text-sm font-semibold capitalize transition',
                        pricingMode === m ? 'bg-brand text-white' : dk ? 'bg-surface-dark-3 text-white/50' : 'bg-gray-100 text-gray-500')}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className={cn('text-xs mt-2', dk ? 'text-white/30' : 'text-gray-400')}>
                  Auto: algorithm-based · Manual: fixed prices by distance · Hybrid: auto with manual overrides
                </p>
              </div>

              <div className={card}>
                <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Price Rules</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className={dk ? 'text-white/40' : 'text-gray-500'}>
                      <th className="text-left p-2">Vehicle</th><th className="p-2">Range (km)</th><th className="p-2">Base</th><th className="p-2">/km Rate</th><th className="p-2">Fuel</th><th className="p-2">Margin</th>
                    </tr></thead>
                    <tbody>
                      {priceRules.map(r => (
                        <tr key={r.id} className={cn('border-t', dk ? 'border-white/5' : 'border-gray-100')}>
                          <td className={cn('p-2 capitalize font-medium', dk ? 'text-white' : 'text-gray-900')}>{r.vehicleType}</td>
                          <td className={cn('p-2 text-center', dk ? 'text-white/60' : 'text-gray-600')}>{r.minDistance}-{r.maxDistance}</td>
                          <td className="p-2 text-center"><input type="number" step="0.5" value={r.baseFare} onChange={e => updatePriceRule(r.id, { baseFare: +e.target.value })} className={cn('w-16 text-center rounded-lg py-1 border', dk ? 'bg-surface-dark-3 border-white/10 text-white' : 'bg-gray-50 border-gray-200')} /></td>
                          <td className="p-2 text-center"><input type="number" step="0.1" value={r.perKmRate} onChange={e => updatePriceRule(r.id, { perKmRate: +e.target.value })} className={cn('w-16 text-center rounded-lg py-1 border', dk ? 'bg-surface-dark-3 border-white/10 text-white' : 'bg-gray-50 border-gray-200')} /></td>
                          <td className="p-2 text-center"><input type="number" step="0.1" value={r.fuelSurcharge} onChange={e => updatePriceRule(r.id, { fuelSurcharge: +e.target.value })} className={cn('w-16 text-center rounded-lg py-1 border', dk ? 'bg-surface-dark-3 border-white/10 text-white' : 'bg-gray-50 border-gray-200')} /></td>
                          <td className="p-2 text-center"><input type="number" step="0.05" value={r.companyMargin} onChange={e => updatePriceRule(r.id, { companyMargin: +e.target.value })} className={cn('w-16 text-center rounded-lg py-1 border', dk ? 'bg-surface-dark-3 border-white/10 text-white' : 'bg-gray-50 border-gray-200')} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(pricingMode === 'manual' || pricingMode === 'hybrid') && (
                <div className={card}>
                  <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Manual Price Overrides</h3>
                  <div className="flex gap-3 mb-4">
                    <input value={newOverrideKey} onChange={e => setNewOverrideKey(e.target.value)} placeholder="Key (e.g. motorcycle-5)" className={inp} />
                    <input type="number" value={newOverridePrice} onChange={e => setNewOverridePrice(e.target.value)} placeholder="Price (GHS)" className={cn(inp, 'w-32')} />
                    <button onClick={() => { if (newOverrideKey && newOverridePrice) { setManualOverride(newOverrideKey, +newOverridePrice); setNewOverrideKey(''); setNewOverridePrice(''); } }} className="bg-brand text-white px-4 py-2 rounded-full text-sm font-bold shrink-0">Add</button>
                  </div>
                  {Object.entries(manualOverrides).map(([k, v]) => (
                    <div key={k} className={cn('flex items-center justify-between py-2 border-b', dk ? 'border-white/5' : 'border-gray-100')}>
                      <span className={cn('text-sm font-mono', dk ? 'text-white/70' : 'text-gray-700')}>{k}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-brand font-bold">{formatCurrency(v)}</span>
                        <button onClick={() => removeManualOverride(k)} className="text-danger text-xs">Remove</button>
                      </div>
                    </div>
                  ))}
                  {Object.keys(manualOverrides).length === 0 && <p className={cn('text-sm', dk ? 'text-white/30' : 'text-gray-400')}>No overrides set</p>}
                </div>
              )}
            </div>
          )}

          {tab === 'content' && (
            <div className={card}>
              <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Edit Website Content</h3>
              <p className={cn('text-sm mb-6', dk ? 'text-white/40' : 'text-gray-500')}>Update text content across the website.</p>
              <div className="space-y-4">
                {Object.entries(content).map(([key, val]) => (
                  <div key={key} className={cn('p-4 rounded-xl border', dk ? 'border-white/5' : 'border-gray-100')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn('text-xs font-mono', dk ? 'text-white/30' : 'text-gray-400')}>{key}</span>
                      {editKey === key ? (
                        <div className="flex gap-2">
                          <button onClick={() => { updateContent(key, editVal); setEditKey(null); }} className="text-success text-xs font-bold">Save</button>
                          <button onClick={() => setEditKey(null)} className="text-danger text-xs font-bold">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditKey(key); setEditVal(val); }} className="text-brand text-xs font-bold"><Edit3 size={12} className="inline mr-1" />Edit</button>
                      )}
                    </div>
                    {editKey === key ? (
                      <textarea value={editVal} onChange={e => setEditVal(e.target.value)} rows={3} className={cn(inp, 'resize-none')} />
                    ) : (
                      <p className={cn('text-sm', dk ? 'text-white/70' : 'text-gray-700')}>{val}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
