import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PlatformSelectionStep from './components/sync-steps/PlatformSelectionStep';
import NotionConnectionStep from './components/sync-steps/NotionConnectionStep';
import CollectionSelectionStep from './components/sync-steps/CollectionSelectionStep';
import StartSyncStep from './components/sync-steps/StartSyncStep';

export default function SyncSetupWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // State for tracking selections and connections
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [platformConnected, setPlatformConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [webflowAuthId, setWebflowAuthId] = useState(null);

  // Initialize state from localStorage and URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const savedPlatform = localStorage.getItem('syncsched_selected_platform');
    const savedConnected = localStorage.getItem('syncsched_platform_connected') === 'true';
    const savedNotionConnected = localStorage.getItem('syncsched_notion_connected') === 'true';
    const savedCollections = localStorage.getItem('syncsched_selected_collections');
    const savedStep = localStorage.getItem('syncsched_current_step');
    const savedWebflowAuthId = localStorage.getItem('syncsched_webflow_auth_id');
    
    // Check if we're coming back from OAuth
    const hasWebflowAuth = params.has('webflow_auth');
    const hasNotionAuth = params.has('notion_auth');
    
    console.log('SyncSetupWizard - Initializing with:', {
      savedPlatform,
      savedConnected,
      savedNotionConnected,
      savedStep,
      hasWebflowAuth,
      hasNotionAuth,
      currentUrl: location.pathname + location.search
    });
    
    if (savedPlatform) {
      setSelectedPlatform(savedPlatform);
    }
    
    if (savedConnected) {
      setPlatformConnected(true);
    }
    
    if (savedNotionConnected) {
      setNotionConnected(true);
    }
    
    if (savedWebflowAuthId) {
      setWebflowAuthId(savedWebflowAuthId);
    }
    
    if (savedCollections) {
      try {
        const collections = JSON.parse(savedCollections);
        setSelectedCollections(collections);
      } catch (e) {
        console.error('Failed to parse saved collections:', e);
      }
    }
    
    // Calculate the correct step based on current state
    let calculatedStep = 1;
    
    if (savedPlatform && savedConnected) {
      calculatedStep = 2; // Platform connected, go to Collections step
    }
    if (savedPlatform && savedConnected && savedCollections) {
      const collections = JSON.parse(savedCollections || '[]');
      if (collections.length > 0) {
        calculatedStep = 3; // Collections selected, go to Notion step
      }
    }
    if (savedPlatform && savedConnected && savedCollections && savedNotionConnected) {
      const collections = JSON.parse(savedCollections || '[]');
      if (collections.length > 0) {
        calculatedStep = 4; // Everything ready, go to final sync step
      }
    }
    
    // If we have a saved step and it's reasonable, use it, otherwise use calculated step
    if (savedStep && !isNaN(parseInt(savedStep))) {
      const savedStepNum = parseInt(savedStep);
      if (savedStepNum >= 1 && savedStepNum <= 4) {
        calculatedStep = Math.min(savedStepNum, calculatedStep); // Don't go beyond what state allows
      }
    }
    
    // If we're coming back from OAuth, don't jump ahead too much
    if (hasWebflowAuth && params.get('webflow_auth') === 'success') {
      calculatedStep = Math.min(calculatedStep, 2); // Max step 2 (Collections) after Webflow OAuth
    }
    if (hasNotionAuth && params.get('notion_auth') === 'success') {
      calculatedStep = Math.min(calculatedStep, 4); // Max step 4 (Sync) after Notion OAuth
    }
    
    console.log('SyncSetupWizard - Setting step to:', calculatedStep);
    setCurrentStep(calculatedStep);
    localStorage.setItem('syncsched_current_step', calculatedStep.toString());
    
    // Finish initialization
    setTimeout(() => {
      setIsInitializing(false);
    }, 500); // Small delay to ensure smooth transition
  }, [location.search]);

  const handleNext = () => {
    const nextStep = currentStep + 1;
    console.log('SyncSetupWizard - Moving to next step:', nextStep);
    setCurrentStep(nextStep);
    localStorage.setItem('syncsched_current_step', nextStep.toString());
  };

  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform);
    localStorage.setItem('syncsched_selected_platform', platform);
  };

  const handleConnectionStatusChange = (platform, isConnected, data) => {
    if (platform === selectedPlatform || !selectedPlatform) {
      setPlatformConnected(isConnected);
      localStorage.setItem('syncsched_platform_connected', isConnected.toString());

      if (isConnected && data && data.webflowAuthId) {
        setWebflowAuthId(data.webflowAuthId);
        localStorage.setItem('syncsched_webflow_auth_id', data.webflowAuthId);
        console.log(`SyncSetupWizard: Received and stored webflowAuthId: ${data.webflowAuthId}`);
      }
    }
  };

  const handleNotionConnectionStatusChange = (isConnected) => {
    setNotionConnected(isConnected);
    localStorage.setItem('syncsched_notion_connected', isConnected.toString());
  };

  const handleCollectionsSelect = (collections) => {
    setSelectedCollections(collections);
    localStorage.setItem('syncsched_selected_collections', JSON.stringify(collections));
  };

  const handleSyncComplete = () => {
    // Clear localStorage when sync is complete
    localStorage.removeItem('syncsched_selected_platform');
    localStorage.removeItem('syncsched_platform_connected');
    localStorage.removeItem('syncsched_notion_connected');
    localStorage.removeItem('syncsched_selected_collections');
    localStorage.removeItem('syncsched_current_step');
    
    // Navigate back to the main dashboard
    navigate('/dashboard/notion-to-blogs');
  };

  const handleResetFlow = () => {
    setCurrentStep(1);
    setSelectedPlatform('');
    setSelectedCollections([]);
    setPlatformConnected(false);
    setNotionConnected(false);
    
    // Clear localStorage
    localStorage.removeItem('syncsched_selected_platform');
    localStorage.removeItem('syncsched_platform_connected');
    localStorage.removeItem('syncsched_notion_connected');
    localStorage.removeItem('syncsched_selected_collections');
    localStorage.removeItem('syncsched_current_step');
  };

  const renderCurrentStep = () => {
    console.log('SyncSetupWizard - Rendering step:', currentStep, {
      selectedPlatform,
      platformConnected,
      notionConnected,
      selectedCollections: selectedCollections.length
    });

    switch (currentStep) {
      case 1:
        return (
          <PlatformSelectionStep
            selectedPlatform={selectedPlatform}
            onPlatformSelect={handlePlatformSelect}
            onNext={handleNext}
            platformConnected={platformConnected}
            onConnectionStatusChange={handleConnectionStatusChange}
          />
        );
      case 2:
        return (
          <CollectionSelectionStep
            platformId={selectedPlatform}
            webflowAuthId={webflowAuthId}
            selectedCollections={selectedCollections}
            onCollectionsSelect={handleCollectionsSelect}
            onNext={handleNext}
          />
        );
      case 3:
        return (
          <NotionConnectionStep
            onNext={handleNext}
            onNotionConnectionStatusChange={handleNotionConnectionStatusChange}
          />
        );
      case 4:
        return (
          <StartSyncStep
            selectedPlatform={selectedPlatform}
            selectedCollections={selectedCollections}
            platformConnected={platformConnected}
            notionConnected={notionConnected}
            onResetFlow={handleResetFlow}
            onSyncComplete={handleSyncComplete}
          />
        );
      default:
        console.error('SyncSetupWizard - Invalid step:', currentStep);
        return (
          <div className="p-6 text-center">
            <h3 className="text-lg font-semibold text-red-600">Invalid Step</h3>
            <p className="text-gray-600">Something went wrong. Please refresh the page.</p>
            <button 
              onClick={handleResetFlow}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Reset Wizard
            </button>
          </div>
        );
    }
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Setting up your sync wizard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {renderCurrentStep()}
    </div>
  );
} 