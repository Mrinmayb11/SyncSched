import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import supabase from '@/lib/supabase/SupabaseClient';
import axiosInstance from '../lib/axiosInstance.js';

function WebflowOAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const processingRef = useRef(false);

  useEffect(() => {
    const handleRedirect = async () => {
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;

      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');
      const errorParam = params.get('error');

      if (errorParam) {
        console.error('Webflow OAuth Error:', errorParam);
        setError(`Webflow connection failed: ${errorParam}`);
        setLoading(false);
        navigate('/dashboard/notion-to-blogs/new?webflow_auth=error&message=Webflow_connection_failed');
        return;
      }

      if (!code || !state) {
        console.error('Missing code or state in Webflow redirect');
        setError('Required parameters (code or state) missing from Webflow.');
        setLoading(false);
        navigate('/dashboard/notion-to-blogs/new?webflow_auth=error&message=Missing_required_parameters');
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('Supabase session error or no session:', sessionError);
        setError('User session not found. Please log in again.');
        setLoading(false);
        navigate('/login');
        return;
      }

      try {
        const response = await axiosInstance.post('/api/webflow/complete-auth', { code, state });

        const result = response.data;

        if (result.status === 'success' || (result.message && result.message.includes('completed successfully'))) {
          const webflowAuthId = result.webflowAuthId;
          const redirectUrl = webflowAuthId 
            ? `/dashboard/notion-to-blogs/new?webflow_auth=success&message=Webflow_connected_successfully&webflowAuthId=${webflowAuthId}`
            : '/dashboard/notion-to-blogs/new?webflow_auth=success&message=Webflow_connected_successfully';
          
          navigate(redirectUrl);
        } else {
          throw new Error(result.message || 'Backend failed to process Webflow token.');
        }
      } catch (err) {
        console.error('Error sending Webflow code to backend (Axios catch):', err.response?.data || err.message);
        setError(err.response?.data?.message || err.message || 'Failed to connect Webflow account.');
        navigate('/dashboard/notion-to-blogs/new?webflow_auth=error&message=Failed_to_connect_Webflow_account');
      } finally {
        setLoading(false);  
      }
    };

    handleRedirect();

  }, [navigate, location]);

  if (loading) {
    return <div>Connecting Webflow account...</div>;
  }

  if (error) {
    return (
      <div>
        <h2>Error Connecting Webflow</h2>
        <p>{error}</p>
      </div>
    );
  }

  return <div>Redirecting...</div>;
}

export default WebflowOAuthRedirect;
