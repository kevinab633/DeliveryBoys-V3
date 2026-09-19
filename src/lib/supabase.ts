import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ratrzbrsyaxfobjbfipl.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhdHJ6YnJzeWF4Zm9iamJmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwODM5MjMsImV4cCI6MjEwMzY1OTkyM30.u4jlQMsTzFb3Oy41cs0njMTmKIAUo16FfNwaBWEonWM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
