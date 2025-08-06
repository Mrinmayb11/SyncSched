import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import axiosInstance from '@/lib/axiosInstance';

const getPlatformName = (platformId) => {
  if (platformId === 'webflow') return 'Webflow';
  return platformId || 'Selected Platform';
};

export default function StartSyncStep({ 
  selectedPlatform,
  webflowAuthId,
  webflowSiteId,
  webflowSiteName,
  notionAuthId,
  selectedCollections, 
  selectedItems = {}, // New prop for selected items
  platformConnected, 
  notionConnected,
  onResetFlow,
  onSyncComplete,
  onClearSyncData
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncProgress, setSyncProgress] = useState([]);

  // Clear localStorage when component unmounts as a safety measure
  useEffect(() => {
    return () => {
      // Only clear if sync was successful to avoid clearing during normal navigation
      if (syncStatus === 'success' && onClearSyncData) {
        onClearSyncData();
      }
    };
  }, [syncStatus, onClearSyncData]);

  const addProgress = (message) => {
    setSyncProgress(prev => [...prev, message]);
  };

  const handleStartSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncMessage('');
    setSyncProgress([]);

    try {
      addProgress('Step 1/1: Creating integration and starting initial sync...');
      const integrationName = `${webflowSiteName} <> Notion Sync`;
      
      const response = await axiosInstance.post('/api/webflow/integration/create-and-sync', {
        webflow_auth_id: webflowAuthId,
        webflow_site_id: webflowSiteId,
        webflow_site_name: webflowSiteName,
        notion_auth_id: notionAuthId,
        integration_name: integrationName,
        collectionIds: selectedCollections,
        selectedItems: selectedItems, // Include selected items for granular sync
      });

      // Handle both 202 (processing) and 200 (success) responses
      if (response.status === 202 || response.data.status === 'processing') {
        addProgress('✅ Integration created successfully!');
        addProgress('🔄 Sync is now running in the background...');
        setSyncStatus('success');
        setSyncMessage('Your integration has been created! The initial sync is processing in the background and may take a few minutes to complete depending on the size of your collections.');
        
        // Clear localStorage immediately when sync succeeds
        if (onClearSyncData) {
          onClearSyncData();
        }
      } else if (response.data.status === 'success') {
        addProgress('✅ Sync process completed successfully!');
        setSyncStatus('success');
        setSyncMessage(response.data.message || 'Your new sync is ready!');
        
        // Clear localStorage immediately when sync succeeds
        if (onClearSyncData) {
          onClearSyncData();
        }
      } else {
        throw new Error(response.data.message || 'The sync process failed to complete.');
      }
      
      // No automatic redirect. User will click to proceed.
      if (onSyncComplete) {
        // Let the parent know it's complete, but don't trigger navigation automatically.
        // The parent component can use this to update its state if needed.
      }
    } catch (err) {
      console.error('Error during sync setup:', err.response?.data || err.message);
      setSyncStatus('error');
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'An unknown error occurred during the setup process.';
      setSyncMessage(errorMessage);
      addProgress(`❌ Error: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!platformConnected || !notionConnected || !webflowAuthId || !notionAuthId || !webflowSiteId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 4: Start Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">A required connection or selection is missing. Please go back to the previous steps to ensure Webflow and Notion are connected, and a Webflow site has been chosen.</p>
        </CardContent>
      </Card>
    );
  }
  
  const platformName = getPlatformName(selectedPlatform);

  if (syncStatus === 'success') {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Setup Complete!</CardTitle>
                <CardDescription>Your new sync configuration has been created.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert variant="success">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Integration Created Successfully</AlertTitle>
                    <AlertDescription>{syncMessage}</AlertDescription>
                </Alert>
                {syncMessage.includes('background') && (
                    <Alert>
                        <AlertDescription>
                            <strong>Note:</strong> The initial sync is running in the background. You can navigate to your integrations page now, and refresh the page in a few minutes to see your synced data.
                        </AlertDescription>
                    </Alert>
                )}
                <p className="text-sm text-muted-foreground">
                    You can now navigate to your integration page to monitor the sync progress.
                </p>
                <Button onClick={onSyncComplete}>Go to My Notion-Blogs Syncs</Button>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4: Review & Finalize Setup</CardTitle>
        <CardDescription>
          Review your selections and complete the setup. This will create the integration and start the first sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-semibold">Summary:</h4>
          <p><strong>Source Site:</strong> {webflowSiteName || 'Webflow Site'}</p>
          <p><strong>Collections to Sync:</strong> {selectedCollections.length} collection(s)</p>
          {Object.keys(selectedItems).length > 0 && (
            <p><strong>Specific Items Selected:</strong> {Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0)} item(s) across {Object.keys(selectedItems).length} collection(s)</p>
          )}
          {Object.keys(selectedItems).length === 0 && selectedCollections.length > 0 && (
            <p><strong>Items to Sync:</strong> All items in selected collections</p>
          )}
          <p><strong>Destination:</strong> Notion</p>
        </div>

        {(syncStatus === 'error' && syncMessage) && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Setup Failed</AlertTitle>
            <AlertDescription>{syncMessage}</AlertDescription>
          </Alert>
        )}

        {isSyncing && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Finalizing Setup...</AlertTitle>
            <AlertDescription>
                <ul className="list-disc pl-5">
                    {syncProgress.map((msg, index) => (
                        <li key={index}>{msg}</li>
                    ))}
                </ul>
            </AlertDescription>
          </Alert>
        )}

        <Button onClick={handleStartSync} disabled={isSyncing || selectedCollections.length === 0}>
          {isSyncing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting Up...</>
          ) : (
            'Complete Setup & Start Sync'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}