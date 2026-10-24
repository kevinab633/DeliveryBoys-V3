import supabase from './supabase';

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

export async function saveFuelPrice(fuel: FuelKind, price: number): Promise<boolean> {
  const { error } = await supabase.from('app_settings').upsert({
    key: KEYS[fuel],
    value: String(price),
    updated_at: new Date().toISOString(),
  });
  return !error;
}
