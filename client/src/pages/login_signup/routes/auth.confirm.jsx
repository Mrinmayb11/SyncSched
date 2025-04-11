import { redirect } from 'react-router';

// This loader runs AFTER Supabase has verified the email confirmation token.
// Its only job is to redirect the user to the login page with a success indicator.
export async function loader() {
  // Redirect to login, adding a query parameter to indicate successful verification.
  return redirect('/login?verified=true');
}