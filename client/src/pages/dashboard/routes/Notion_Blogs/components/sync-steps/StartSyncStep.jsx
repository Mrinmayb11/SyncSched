import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2 } from "lucide-react"; // Added Loader2 for loading state
import axiosInstance from '@/lib/axiosInstance';

// Helper to get platform name (could be expanded from a shared config)
const getPlatformName = (platformId) => {
  if (platformId === 'webflow') return 'Webflow';
  return platformId || 'Selected Platform';
};

export default function StartSyncStep({ 
  selectedPlatform, 
  selectedCollections, 
  platformConnected, 
  notionConnected,
  onResetFlow,       // New prop
  onSyncComplete     // New prop
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // 'success' or 'error'
  const [syncMessage, setSyncMessage] = useState('');
  const [syncProgress, setSyncProgress] = useState(''); // New state for progress updates

  const handleStartSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncMessage('');
    setSyncProgress('Initializing sync...');

    try {
      setSyncProgress('Connecting to Webflow and Notion...');
      
      // Set a longer timeout for sync operations (10 minutes)
      const response = await axiosInstance.post('/api/sync/start-blog-sync', {
        platformId: selectedPlatform,
        collectionIds: selectedCollections,
      }, {
        timeout: 600000, // 10 minutes timeout for sync operations
      });

      setSyncProgress('Processing sync results...');
      
      const result = response.data;
      if (result.status === 'success') {
        setSyncStatus('success');
        setSyncMessage(result.message || 'Sync setup complete! Your content will start syncing shortly.');
        setSyncProgress('');
        // Notify parent component that setup is complete after a short delay
        if (onSyncComplete) {
          setTimeout(() => {
            onSyncComplete();
          }, 2000); // 2-second delay to allow user to read message
        }
      } else {
        throw new Error(result.message || 'Backend failed to start the sync process.');
      }
    } catch (err) {
      console.error('Error starting sync:', err.response?.data || err.message);
      setSyncStatus('error');
      setSyncProgress('');
      
      // Handle timeout errors specifically
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.response?.status === 524) {
        setSyncMessage('⏰ The sync process is taking longer than expected, but this is normal for large datasets. The sync is likely still running in the background and should complete successfully. Please check your Notion workspace in a few minutes - your databases and content should appear there. You can also try refreshing this page to see if the sync has completed.');
      } else {
        setSyncMessage(err.response?.data?.message || err.message || 'An error occurred while starting the sync.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (!platformConnected || !notionConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 4: Start Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Please ensure both the source platform and Notion are connected before starting the sync.</p>
        </CardContent>
      </Card>
    );
  }
  
  const platformName = getPlatformName(selectedPlatform);

  // If sync was successful, show a summary and a button to finish/reset
  if (syncStatus === 'success') {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Setup Complete!</CardTitle>
                <CardDescription>Your new sync configuration has been saved.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert variant="success">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Sync Initiated Successfully</AlertTitle>
                    <AlertDescription>{syncMessage}</AlertDescription>
                </Alert>
                <p className="text-sm text-muted-foreground">
                    You will now be taken to the dashboard where you can see all your active syncs.
                </p>
                <Button onClick={onSyncComplete}>View All Syncs</Button>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4: Review & Start Sync</CardTitle>
        <CardDescription>
          Review your selections and start the initial sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-semibold">Summary:</h4>
          <p><strong>Source Platform:</strong> {platformName}</p>
          <p><strong>Collections to Sync:</strong> {selectedCollections.length} collection(s)</p>
          <p><strong>Destination:</strong> Notion</p>
        </div>

        {syncStatus === 'error' && syncMessage && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Sync Failed</AlertTitle>
            <AlertDescription>{syncMessage}</AlertDescription>
            {(syncMessage.includes('⏰') || syncMessage.includes('timeout')) && (
              <div className="mt-3 space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open('https://notion.so', '_blank')}
                >
                  Check My Notion Workspace
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setSyncStatus(null);
                    setSyncMessage('');
                  }}
                >
                  Try Again
                </Button>
              </div>
            )}
          </Alert>
        )}

        {isSyncing && syncProgress && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Syncing in Progress</AlertTitle>
            <AlertDescription>{syncProgress}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleStartSync} disabled={isSyncing || selectedCollections.length === 0}>
          {isSyncing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing Setup...</>
          ) : (
            'Complete Setup & Start Sync'
          )}
        </Button>
      </CardContent>
    </Card>
  );
} 