import supabase from './supabase';

// App-wide settings shared by every device (table: app_settings).
// See docs/supabase-app-settings.sql for the table definition.
const FUEL_KEY = 'fuel_price_per_litre';

export async function fetchFuelPrice(): Promise<{ price: number; updatedAt: number } | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', FUEL_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const price = Number(data.value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, updatedAt: Date.parse(data.updated_at) || Date.now() };
}

export async function saveFuelPrice(price: number): Promise<boolean> {
  const { error } = await supabase.from('app_settings').upsert({
    key: FUEL_KEY,
    value: String(price),
    updated_at: new Date().toISOString(),
  });
  return !error;
}
