import { createClient } from '@/lib/supabase/supabaseClient'
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

// Simplified loader that doesn't do server-side checks
export const protectedLoader = async () => {
  // Return empty object - we'll do all auth checks client-side
  return {};
}

// Wrapper component
export default function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    // Check for existing session
    const checkSession = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser();
        
        if (error || !currentUser) {
          console.log('No authenticated user found, redirecting to login');
          navigate('/login', { replace: true });
        } else {
          console.log('Authenticated user found');
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        setUser(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        navigate('/login', { replace: true });
      }
    });

    // Run initial check
    checkSession();

    // Cleanup subscription
    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-lg">Verifying authentication...</p>
      </div>
    </div>;
  }

  // Render children only if user is authenticated (loading is false and user exists)
  return children;
} 