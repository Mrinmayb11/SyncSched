import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import axiosInstance from '@/lib/axiosInstance';
import { Loader2 } from 'lucide-react';

export default function CollectionSelectionStep({ platformId, webflowAuthId, selectedCollections, onCollectionsSelect, onNext }) {
  const [collections, setCollections] = useState([]);
  const [siteInfo, setSiteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCollections() {
      if (!platformId || !webflowAuthId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await axiosInstance.get('/api/webflow/collections', {
          params: { webflowAuthId }
        });
        const data = response.data || {};
        
        console.log('Full API response:', response.data);
        console.log('Collections from response:', data.collections);
        console.log('Type of collections:', typeof data.collections);
        console.log('Is collections an array?', Array.isArray(data.collections));
        
        const collections = data.collections || [];
        const site = data.site || null;
        
        setCollections(collections);
        setSiteInfo(site);
        
        console.log(`Loaded ${collections.length} collections for site: ${site?.displayName || 'Unknown'}`);
      } catch (err) {
        setError('Failed to load collections. Please try reconnecting the platform.');
        console.error("Fetch collections error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCollections();
  }, [platformId, webflowAuthId]);

  const handleCheckboxChange = (collectionId) => {
    const newSelection = selectedCollections.includes(collectionId)
      ? selectedCollections.filter(id => id !== collectionId)
      : [...selectedCollections, collectionId];
    onCollectionsSelect(newSelection);
  };

  const renderContent = () => {
    if (loading) {
      return <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    if (error) {
      return <p className="text-red-500">{error}</p>;
    }

    if (collections.length === 0) {
      return <p>No collections found for the connected account.</p>;
    }

    return (
      <div className="space-y-3">
        {siteInfo && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Webflow Site:</strong> {siteInfo.displayName || siteInfo.name}
            </p>
          </div>
        )}
                            {collections.map(collection => (
          <div key={collection.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                <Checkbox
              id={collection.id}
              checked={selectedCollections.includes(collection.id)}
              onCheckedChange={() => handleCheckboxChange(collection.id)}
                                />
                                <label
              htmlFor={collection.id}
              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
              {collection.displayName || collection.name}
                                </label>
                            </div>
                            ))}
                        </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Select Content to Sync</CardTitle>
        <CardDescription>
          Choose the collections from your Webflow site you want to sync to Notion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderContent()}
        <Button onClick={onNext} disabled={selectedCollections.length === 0 || loading}>
          Next
        </Button>
      </CardContent>
    </Card>
  );
} 