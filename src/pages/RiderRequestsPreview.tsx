import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import supabase from '../lib/supabase';
import { createVerifiedAuth } from '../lib/verifiedAuth';
import { usersApi } from '../lib/usersApi';

type Request = { status: 'pending'|'rejected'|'approved'; vehicle_type: string; vehicle_plate: string };
type Pending = { request_id: string; name: string; vehicle_type: string; vehicle_plate: string };
const text = (e: unknown) => e instanceof Error ? e.message : 'Unable to complete the request.';

export function RiderApplicationPreview() {
  const [status,setStatus]=useState<Request|null>(null); const [loading,setLoading]=useState(true);
  const [vehicle,setVehicle]=useState('motorcycle'); const [plate,setPlate]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const load=async()=>{ const {data,error:e}=await supabase.rpc('my_rider_request'); if(e) throw e; setStatus(data?.[0] ?? null); };
  useEffect(()=>{void (async()=>{try {await load();} catch(e){setError(text(e));} finally{setLoading(false);}})();},[]);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const {error}=await supabase.rpc('submit_rider_request',{p_vehicle_type:vehicle,p_vehicle_plate:plate});if(error)throw error;await load();}catch(e){setError(text(e));}finally{setBusy(false);}};
  return <main className="mx-auto min-h-screen max-w-lg px-4 py-24"><h1 className="text-3xl font-bold">Apply to be a rider</h1>
    <p className="mt-3">This is a test application. Rider access requires manager approval.</p>
    {error && <p role="alert" className="mt-3 text-red-500">{error}</p>}
    {loading ? <p>Loading…</p> : status?.status==='pending' ? <p className="mt-4">Waiting for approval.</p> : status?.status==='approved' ? <p className="mt-4">Approved. Sign out and sign in again to open your rider dashboard.</p> : <form onSubmit={submit} className="mt-4 space-y-4">
      {status?.status==='rejected' && <p>Your last request was rejected. You may submit another.</p>}
      <label className="block">Vehicle type<select value={vehicle} onChange={e=>setVehicle(e.target.value)} className="block w-full rounded border p-3 text-gray-900"><option value="motorcycle">Motorcycle</option><option value="car">Car</option><option value="van">Van</option><option value="truck">Truck</option></select></label>
      <label className="block">Vehicle plate<input required maxLength={40} value={plate} onChange={e=>setPlate(e.target.value)} className="block w-full rounded border p-3 text-gray-900" /></label>
      <button disabled={busy} className="rounded-full bg-brand px-5 py-3 font-bold text-white">Submit request</button></form>}
    <Link className="mt-4 inline-block text-brand" to="/auth/login">Sign in with Google</Link></main>;
}

export function RiderReviewPreview() {
 const [rows,setRows]=useState<Pending[]|null>(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const load=async()=>{const {data,error}=await supabase.rpc('pending_rider_requests');if(error)throw error;setRows(data ?? []);};
 useEffect(()=>{void load().catch(e=>setError(text(e)));},[]);
 const review=async(id:string,approve:boolean)=>{if(!window.confirm(approve?'Approve this rider?':'Reject this request?'))return;setBusy(true);setError('');try{const {error}=await supabase.rpc('review_rider_request',{p_request_id:id,p_approve:approve});if(error)throw error;await load();}catch(e){setError(text(e));}finally{setBusy(false);}};
 return <section className="app-card p-5"><h2 className="text-lg font-bold">Rider applications</h2><p className="text-sm">Test only: identity documents are not collected by this preview.</p>{error && <p role="alert" className="text-red-500">{error}</p>}{rows===null?<p>Loading…</p>:rows.length===0?<p>No pending applications.</p>:rows.map(r=><article key={r.request_id} className="mt-3 rounded-xl border p-4"><p className="font-bold">{r.name}</p><p>{r.vehicle_type} · {r.vehicle_plate}</p><div className="mt-2 flex gap-2"><button disabled={busy} onClick={()=>void review(r.request_id,true)} className="rounded bg-green-700 px-4 py-2 text-white">Approve</button><button disabled={busy} onClick={()=>void review(r.request_id,false)} className="rounded bg-red-700 px-4 py-2 text-white">Reject</button></div></article>)}</section>;
}

export function VerifiedRiderGate({children}:{children:React.ReactNode}) {
 const [state,setState]=useState<'loading'|'allowed'|'denied'>('loading');
 useEffect(()=>{let active=true;void(async()=>{try{const identities=await createVerifiedAuth(supabase).getLinkedIdentities();const rider=identities.find(i=>i.app_role==='rider');const profile=rider && await usersApi.fetchById(rider.app_user_id);if(active)setState(profile?.role==='rider' && 'status' in profile && profile.status==='approved'?'allowed':'denied');}catch{if(active)setState('denied');}})();return()=>{active=false;};},[]);
 if(state==='loading')return <p className="pt-24 text-center">Checking rider access…</p>;
 if(state==='denied')return <div className="pt-24 text-center"><p>Rider access is unavailable or waiting for approval.</p><Link className="text-brand" to="/rider/apply">Apply or check your application</Link></div>;
 return <>{children}</>;
}
