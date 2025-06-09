import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";

// Notion specific OAuth details
const NOTION_OAUTH_DETAILS = {
  name: "Notion",
  authUrl: "/api/notion/auth", // Backend handles Notion OAuth
  statusQueryParam: "notion_auth", // URL query param to check for auth status on redirect
};

export default function NotionConnectionStep({ onNext, onNotionConnectionStatusChange }) {
  const location = useLocation();
  const navigate = useNavigate(); // For potential future use, like cleaning URL params

  const [connectionStatus, setConnectionStatus] = useState(null); // 'success' or 'error'
  const [message, setMessage] = useState('');

  // Check localStorage for existing connection status on mount
  useEffect(() => {
    const savedConnected = localStorage.getItem('syncsched_notion_connected') === 'true';
    
    if (savedConnected) {
      setConnectionStatus('success');
      setMessage('Notion connected successfully!');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has(NOTION_OAUTH_DETAILS.statusQueryParam)) {
      const status = params.get(NOTION_OAUTH_DETAILS.statusQueryParam);
      const msg = params.get('message');
      const isSuccess = status === 'success';
      
      setConnectionStatus(status);
      setMessage(msg?.replace(/_/g, ' ') || (isSuccess ? `Notion connected successfully!` : `Notion connection failed.`));
      
      if (onNotionConnectionStatusChange) {
        onNotionConnectionStatusChange(isSuccess);
      }

      // Automatically advance to next step if connection was successful
      if (isSuccess && onNext) {
        setTimeout(() => {
          onNext();
        }, 2000); // Wait 2 seconds to show success message before advancing
      }

      navigate(location.pathname, { replace: true });
    }
  }, [location.search, navigate, onNotionConnectionStatusChange, onNext]);

  const handleConnectNotion = () => {
    window.location.href = NOTION_OAUTH_DETAILS.authUrl;
  };

  // If connected, show only success message
  if (connectionStatus === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 3: Notion Account Connected</CardTitle>
          <CardDescription>
            Notion has been successfully connected to your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Connected!</AlertTitle>
            <AlertDescription>
              {message || 'Notion connected successfully! Proceeding to sync setup...'}
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Automatically advancing to the next step...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Connect Notion Account</CardTitle>
        <CardDescription>
          Authorize SyncSched to access your Notion workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {connectionStatus === 'error' && message && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {!connectionStatus && (
          <p>
            Click the button below to go to Notion and grant access.
            You will be redirected back here after authorization.
          </p>
        )}

        <Button onClick={handleConnectNotion}>
          Connect Notion
        </Button>
      </CardContent>
    </Card>
  );
} 