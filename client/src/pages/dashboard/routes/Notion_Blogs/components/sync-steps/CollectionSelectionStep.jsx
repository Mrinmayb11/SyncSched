import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox"; // Using Checkbox for multi-select list
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import axiosInstance from '@/lib/axiosInstance'; // For making API calls

export default function CollectionSelectionStep({ platformId, selectedCollections, onCollectionsSelect, onNext }) {
  const [availableCollections, setAvailableCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlatformCollections = useCallback(async () => {
    if (!platformId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch collections for the specific platform using the correct endpoint
      const response = await axiosInstance.get(`/api/${platformId}/collections`);
      
      const collections = response.data;
      if (Array.isArray(collections)) {
        setAvailableCollections(collections.map(col => ({ 
          id: col.id || col._id, // Use actual unique IDs
          label: col.displayName || col.name,
          // Add itemCount if available from API: itemCount: col.itemCount
        })));
      } else {
        console.error("Collections data is not an array:", collections);
        setAvailableCollections([]);
        setError("Received invalid collection data from server.");
      }
    } catch (err) {
      console.error(`Error fetching collections for ${platformId}:`, err.response?.data || err.message);
      setError(err.response?.data?.message || err.message || 'Failed to load collections.');
      setAvailableCollections([]);
    } finally {
      setLoading(false);
    }
  }, [platformId]);

  useEffect(() => {
    fetchPlatformCollections();
  }, [fetchPlatformCollections]);

  const handleCheckboxChange = (collectionId) => {
    const newSelectedCollections = selectedCollections.includes(collectionId)
      ? selectedCollections.filter(id => id !== collectionId)
      : [...selectedCollections, collectionId];
    onCollectionsSelect(newSelectedCollections);
  };

  if (!platformId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 2: Select Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please connect a platform in the previous step first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Select Collections</CardTitle>
        <CardDescription>
          Choose the collections from {platformId} you want to sync to Notion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && <p>Loading collections...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        {!loading && !error && availableCollections.length === 0 && (
          <p>No collections found for {platformId} or you may not have access.</p>
        )}
        {!loading && !error && availableCollections.length > 0 && (
          <ScrollArea className="h-72 w-full rounded-md border p-4">
            <div className="space-y-2">
              {availableCollections.map((collection) => (
                <div key={collection.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`collection-${collection.id}`}
                    checked={selectedCollections.includes(collection.id)}
                    onCheckedChange={() => handleCheckboxChange(collection.id)}
                  />
                  <Label htmlFor={`collection-${collection.id}`} className="flex-grow">
                    {collection.label}
                    {/* {collection.itemCount !== undefined && (
                      <span className="text-xs text-muted-foreground ml-2">({collection.itemCount} items)</span>
                    )} */}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        <Button onClick={onNext} disabled={loading || error || selectedCollections.length === 0}>
          {selectedCollections.length > 0 ? 'Continue Now' : 'Select Collections'}
        </Button>
      </CardContent>
    </Card>
  );
} 