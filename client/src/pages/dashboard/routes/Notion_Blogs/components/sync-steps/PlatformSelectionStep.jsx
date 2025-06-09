import React, { useState, useEffect } from 'react';
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
    authUrl: null,
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
  onConnectionStatusChange
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [connectionAttemptMessage, setConnectionAttemptMessage] = useState('');
  const [connectionAttemptStatus, setConnectionAttemptStatus] = useState(null);

  const currentPlatformDetails = AVAILABLE_PLATFORMS.find(p => p.id === selectedPlatform);

  // Check localStorage for existing connection status on mount
  useEffect(() => {
    const savedPlatform = localStorage.getItem('syncsched_selected_platform');
    const savedConnected = localStorage.getItem('syncsched_platform_connected') === 'true';
    
    if (savedPlatform && savedConnected && savedPlatform === selectedPlatform) {
      setConnectionAttemptStatus('success');
      const platformDetails = AVAILABLE_PLATFORMS.find(p => p.id === savedPlatform);
      setConnectionAttemptMessage(`${platformDetails?.name || savedPlatform} connected successfully!`);
    }
  }, [selectedPlatform]);

  useEffect(() => {
    // Check for OAuth status in URL parameters on every component load/re-render
    const params = new URLSearchParams(location.search);
    
    // Check all available platforms for OAuth status
    AVAILABLE_PLATFORMS.forEach(platform => {
      if (params.has(platform.statusQueryParam)) {
        const status = params.get(platform.statusQueryParam);
        const msg = params.get('message');
        
        const isSuccess = status === 'success';
        setConnectionAttemptStatus(isSuccess ? 'success' : 'error');
        setConnectionAttemptMessage(msg?.replace(/_/g, ' ') || (isSuccess ? `${platform.name} connected successfully!` : `${platform.name} connection failed.`));
        
        // Auto-select the platform if OAuth was successful and no platform is currently selected
        if (isSuccess && !selectedPlatform) {
          onPlatformSelect(platform.id);
        }
        
        if (onConnectionStatusChange) {
          onConnectionStatusChange(platform.id, isSuccess);
        }

        // Automatically advance to next step if connection was successful
        if (isSuccess && onNext) {
          setTimeout(() => {
            onNext();
          }, 2000); // Wait 2 seconds to show success message before advancing
        }

        navigate(location.pathname, { replace: true });
      }
    });
  }, [location.search, navigate, onConnectionStatusChange, onNext, selectedPlatform, onPlatformSelect]);

  const handleConnectAndProceed = () => {
    if (platformConnected) {
      onNext();
    } else if (currentPlatformDetails && currentPlatformDetails.authUrl) {
      window.location.href = currentPlatformDetails.authUrl;
    }
  };
  
  // If platform is connected, show only success message
  if (platformConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Source Platform Connected</CardTitle>
          <CardDescription>
            {currentPlatformDetails?.name || selectedPlatform} has been successfully connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="success" className="mt-4">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Connected!</AlertTitle>
            <AlertDescription>
              {connectionAttemptMessage || `${currentPlatformDetails?.name || selectedPlatform} connected successfully! Proceeding to content selection...`}
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

        {connectionAttemptStatus === 'success' && connectionAttemptMessage && (
          <Alert variant="success" className="mt-4">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Connected!</AlertTitle>
            <AlertDescription>{connectionAttemptMessage}</AlertDescription>
          </Alert>
        )}
        {connectionAttemptStatus === 'error' && connectionAttemptMessage && (
          <Alert variant="destructive" className="mt-4">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>{connectionAttemptMessage}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleConnectAndProceed} 
          disabled={!selectedPlatform || AVAILABLE_PLATFORMS.find(p => p.id === selectedPlatform)?.disabled}
          className="mt-6"
        >
          {platformConnected ? 'Proceed to Next Step' : (currentPlatformDetails ? `Connect ${currentPlatformDetails.name} & Proceed` : 'Select a Platform')}
        </Button>
      </CardContent>
    </Card>
  );
} 