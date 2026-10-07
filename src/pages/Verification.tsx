import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, ImagePlus, ShieldCheck, Upload, AlertTriangle } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import supabase from '../lib/supabase';
import { cn } from '../lib/utils';
import { showToast } from '../components/Toast';

const BUCKET = 'rider-verification';
type Key = 'nationalId' | 'selfie' | 'profile';
type Entry = { file: File; quality: { ok: boolean; message: string } };
type Files = Partial<Record<Key, Entry>>;

async function inspectImage(file: File): Promise<{ ok: boolean; message: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    if (width < 900 || height < 600) return { ok: false, message: 'Image is too small. Move closer or use a higher resolution camera.' };
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 80;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: true, message: 'Resolution looks good.' };
    ctx.drawImage(bitmap, 0, 0, 80, 80);
    const pixels = ctx.getImageData(0, 0, 80, 80).data;
    let total = 0; let variance = 0;
    for (let i = 0; i < pixels.length; i += 4) total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    const average = total / (pixels.length / 4);
    for (let i = 0; i < pixels.length; i += 4) variance += Math.abs(((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3) - average);
    bitmap.close();
    if (average < 35) return { ok: false, message: 'Image looks too dark. Add light and try again.' };
    if (average > 238) return { ok: false, message: 'Image looks overexposed. Avoid direct glare and try again.' };
    if (variance < 8) return { ok: false, message: 'Image may be blurred or covered. Hold the camera steady and try again.' };
    return { ok: true, message: 'Image looks clear enough for review.' };
  } catch { return { ok: false, message: 'We could not read this image. Try capturing it again.' }; }
}

export default function VerificationPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const user = useAuthStore(s => s.user);
  const update = useAuthStore(s => s.updateRiderVerification);
  const navigate = useNavigate();
  const [files, setFiles] = useState<Files>({});
  const [saving, setSaving] = useState(false);

  if (!user || user.role !== 'rider') return <div className="min-h-screen pt-24 text-center">Sign in as a rider to continue.</div>;

  const choose = (key: Key) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const quality = await inspectImage(file);
    setFiles(prev => ({ ...prev, [key]: { file, quality } }));
  };

  const submit = async () => {
    const required: Key[] = ['nationalId', 'selfie', 'profile'];
    if (required.some(key => !files[key])) {
      showToast({ title: 'Documents needed', message: 'Capture or upload all three images.', type: 'warning' }); return;
    }
    const rejected = required.find(key => !files[key]!.quality.ok);
    if (rejected) { showToast({ title: 'Image quality needs attention', message: files[rejected]!.quality.message, type: 'warning' }); return; }
    setSaving(true);
    try {
      const urls: Record<string, string> = {};
      for (const key of required) {
        const file = files[key]!.file;
        const path = `${user.id}/${Date.now()}-${key}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
        if (error) throw error;
        urls[key] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      await update({ nationalIdUrl: urls.nationalId, photoUrl: urls.profile, selfieUrl: urls.selfie });
      showToast({ title: 'Application submitted', message: 'Your clear images are waiting for manager review.', type: 'success' });
      navigate('/rider/dashboard');
    } catch (err) {
      console.warn('[Verification] upload failed', err);
      showToast({ title: 'Upload failed', message: 'Check storage permissions and try again.', type: 'error' });
    } finally { setSaving(false); }
  };

  const cards: Array<{ key: Key; title: string; hint: string; camera: 'environment' | 'user' }> = [
    { key: 'nationalId', title: 'National ID', hint: 'Capture the full ID, including all corners and text', camera: 'environment' },
    { key: 'selfie', title: 'Verification selfie', hint: 'Face the camera in even light; remove sunglasses', camera: 'user' },
    { key: 'profile', title: 'Profile photo', hint: 'This photo may be shown to customers', camera: 'user' },
  ];

  return <main className="min-h-screen px-4 py-24 sm:px-6"><section className="mx-auto max-w-2xl">
    <div className="mb-8 flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand"><ShieldCheck /></div><div><p className="text-sm font-semibold text-brand">Rider onboarding</p><h1 className={cn('text-3xl font-black', dk ? 'text-white' : 'text-gray-900')}>Verify your account</h1><p className={cn('mt-2 text-sm', dk ? 'text-white/55' : 'text-gray-600')}>Use your camera or choose an existing image. We check resolution, lighting, and blur before sending it for review.</p></div></div>
    <div className="space-y-4">{cards.map(({ key, title, hint, camera }) => { const entry = files[key]; return <article key={key} className={cn('app-card overflow-hidden p-4', dk ? 'bg-surface-dark-2' : 'bg-white')}>
      <div className="flex items-start gap-3">{entry ? <img src={URL.createObjectURL(entry.file)} alt={`${title} preview`} className="h-16 w-20 rounded-lg object-cover" /> : <div className="flex h-16 w-20 items-center justify-center rounded-lg bg-brand/10 text-brand"><ImagePlus /></div>}<div className="min-w-0 flex-1"><h2 className={cn('font-bold', dk ? 'text-white' : 'text-gray-900')}>{title}</h2><p className={cn('text-xs', dk ? 'text-white/45' : 'text-gray-500')}>{entry?.quality.message || hint}</p></div></div>
      <div className="mt-3 flex gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-xs font-bold text-white"><Camera size={14} /> Capture <input className="sr-only" type="file" accept="image/*" capture={camera} onChange={choose(key)} /></label><label className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold', dk ? 'border-white/10 text-white/75' : 'border-gray-200 text-gray-700')}><Upload size={14} /> Choose image <input className="sr-only" type="file" accept="image/*" onChange={choose(key)} /></label>{entry && (entry.quality.ok ? <CheckCircle2 className="ml-auto text-success" aria-label="Image quality passed" /> : <AlertTriangle className="ml-auto text-warning" aria-label="Image quality needs attention" />)}</div>
    </article>; })}</div>
    <button type="button" disabled={saving} onClick={submit} className="mt-6 w-full rounded-full bg-brand py-4 font-bold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">{saving ? 'Uploading documents…' : 'Submit for review'}</button>
  </section></main>;
}
