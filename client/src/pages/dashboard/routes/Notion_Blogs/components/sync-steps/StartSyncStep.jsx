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
  notionConnected 
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // 'success' or 'error'
  const [syncMessage, setSyncMessage] = useState('');

  const handleStartSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncMessage('');

    try {
      // Start the sync process
      const response = await axiosInstance.post('/api/sync/start-blog-sync', {
        platformId: selectedPlatform,
        collectionIds: selectedCollections,
        // The backend will use the user's session to get the relevant OAuth tokens.
      });

      const result = response.data;
      if (result.status === 'success') {
        setSyncStatus('success');
        setSyncMessage(result.message || 'Sync initiated successfully! Check your Notion workspace for updates.');
      } else {
        throw new Error(result.message || 'Backend failed to start the sync process.');
      }
    } catch (err) {
      console.error('Error starting sync:', err.response?.data || err.message);
      setSyncStatus('error');
      setSyncMessage(err.response?.data?.message || err.message || 'An error occurred while starting the sync.');
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4: Review & Start Sync</CardTitle>
        <CardDescription>
          Review your selections and start syncing content from {platformName} to Notion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-semibold">Summary:</h4>
          <p><strong>Source Platform:</strong> {platformName}</p>
          <p><strong>Collections to Sync:</strong> {selectedCollections.length} collection(s)</p>
          <p><strong>Destination:</strong> Notion</p>
          {/* TODO: Optionally list selected collection names if fetched and stored in parent state */}
        </div>

        {syncStatus === 'success' && syncMessage && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Sync Initiated!</AlertTitle>
            <AlertDescription>{syncMessage}</AlertDescription>
          </Alert>
        )}
        {syncStatus === 'error' && syncMessage && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Sync Failed</AlertTitle>
            <AlertDescription>{syncMessage}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleStartSync} disabled={isSyncing || selectedCollections.length === 0 || syncStatus === 'success'}>
          {isSyncing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Sync...</>
          ) : syncStatus === 'success' ? (
            'Sync Initiated'
          ) : (
            'Start Sync Now'
          )}
        </Button>
        
        {syncStatus === 'success' && (
            <p className="text-sm text-muted-foreground">You can now close this setup or start another one.</p>
        )}
      </CardContent>
    </Card>
  );
} 