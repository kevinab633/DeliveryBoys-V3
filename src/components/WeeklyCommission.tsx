import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { createWeeklyCommissionApi, type CommissionCycle, type CommissionReview, type CommissionHold } from '../lib/weeklyCommissionApi';

const api = createWeeklyCommissionApi(supabase);
const ghanaDate = (value: string) => new Date(value).toLocaleString('en-GH', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' });
const money = (value: number | string) => `GH₵ ${(Number(value) / 100).toFixed(2)}`;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Could not complete the request. Please try again.';

/** Development preview only: requires the matching database drafts. */
export function WeeklyCommissionRider() {
  const [cycles, setCycles] = useState<CommissionCycle[] | null>(null);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setCycles(await api.cycles()); setError(''); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const report = async (id: string) => {
    const file = files[id]; if (!file) { setError('Choose a payment screenshot first.'); return; }
    setBusy(true); setError('');
    try { await api.report(id, file); setFiles(f => ({ ...f, [id]: undefined })); await load(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="app-card mt-6 p-5" aria-label="Weekly commission">
    <h2 className="text-lg font-bold">Weekly commission statements</h2>
    <p className="mt-1 text-sm text-gray-500">Weeks run Monday to Sunday, Ghana time. Payment must be confirmed by the manager.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    {!cycles ? <p className="mt-3 text-sm">Loading statements…</p> : cycles.length === 0 ? <p className="mt-3 text-sm">No closed statements yet.</p> :
      <div className="mt-4 space-y-4">{cycles.map(c => <article key={c.id} className="rounded-xl border border-gray-300 p-4">
        <p className="font-bold">{money(c.amount_pesewas)} · <span className="capitalize">{c.state}</span></p>
        <p className="text-sm">Week starting {ghanaDate(c.week_start)} · Due {ghanaDate(c.deadline)} GMT</p>
        {c.state === 'pending' && <p className="mt-2 text-sm">Your screenshot is waiting for manager review.</p>}
        {c.state === 'rejected' && <p className="mt-2 text-sm">Payment was rejected. Upload a new screenshot to resubmit.</p>}
        {(c.state === 'unpaid' || c.state === 'rejected') && <div className="mt-3 flex flex-wrap gap-2">
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Payment screenshot" onChange={e => setFiles(f => ({ ...f, [c.id]: e.target.files?.[0] }))} />
          <button disabled={busy} onClick={() => void report(c.id)} className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Submit payment proof</button>
        </div>}
      </article>)}</div>}
  </section>;
}

/** Manager actions are authorized by the database, never by this UI. */
export function WeeklyCommissionManager() {
  const [reviews, setReviews] = useState<CommissionReview[] | null>(null);
  const [holds, setHolds] = useState<CommissionHold[] | null>(null);
  const [days, setDays] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(async () => { try { const [nextReviews, nextHolds] = await Promise.all([api.reviews(), api.holds()]); setReviews(nextReviews); setHolds(nextHolds); setError(''); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const review = async (id: string, approve: boolean) => {
    if (!window.confirm(approve ? 'Confirm that this payment was received?' : 'Reject this payment screenshot?')) return;
    setBusy(true); setError(''); setNotice('');
    try { await api.review(id, approve); await load(); setNotice(approve ? 'Payment confirmed.' : 'Payment rejected.'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const openProof = async (path: string) => {
    // Open synchronously to avoid popup blockers; never persist the signed URL.
    const tab = window.open('', '_blank');
    if (!tab) { setError('Allow pop-ups to view the screenshot.'); return; }
    tab.opener = null;
    try { tab.location.replace(await api.proofUrl(path)); } catch (e) { tab.close(); setError(errorText(e)); }
  };
  const save = async () => { setBusy(true); setError(''); setNotice(''); try { await api.setDeadlineDays(Number(days)); setNotice('Deadline saved for future statements.'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  const reapprove = async (id: string) => {
    if (!window.confirm('Allow this rider to accept deliveries again?')) return;
    setBusy(true); setError(''); setNotice('');
    try { await api.reapprove(id); await load(); setNotice('Rider reapproved.'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="app-card p-5" aria-label="Weekly commission management">
    <h2 className="text-lg font-bold">Weekly commission</h2>
    <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Deadline days after week ends<input type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} className="ml-2 w-20 rounded border p-2 text-gray-900" /></label>
      <button disabled={busy} onClick={() => void save()} className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save deadline</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}{notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    <h3 className="mt-5 font-bold">Riders requiring reapproval</h3>
    {!holds ? <p className="mt-2 text-sm">Loading…</p> : holds.length === 0 ? <p className="mt-2 text-sm">No riders require reapproval.</p> : <div className="mt-3 space-y-3">{holds.map(h => <div key={h.rider_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-300 p-4"><div><p className="font-semibold">{h.rider_name}</p><p className="text-sm">{h.overdue_remaining ? 'Overdue statements remain unpaid.' : 'All overdue statements cleared.'}</p></div><button disabled={busy || h.overdue_remaining} onClick={() => void reapprove(h.rider_id)} className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reapprove rider</button></div>)}</div>}
    <h3 className="mt-5 font-bold">Payments awaiting review</h3>
    {!reviews ? <p className="mt-2 text-sm">Loading…</p> : reviews.length === 0 ? <p className="mt-2 text-sm">No payments awaiting review.</p> : <div className="mt-3 space-y-3">{reviews.map(c => <article key={c.id} className="rounded-xl border border-gray-300 p-4">
      <p className="font-semibold">Rider {c.rider_id} · {money(c.amount_pesewas)}</p><p className="text-sm">Week starting {ghanaDate(c.week_start)} · Due {ghanaDate(c.deadline)} GMT</p>
      <div className="mt-3 flex flex-wrap gap-2">{c.proof_path && <button type="button" onClick={() => void openProof(c.proof_path!)} className="rounded-full border px-4 py-2 text-sm">View screenshot</button>}
        <button disabled={busy} onClick={() => void review(c.id, true)} className="rounded-full bg-success px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm</button>
        <button disabled={busy} onClick={() => void review(c.id, false)} className="rounded-full bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button></div>
    </article>)}</div>}
  </section>;
}
