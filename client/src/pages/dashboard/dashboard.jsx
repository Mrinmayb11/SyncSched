import React, { useState, useEffect } from 'react';
import { Outlet, useLoaderData, useLocation } from 'react-router-dom';
import Sidebar from '@/pages/dashboard/dashboard components/Sidebar'; // Import the Sidebar

// Import Shadcn UI components for alerts
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const location = useLocation();
  const [authMessage, setAuthMessage] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);



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



          <Outlet /> 
        
        </main>
      </div>
    </div>
  );
}