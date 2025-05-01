import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createClient } from '@/lib/supabase/SupabaseClient'; // Keep for auth session check
import axiosInstance from '@/lib/axiosInstance'; // Import the configured Axios instance

function NotionOAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient(); // Still need client for session

    const handleRedirect = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const errorParam = params.get('error');

      if (errorParam) {
        console.error('Notion OAuth Error:', errorParam);
        setError(`Notion connection failed: ${errorParam}`);
        setLoading(false);
        // Redirect with error status
        navigate('/dashboard?notion_auth=error&message=Notion_connection_failed');
        return;
      }

      if (!code) {
        console.error('No code found in Notion redirect');
        setError('No authorization code received from Notion.');
        setLoading(false);
        navigate('/dashboard?notion_auth=error&message=No_authorization_code_received');
        return;
      }

      // Get the session token to authorize the backend call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('Supabase session error or no session:', sessionError);
        setError('User session not found. Please log in again.');
        setLoading(false);
        navigate('/login'); // Redirect to login if no session
        return;
      }

      try {
        console.log('Sending Notion code to backend via Axios...');
        // Use axiosInstance to send the code - Authorization header added automatically
        const response = await axiosInstance.post('/api/notion/exchange-code', { code });

        const result = response.data; // Data is directly in response.data
        console.log('Backend response (Axios):', result);

        if (result.status === 'success') {
          console.log('Notion connection successful');
          navigate('/dashboard/Notion?notion_auth=success&message=Notion_connected_successfully');
        } else {
          // Handle specific errors returned from backend
          throw new Error(result.message || 'Backend failed to process Notion token.');
        }
      } catch (err) {
        console.error('Error sending Notion code to backend (Axios catch):', err.response?.data || err.message);
        setError(err.response?.data?.message || err.message || 'Failed to connect Notion account.');
        // Redirect with error status
        navigate('/dashboard?notion_auth=error&message=Failed_to_connect_Notion_account');
      } finally {
        setLoading(false);
      }
    };

    handleRedirect();
  }, [navigate, location]);

  if (loading) {
    return <div>Connecting Notion account...</div>;
  }

  if (error) {
    return (
      <div>
        <h2>Error Connecting Notion</h2>
        <p>{error}</p>
        {/* Optionally add a button to retry or go back */}
      </div>
    );
  }

  // Should ideally redirect before rendering anything else
  return <div>Redirecting...</div>;
}

export default NotionOAuthRedirect; 