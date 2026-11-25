import supabase from './supabase';
import { DiscountSettings, mergeDiscounts } from './discounts';

// App-wide settings shared by every device (table: app_settings).
// See docs/supabase-app-settings.sql for the table definition.
const KEYS = {
  petrol: 'fuel_price_per_litre',
  diesel: 'diesel_price_per_litre',
} as const;

export type FuelKind = keyof typeof KEYS;

export async function fetchFuelPrice(fuel: FuelKind): Promise<{ price: number; updatedAt: number } | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', KEYS[fuel])
    .maybeSingle();
  if (error || !data) return null;
  const price = Number(data.value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, updatedAt: Date.parse(data.updated_at) || Date.now() };
}

export async function saveFuelPrice(fuel: FuelKind, price: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('app_settings').upsert({
      key: KEYS[fuel],
      value: String(price),
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: `${error.code ?? ''} ${error.message}`.trim() };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

export async function fetchDiscounts(): Promise<{ settings: DiscountSettings; updatedAt: number } | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', 'discounts')
    .maybeSingle();
  if (error || !data) return null;
  try {
    return {
      settings: mergeDiscounts(JSON.parse(String(data.value))),
      updatedAt: Date.parse(data.updated_at) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function saveDiscounts(settings: DiscountSettings): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('app_settings').upsert({
      key: 'discounts',
      value: JSON.stringify(settings),
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: `${error.code ?? ''} ${error.message}`.trim() };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}
