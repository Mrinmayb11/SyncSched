import React, { useState, useEffect } from 'react';
import { Outlet, useLoaderData, useLocation } from 'react-router-dom';
import Sidebar from '@/pages/dashboard/dashboard components/Sidebar'; // Import the Sidebar

// Import Shadcn UI components if needed (assuming you might use them)
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react"; // Example loading icon

export default function Dashboard() {
  const location = useLocation();
  const [authMessage, setAuthMessage] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);

  // State for sync process
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // We get the user data from the loader attached to this route
  // Note: We renamed the loader data key to 'initialUser' in ProtectedRoute.jsx
  const { initialUser: user } = useLoaderData();

  // Check for Notion auth status in URL params on initial load
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const notionAuth = params.get('notion_auth');
    const message = params.get('message');

    if (notionAuth) {
      setAuthStatus(notionAuth); // 'success' or 'error'
      setAuthMessage(message?.replace(/_/g, ' ') || (notionAuth === 'success' ? 'Notion connected!' : 'Notion connection failed'));
      // Clear the params from URL? (Optional, requires history manipulation)
      // window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.search]);

  // Function to trigger the sync process
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    setAuthMessage(null); // Clear previous auth messages

    try {
      console.log('Calling /api/sync/start...');
      const response = await fetch('http://localhost:5000/api/sync/start', { // Ensure port matches your server
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add body if needed by backend, e.g., { userId: 'some_user_id' }
      });

      const result = await response.json();
      console.log('Sync API response:', result);

      if (response.ok && result.status === 'success') {
        setSyncResult(result.message || 'Sync completed successfully!');
      } else {
        throw new Error(result.message || 'Sync failed. Check server logs.');
      }
    } catch (error) {
      console.error('Error calling sync API:', error);
      setSyncError(error.message || 'An error occurred during sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full  flex-row bg-muted/40"  >
      {/* Pass user data to the Sidebar */}
      <Sidebar user={user} />
      <div className="flex flex-col w-full sm:gap-4 sm:py-4"> {/* Adjust pl based on sidebar width */}

        <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
  
          {/* Display Notion Auth Status */}
          {authStatus === 'success' && authMessage && (
            <Alert variant="success" className="mb-4">
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>{authMessage}</AlertDescription>
            </Alert>
          )}
          {authStatus === 'error' && authMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{authMessage}</AlertDescription>
            </Alert>
          )}

          {/* Sync Control Area */}
          <div className="mb-4 p-4 border rounded bg-card text-card-foreground">
            <h2 className="text-lg font-semibold mb-2">Webflow to Notion Sync</h2>
            <Button onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing...</>
              ) : (
                'Sync Now'
              )}
            </Button>
            {/* Display Sync Status */}
            {syncResult && (
              <Alert variant="success" className="mt-4">
                <AlertTitle>Sync Successful</AlertTitle>
                <AlertDescription>{syncResult}</AlertDescription>
              </Alert>
            )}
            {syncError && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Sync Error</AlertTitle>
                <AlertDescription>{syncError}</AlertDescription>
              </Alert>
            )}
          </div>

          <Outlet /> 
        
        </main>
      </div>
    </div>
  );
}