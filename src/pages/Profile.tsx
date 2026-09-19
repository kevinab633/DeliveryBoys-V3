import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Plus, CheckCircle2 } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';

export default function Profile() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { user, updateProfile, addContact } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [addingEmail, setAddingEmail] = useState(false);
  const [addingPhone, setAddingPhone] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  if (!user) return <div className="pt-20 min-h-screen flex items-center justify-center"><p>Please sign in.</p></div>;

  const inp = cn('w-full px-4 py-3 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900');

  return (
    <div className="pt-20 min-h-screen">
      <section className={cn('py-8', dk ? 'bg-surface-dark' : 'bg-white')}>
        <div className="max-w-2xl mx-auto px-6">
          <h1 className={cn('text-3xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>My Profile</h1>
        </div>
      </section>
      <section className={cn('py-8', dk ? 'bg-surface-dark-2' : 'bg-gray-50')}>
        <div className="max-w-2xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className={cn('p-8 rounded-2xl border', dk ? 'bg-surface-dark-3 border-white/5' : 'bg-white border-gray-200')}>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-full bg-brand flex items-center justify-center text-white text-2xl font-bold">{user.name[0]}</div>
              <div>
                {editing ? (
                  <div className="flex gap-2">
                    <input value={name} onChange={e => setName(e.target.value)} className={inp} />
                    <button onClick={() => { updateProfile({ name }); setEditing(false); }} className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-bold">Save</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className={cn('text-xl font-bold', dk ? 'text-white' : 'text-gray-900')}>{user.name}</h2>
                    <button onClick={() => setEditing(true)} className="text-brand text-sm font-bold">Edit</button>
                  </div>
                )}
                <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-bold bg-brand/10 text-brand capitalize">{user.role}</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div className={cn('p-4 rounded-xl border', dk ? 'border-white/5' : 'border-gray-100')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-brand" />
                    <span className={cn('text-sm font-medium', dk ? 'text-white/70' : 'text-gray-700')}>Email</span>
                  </div>
                  {user.email ? (
                    <span className={cn('text-sm', dk ? 'text-white' : 'text-gray-900')}>{user.email}</span>
                  ) : addingEmail ? (
                    <div className="flex gap-2">
                      <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="your@email.com" className={cn(inp, 'w-48')} />
                      <button onClick={() => { addContact('email', newEmail); setAddingEmail(false); }} className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold">Add</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingEmail(true)} className="flex items-center gap-1 text-brand text-sm font-bold"><Plus size={14} /> Add</button>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div className={cn('p-4 rounded-xl border', dk ? 'border-white/5' : 'border-gray-100')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-brand" />
                    <span className={cn('text-sm font-medium', dk ? 'text-white/70' : 'text-gray-700')}>Phone</span>
                  </div>
                  {user.phone ? (
                    <span className={cn('text-sm', dk ? 'text-white' : 'text-gray-900')}>{user.phone}</span>
                  ) : addingPhone ? (
                    <div className="flex gap-2">
                      <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="0544188778" className={cn(inp, 'w-48')} />
                      <button onClick={() => { addContact('phone', newPhone); setAddingPhone(false); }} className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold">Add</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingPhone(true)} className="flex items-center gap-1 text-brand text-sm font-bold"><Plus size={14} /> Add</button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
