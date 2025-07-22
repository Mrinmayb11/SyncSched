import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";

const AVAILABLE_PLATFORMS = [
  {
    id: "webflow",
    name: "Webflow",
    description: "Connect your Webflow account to sync collections.",
    authUrl: "https://backend.syncsched.com/api/webflow/auth",
    statusQueryParam: "webflow_auth",
    disabled: false,
  },
  {
    id: "wordpress",
    name: "WordPress (Coming Soon)",
    description: "Sync content from your WordPress site.",
    authUrl: "https://www.example.com/",
    statusQueryParam: "wp_auth",
    disabled: true,
  },
  // Add other platforms as needed
];

export default function PlatformSelectionStep({ 
  selectedPlatform, 
  onPlatformSelect, 
  onNext,
  platformConnected,
  onConnectionStatusChange,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const hasAdvancedRef = useRef(false);

  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null); // 'success', 'error', or null
  const [connectedSiteName, setConnectedSiteName] = useState('');

  const currentPlatformDetails = AVAILABLE_PLATFORMS.find(p => p.id === selectedPlatform);

  // Effect to handle the OAuth callback from the redirect handler
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const platform = AVAILABLE_PLATFORMS.find(p => params.has(p.statusQueryParam));

    if (platform) {
      const status = params.get(platform.statusQueryParam);
      const message = params.get('message')?.replace(/_/g, ' ') || '';
      const isSuccess = status === 'success';

      setConnectionStatus(isSuccess ? 'success' : 'error');
      setConnectionMessage(message);

      if (isSuccess) {
        const authId = params.get('webflowAuthId');
        const siteId = params.get('siteId');
        const siteName = params.get('siteName');

        setConnectedSiteName(siteName || 'your site');

        if (!selectedPlatform) {
          onPlatformSelect(platform.id);
        }
        
        if (onConnectionStatusChange) {
          onConnectionStatusChange(platform.id, true, { webflowAuthId: authId, siteId, siteName });
        }

        // Auto-advance after showing the success message
        if (onNext && !hasAdvancedRef.current) {
          hasAdvancedRef.current = true;
          setTimeout(() => onNext(), 2000);
        }
      } else if (onConnectionStatusChange) {
        onConnectionStatusChange(platform.id, false);
      }
      
      // Clean up URL parameters immediately
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, navigate, onConnectionStatusChange, onPlatformSelect, selectedPlatform, onNext]);


  const handleConnectAndProceed = () => {
    if (currentPlatformDetails && currentPlatformDetails.authUrl) {
      // Redirect to the backend auth initiator, which will then redirect to Webflow
      window.location.href = currentPlatformDetails.authUrl;
    }
  };
  
  // If platform is already connected (e.g., from previous step or callback)
  if (platformConnected || connectionStatus === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Source Platform Connected</CardTitle>
          <CardDescription>
            Your {currentPlatformDetails?.name || 'source'} account is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Connected to {currentPlatformDetails?.name}!</AlertTitle>
            <AlertDescription>
              Successfully connected to {connectedSiteName}.
            </AlertDescription>
          </Alert>
          <p className="mt-4 text-sm text-muted-foreground">
            Automatically proceeding to the next step...
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Select Source Platform</CardTitle>
        <CardDescription>
          Choose the platform you want to sync content from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={selectedPlatform}
          onValueChange={onPlatformSelect}
        >
          {AVAILABLE_PLATFORMS.map((platform) => (
            <div key={platform.id} className="flex items-center space-x-2">
              <RadioGroupItem
                value={platform.id}
                id={platform.id}
                disabled={platform.disabled}
              />
              <Label htmlFor={platform.id} className={`flex flex-col space-y-1 ${platform.disabled ? 'text-muted-foreground' : ''}`}>
                <span>{platform.name}</span>
                {!platform.disabled && selectedPlatform === platform.id && (
                  <span className="font-normal leading-snug text-muted-foreground">
                    {platform.description}
                  </span>
                )}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {connectionStatus === 'error' && connectionMessage && (
          <Alert variant="destructive" className="mt-4">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>{connectionMessage}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleConnectAndProceed} 
          disabled={!selectedPlatform || AVAILABLE_PLATFORMS.find(p => p.id === selectedPlatform)?.disabled}
          className="mt-6"
        >
          {`Connect ${currentPlatformDetails?.name || ''} & Proceed`}
        </Button>
      </CardContent>
    </Card>
  );
} 