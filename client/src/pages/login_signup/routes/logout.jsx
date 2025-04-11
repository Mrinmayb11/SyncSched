import { createClient } from '@/lib/supabase/supabaseClient'
import { redirect } from 'react-router-dom';

export async function logoutLoader() {
  const supabase = createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Supabase signout error:', error)
  }

  // Redirect to login page after sign-out attempt
  return redirect('/login');
}
