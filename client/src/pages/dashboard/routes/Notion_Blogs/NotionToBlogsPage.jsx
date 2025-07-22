import React, { useState, useEffect } from "react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from "@/components/ui/button";
import ExistingSyncsTable from './components/ExistingSyncsTable';
import axiosInstance from "@/lib/axiosInstance";
import { Loader2 } from "lucide-react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";


export default function NotionToBlogsPage() {
  const [existingSyncs, setExistingSyncs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchExistingSyncs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/api/sync/list-integrations');
      const syncData = response.data || [];
      setExistingSyncs(syncData);
      
      // If there are no syncs, automatically navigate to the setup page
      if (syncData.length === 0 && location.pathname === '/dashboard/notion-to-blogs') {
        navigate('/dashboard/notion-to-blogs/new');
      }
    } catch (err) {
      setError("Failed to load existing sync configurations. Please try again later.");
      console.error("Fetch syncs error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch integrations if we are on the main page, not the 'new' setup page.
    if (location.pathname === '/dashboard/notion-to-blogs') {
      fetchExistingSyncs();
    }
  }, [location.pathname]); // Refetch when the route changes


  const handleAddNew = () => {
    navigate('/dashboard/notion-to-blogs/new');
  }

  const handleEdit = (integrationId) => {
    // For now, editing will redirect to create a new integration
    // In the future, this could open an edit modal or dedicated edit flow
    navigate('/dashboard/notion-to-blogs/new');
  };

  const renderLoading = () => (
    <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const renderError = () => (
    <div className="p-6 max-w-4xl mx-auto text-center text-red-500 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p>{error}</p>
        <Button onClick={fetchExistingSyncs} className="mt-4">Try Again</Button>
    </div>
  );

  // This is the view for the main /notion-to-blogs page, which shows the table
  const renderTableView = () => (
    <ExistingSyncsTable syncs={existingSyncs} onAddNew={handleAddNew} onEdit={handleEdit} />
  );


  return (  
    <div className="p-6 max-w-4xl mx-auto">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/dashboard/notion-to-blogs">Blog Syncs</BreadcrumbLink></BreadcrumbItem>
          {location.pathname.includes('/new') && (
            <>
            <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
            </>
          )}
          </BreadcrumbList>
        </Breadcrumb>
      
      {isLoading && location.pathname !== '/dashboard/notion-to-blogs/new' ? renderLoading() :
       error ? renderError() :
       location.pathname.includes('/new') ? <Outlet /> : renderTableView()
      }
    </div>
  );
} 