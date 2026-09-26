import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, Package, DollarSign, MapPin, CheckCircle2, XCircle, Eye, Settings, Edit3, Bike, Shield, AlertTriangle, Sliders } from 'lucide-react';
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
  const [tab, setTab] = useState<Tab>('overview');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newOverrideKey, setNewOverrideKey] = useState('');
  const [newOverridePrice, setNewOverridePrice] = useState('');

  if (!user || user.role !== 'manager') return <div className="pt-20 min-h-screen flex items-center justify-center"><p className={dk?'text-white/50':'text-gray-500'}>Access denied. Manager login required.</p></div>;

  const riders = getRiders();
  const customers = getCustomers();
  const totalRevenue = getTotalRevenue();
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const activeOrders = orders.filter(o => ['accepted', 'picked_up', 'in_transit'].includes(o.status));
  const pendingRiders = riders.filter(r => r.status === 'pending');
  const onlineRiders = riders.filter(r => r.availability === 'online' && r.status === 'approved');

  const card = cn('p-6 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200');
  const inp = cn('w-full px-4 py-2.5 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900');

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'orders', label: 'Orders', icon: Package },
    { key: 'riders', label: 'Riders', icon: Users },
    { key: 'map', label: 'Live Map', icon: MapPin },
    { key: 'pricing', label: 'Pricing', icon: Sliders },
    { key: 'content', label: 'Content', icon: Edit3 },
  ];

  const riderMarkers = riders
    // Strict gate: riders with null/missing/malformed locations (e.g. never
    // set a location / malformed rider_location jsonb) are dropped here so
    // a NaN coordinate never reaches MapView -> LngLat (crash).
    .filter(r => r.location && Number.isFinite(r.location.lat) && Number.isFinite(r.location.lng) && r.status === 'approved')
    .map(r => ({
      lat: r.location!.lat, lng: r.location!.lng,
      color: r.availability === 'online' ? '#22C55E' : r.availability === 'busy' ? '#F59E0B' : '#666',
      popup: `${r.name} (${r.availability})`,
    }));

  return (
    <div className="pt-20 min-h-screen">
      <section className={cn('py-6', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield size={24} className="text-brand" />
            <div>
              <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Manager Dashboard</h1>
              <p className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>Manage orders, riders, pricing & content</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition',
                  tab === t.key ? 'bg-brand text-white' : dk ? 'bg-surface-dark-2 text-white/50 hover:text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700')}>
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={cn('py-6', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-7xl mx-auto px-6">
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
                  <button onClick={() => setTab('riders')} className="ml-auto text-brand text-sm font-bold">Review</button>
                </div>
              )}
              <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Recent Orders</h3>
              <div className="space-y-3">
                {orders.slice(0, 8).map(o => (
                  <div key={o.id} className={cn('p-4 rounded-xl border flex flex-wrap items-center gap-4', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                    <span className={cn('font-bold text-sm', dk ? 'text-white' : 'text-gray-900')}>{o.displayCode}</span>
                    <span className={cn('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>{o.customerName}</span>
                    <span className={cn('text-sm', dk ? 'text-white/40' : 'text-gray-400')}>{o.riderName || 'No rider'}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize ml-auto',
                      o.status==='delivered'?'bg-success/10 text-success':o.status==='cancelled'?'bg-danger/10 text-danger':'bg-warning/10 text-warning')}>{o.status.replace('_',' ')}</span>
                    <span className="text-brand font-bold text-sm">{formatCurrency(o.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div>
              <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>All Orders ({orders.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className={dk ? 'text-white/40' : 'text-gray-500'}>
                    <th className="text-left p-3">ID</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Rider</th><th className="text-left p-3">Route</th><th className="text-left p-3">Status</th><th className="text-right p-3">Price</th><th className="text-right p-3">Date</th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className={cn('border-t', dk ? 'border-white/5' : 'border-gray-100')}>
                        <td className={cn('p-3 font-bold', dk ? 'text-white' : 'text-gray-900')}>{o.displayCode}</td>
                        <td className={cn('p-3', dk ? 'text-white/70' : 'text-gray-700')}>{o.customerName}</td>
                        <td className={cn('p-3', dk ? 'text-white/50' : 'text-gray-500')}>{o.riderName || '-'}</td>
                        <td className={cn('p-3 max-w-[200px] truncate', dk ? 'text-white/40' : 'text-gray-400')}>{o.pickup.address} → {o.dropoff.address}</td>
                        <td className="p-3"><span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize',
                          o.status==='delivered'?'bg-success/10 text-success':'bg-warning/10 text-warning')}>{o.status.replace('_',' ')}</span></td>
                        <td className="p-3 text-right text-brand font-bold">{formatCurrency(o.price)}</td>
                        <td className={cn('p-3 text-right', dk ? 'text-white/30' : 'text-gray-400')}>{timeAgo(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'riders' && (
            <div className="space-y-4">
              <h3 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>All Riders ({riders.length})</h3>
              {riders.map(r => (
                <div key={r.id} className={cn('p-5 rounded-xl border flex flex-wrap items-center gap-4', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
                  <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-bold text-lg">{r.name[0]}</div>
                  <div className="flex-1 min-w-[200px]">
                    <p className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{r.name}</p>
                    <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>{r.email || r.phone} · {r.vehicleType} · {r.vehiclePlate}</p>
                    <div className="flex gap-2 mt-1">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize',
                        r.status==='approved'?'bg-success/10 text-success':r.status==='pending'?'bg-warning/10 text-warning':'bg-danger/10 text-danger')}>{r.status}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold capitalize',
                        r.availability==='online'?'bg-success/10 text-success':r.availability==='busy'?'bg-warning/10 text-warning':'bg-surface-dark-3 text-white/30')}>{r.availability}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {r.status === 'pending' && <>
                      <button onClick={() => approveRider(r.id)} className="px-3 py-1.5 rounded-lg bg-success text-white text-xs font-bold"><CheckCircle2 size={14} className="inline mr-1" />Approve</button>
                      <button onClick={() => rejectRider(r.id)} className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-bold"><XCircle size={14} className="inline mr-1" />Reject</button>
                    </>}
                    {r.status === 'approved' && <button onClick={() => suspendRider(r.id)} className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-bold">Suspend</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'map' && (
            <div>
              <div className="flex items-center gap-4 mb-4">
                <h3 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>Live Rider Map</h3>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-success" /> Online ({onlineRiders.length})</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-warning" /> Busy</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-500" /> Offline</span>
                </div>
              </div>
              <MapView markers={riderMarkers} className="h-[500px]" zoom={12} />
            </div>
          )}

          {tab === 'pricing' && (
            <div className="space-y-6">
              <div className={card}>
                <h3 className={cn('font-bold mb-4', dk ? 'text-white' : 'text-gray-900')}>Pricing Mode</h3>
                <div className="flex gap-3">
                  {(['auto', 'manual', 'hybrid'] as const).map(m => (
                    <button key={m} onClick={() => setPricingMode(m)}
                      className={cn('px-4 py-2 rounded-xl text-sm font-semibold capitalize transition',
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
                    <button onClick={() => { if (newOverrideKey && newOverridePrice) { setManualOverride(newOverrideKey, +newOverridePrice); setNewOverrideKey(''); setNewOverridePrice(''); } }} className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-bold shrink-0">Add</button>
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
