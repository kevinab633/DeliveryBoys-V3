import { useRef, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

interface Props {
  length?: number;
  onComplete: (code: string) => void;
}

export default function OTPInput({ length = 6, onComplete }: Props) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const dk = useThemeStore(s => s.theme === 'dark');

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const newVals = [...values];
    newVals[i] = v.slice(-1);
    setValues(newVals);
    if (v && i < length - 1) inputs.current[i + 1]?.focus();
    const code = newVals.join('');
    if (code.length === length) onComplete(code);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  return (
    <div className="flex gap-3 justify-center">
      {values.map((v, i) => (
        <input key={i} ref={el => { inputs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={v}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className={cn('otp-input border-2 rounded-xl transition',
            dk ? 'bg-surface-dark-3 border-white/10 text-white focus:border-brand' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-brand'
          )}
        />
      ))}
    </div>
  );
}
