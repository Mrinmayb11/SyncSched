import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import supabase from '../lib/supabase/SupabaseClient.js';
import axiosInstance from '../lib/axiosInstance.js';

function NotionOAuthRedirect() {
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
      const errorParam = params.get('error');

      if (errorParam) {
        console.error('Notion OAuth Error:', errorParam);
        setError(`Notion connection failed: ${errorParam}`);
        setLoading(false);
        navigate('/dashboard/notion-to-blogs/new?notion_auth=error&message=Notion_connection_failed');
        return;
      }

      if (!code) {
        console.error('No code found in Notion redirect');
        setError('No authorization code received from Notion.');
        setLoading(false);
        navigate('/dashboard/notion-to-blogs/new?notion_auth=error&message=No_authorization_code_received');
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
        const response = await axiosInstance.post('/api/notion/complete-auth', { code });
        const result = response.data;

        // Check for success and presence of notionAuthId
        if (result.message.includes('successful') && result.notionAuthId) {
          navigate(`/dashboard/notion-to-blogs/new?notion_auth=success&message=Notion_connected_successfully&notionAuthId=${result.notionAuthId}`);
        } else {
          throw new Error(result.message || 'Backend failed to process Notion token or did not return an ID.');
        }
      } catch (err) {
        console.error('Notion OAuth error:', err.response?.data || err.message);
        setError(err.response?.data?.message || err.message || 'Failed to connect Notion account.');
        navigate('/dashboard/notion-to-blogs/new?notion_auth=error&message=Failed_to_connect_Notion_account');
      } finally {
        setLoading(false);
        // processingRef.current remains true to prevent re-runs for the same code.
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
      </div>
    );
  }

  return <div>Redirecting...</div>;
}

export default NotionOAuthRedirect; 