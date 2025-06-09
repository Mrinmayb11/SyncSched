import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PlatformSelectionStep from "./components/sync-steps/PlatformSelectionStep";
import CollectionSelectionStep from './components/sync-steps/CollectionSelectionStep';
import NotionConnectionStep from './components/sync-steps/NotionConnectionStep';
import StartSyncStep from './components/sync-steps/StartSyncStep';

const STEPS = {
  PLATFORM_SELECT: "platform-select",
  COLLECTION_SELECT: "collection-select",
  NOTION_CONNECT: "notion-connect",
  START_SYNC: "start-sync",
};

// Storage keys for persisting state
const STORAGE_KEYS = {
  CURRENT_STEP: 'syncsched_current_step',
  SELECTED_PLATFORM: 'syncsched_selected_platform',
  PLATFORM_CONNECTED: 'syncsched_platform_connected',
  SELECTED_COLLECTIONS: 'syncsched_selected_collections',
  NOTION_CONNECTED: 'syncsched_notion_connected',
};

export default function NotionToBlogsPage() {
  // Initialize state from localStorage if available
  const [currentStep, setCurrentStep] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_STEP) || STEPS.PLATFORM_SELECT;
  });
  
  const [selectedPlatform, setSelectedPlatform] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_PLATFORM) || null;
  });
  
  const [platformConnected, setPlatformConnected] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.PLATFORM_CONNECTED) === 'true';
  });
  
  const [selectedCollections, setSelectedCollections] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_COLLECTIONS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [notionConnected, setNotionConnected] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.NOTION_CONNECTED) === 'true';
  });

  // Persist state changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_STEP, currentStep);
  }, [currentStep]);

  useEffect(() => {
    if (selectedPlatform) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PLATFORM, selectedPlatform);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PLATFORM);
    }
  }, [selectedPlatform]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLATFORM_CONNECTED, platformConnected.toString());
  }, [platformConnected]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_COLLECTIONS, JSON.stringify(selectedCollections));
  }, [selectedCollections]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NOTION_CONNECTED, notionConnected.toString());
  }, [notionConnected]);

  // Auto-advance steps based on stored state when component loads
  useEffect(() => {
    // If platform is connected and we are on the platform select step, advance.
    if (currentStep === STEPS.PLATFORM_SELECT && selectedPlatform && platformConnected) {
      setCurrentStep(STEPS.COLLECTION_SELECT);
      return; // Prevent further checks in the same render
    }
    // If collections are selected and we are on the collection select step, advance.
    if (currentStep === STEPS.COLLECTION_SELECT && selectedCollections.length > 0 && platformConnected) {
      setCurrentStep(STEPS.NOTION_CONNECT);
      return;
    }
    // If notion is connected and we are on the notion connect step, advance.
    if (currentStep === STEPS.NOTION_CONNECT && notionConnected) {
      setCurrentStep(STEPS.START_SYNC);
    }
  }, [currentStep, selectedPlatform, platformConnected, selectedCollections, notionConnected]);

  const handlePlatformSelect = (platformId) => {
    setSelectedPlatform(platformId);
    setPlatformConnected(false); // Reset connection status if platform changes
    setSelectedCollections([]); // Reset selected collections when platform changes
    setNotionConnected(false); // Also reset Notion connection if source platform changes
  };

  const handlePlatformConnectionStatus = (platformId, isConnected) => {
    if (selectedPlatform === platformId) {
      setPlatformConnected(isConnected);
      if (!isConnected) {
        setSelectedCollections([]); // Clear collections if platform disconnects
        setNotionConnected(false); // Reset Notion connection if source disconnects
      }
    }
  };

  const handleCollectionsSelect = (newSelectedCollectionIds) => {
    setSelectedCollections(newSelectedCollectionIds);
  };

  const handleNotionConnectionStatus = (isConnected) => {
    setNotionConnected(isConnected);
  };

  const goToNextStep = (nextStep) => {
    setCurrentStep(nextStep);
  };

  // Function to reset the whole flow
  const resetFlow = () => {
    setCurrentStep(STEPS.PLATFORM_SELECT);
    setSelectedPlatform(null);
    setPlatformConnected(false);
    setSelectedCollections([]);
    setNotionConnected(false);
    
    // Clear localStorage
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case STEPS.PLATFORM_SELECT:
        return (
          <PlatformSelectionStep
            selectedPlatform={selectedPlatform}
            onPlatformSelect={handlePlatformSelect}
            platformConnected={platformConnected}
            onConnectionStatusChange={handlePlatformConnectionStatus}
            onNext={() => goToNextStep(STEPS.COLLECTION_SELECT)}
          />
        );
      case STEPS.COLLECTION_SELECT:
        return (
          <CollectionSelectionStep
            platformId={selectedPlatform}
            selectedCollections={selectedCollections}
            onCollectionsSelect={handleCollectionsSelect}
            onNext={() => goToNextStep(STEPS.NOTION_CONNECT)}
          />
        );
      case STEPS.NOTION_CONNECT:
        return (
          <NotionConnectionStep
            onNotionConnectionStatusChange={handleNotionConnectionStatus}
            onNext={() => goToNextStep(STEPS.START_SYNC)}
          />
        );
      case STEPS.START_SYNC:
        return (
          <StartSyncStep
            selectedPlatform={selectedPlatform}
            selectedCollections={selectedCollections}
            platformConnected={platformConnected}
            notionConnected={notionConnected}
            onResetFlow={resetFlow}
          />
        );
      default:
        return <p>Unknown or upcoming step.</p>;
    }
  };

  // Logic to enable/disable tabs based on progress
  const isStepDisabled = (stepToCheck) => {
    switch (stepToCheck) {
      case STEPS.PLATFORM_SELECT:
        return false; // First step always enabled
      case STEPS.COLLECTION_SELECT:
        return !selectedPlatform || !platformConnected;
      case STEPS.NOTION_CONNECT:
        return !selectedPlatform || !platformConnected || selectedCollections.length === 0;
      case STEPS.START_SYNC:
        return !selectedPlatform || !platformConnected || selectedCollections.length === 0 || !notionConnected;
      default:
        return true;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Setup New Blog Sync</h1>
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New Blog Sync</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <Tabs value={currentStep} onValueChange={(step) => {
        // Allow navigation to previous, completed steps but not future, disabled ones
        if (!isStepDisabled(step)) {
          setCurrentStep(step);
        }
      }} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value={STEPS.PLATFORM_SELECT} disabled={isStepDisabled(STEPS.PLATFORM_SELECT)}>
            1. Source & Connect
          </TabsTrigger>
          <TabsTrigger value={STEPS.COLLECTION_SELECT} disabled={isStepDisabled(STEPS.COLLECTION_SELECT)}>
            2. Select Content
          </TabsTrigger>
          <TabsTrigger value={STEPS.NOTION_CONNECT} disabled={isStepDisabled(STEPS.NOTION_CONNECT)}>
            3. Connect Notion
          </TabsTrigger>
          <TabsTrigger value={STEPS.START_SYNC} disabled={isStepDisabled(STEPS.START_SYNC)}>
            4. Sync
          </TabsTrigger>
        </TabsList>

        {/* Render content for the active tab/step */} 
        {/* Using TabsContent for each step might be an option if you prefer that structure, 
            but dynamically rendering the component as below gives more control for now. */}
        <div className="mt-4">
          {renderStepContent()}
        </div>

      </Tabs>

      {/* The old list view can be a separate component or displayed conditionally once sync is set up */}
      {/* <div className="bg-white rounded-lg shadow-sm border p-6 w-full mt-10">
        <h2 className="text-xl font-semibold mb-4">Existing Syncs</h2>
        {/* ... (old list view code would go here or in a new component) ... */}
      {/* </div> */}
    </div>
  );
} 