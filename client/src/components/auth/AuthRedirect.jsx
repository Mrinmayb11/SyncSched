import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '@/lib/supabase/SupabaseClient';

/**
 * Component that redirects authenticated users away from auth pages
 * Use this in sign-up and login pages to prevent authenticated users from accessing them
 * 
 * @param {string} redirectTo - The path to redirect to if authenticated (default: '/dashboard')
 */
export default function AuthRedirect({ redirectTo = '/dashboard' }) {
  const navigate = useNavigate();
  
  useEffect(() => {
    const checkAuthAndRedirect = async () => {
     
      const { data } = await supabase.auth.getSession();
      
      if (data?.session) {
        // User is already authenticated, redirect to dashboard
        navigate(redirectTo, { replace: true });
      }
    };
    
    checkAuthAndRedirect();
  }, [navigate, redirectTo]);
  
  // This component doesn't render anything
  return null;
} 