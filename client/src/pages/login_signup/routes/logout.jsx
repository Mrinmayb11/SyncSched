import supabase from '@/lib/supabase/SupabaseClient'
import { redirect } from 'react-router-dom';

export async function logoutLoader() {


  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Supabase signout error:', error)
  }

  // Redirect to login page after sign-out attempt
  return redirect('/login');
}
