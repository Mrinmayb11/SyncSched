import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create a single, reusable Supabase client instance
const supabase = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Export the single instance
export default supabase;
