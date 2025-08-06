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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import axiosInstance from '@/lib/axiosInstance';
import { Loader2, ChevronDown, ChevronUp, Filter, Search } from 'lucide-react';

export default function CollectionSelectionStep({ 
  platformId, 
  webflowAuthId, 
  selectedCollections, 
  onCollectionsSelect, 
  selectedItems = {}, // New prop: object with collectionId as key, array of itemIds as value
  onItemsSelect, // New prop: callback for item selection
  onNext 
}) {
  const [collections, setCollections] = useState([]);
  const [siteInfo, setSiteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Item-related state
  const [collectionItems, setCollectionItems] = useState({}); // collectionId -> items array
  const [loadingItems, setLoadingItems] = useState({}); // collectionId -> boolean
  const [itemsError, setItemsError] = useState({}); // collectionId -> error string
  const [expandedCollections, setExpandedCollections] = useState(new Set()); // which collections are expanded
  const [itemSearchTerms, setItemSearchTerms] = useState({}); // collectionId -> search term

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

  const handleCollectionCheckboxChange = (collectionId) => {
    const newSelection = selectedCollections.includes(collectionId)
      ? selectedCollections.filter(id => id !== collectionId)
      : [...selectedCollections, collectionId];
    onCollectionsSelect(newSelection);
    
    // Clear items selection when collection is deselected
    if (!newSelection.includes(collectionId) && selectedItems[collectionId]) {
      const newSelectedItems = { ...selectedItems };
      delete newSelectedItems[collectionId];
      onItemsSelect?.(newSelectedItems);
    }
  };

  const fetchItemsForCollection = async (collectionId) => {
    if (collectionItems[collectionId] || loadingItems[collectionId]) {
      return; // Already fetched or currently fetching
    }

    setLoadingItems(prev => ({ ...prev, [collectionId]: true }));
    setItemsError(prev => ({ ...prev, [collectionId]: null }));

    try {
      const response = await axiosInstance.get('/api/webflow/collections/items', {
        params: { 
          webflowAuthId,
          collectionIds: collectionId
        }
      });

      const data = response.data || {};
      const collectionData = data.collections?.[0]; // We only requested one collection
      
      if (collectionData && collectionData.items) {
        setCollectionItems(prev => ({
          ...prev,
          [collectionId]: collectionData.items
        }));
      } else {
        setItemsError(prev => ({
          ...prev,
          [collectionId]: 'No items found in this collection'
        }));
      }
    } catch (err) {
      console.error(`Error fetching items for collection ${collectionId}:`, err);
      setItemsError(prev => ({
        ...prev,
        [collectionId]: 'Failed to load items. Please try again.'
      }));
    } finally {
      setLoadingItems(prev => ({ ...prev, [collectionId]: false }));
    }
  };

  const toggleCollectionExpansion = (collectionId) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(collectionId)) {
      newExpanded.delete(collectionId);
    } else {
      newExpanded.add(collectionId);
      // Fetch items when expanding if not already fetched
      if (selectedCollections.includes(collectionId)) {
        fetchItemsForCollection(collectionId);
      }
    }
    setExpandedCollections(newExpanded);
  };

  const handleItemCheckboxChange = (collectionId, itemId) => {
    const currentItemsForCollection = selectedItems[collectionId] || [];
    const newItemsForCollection = currentItemsForCollection.includes(itemId)
      ? currentItemsForCollection.filter(id => id !== itemId)
      : [...currentItemsForCollection, itemId];
    
    const newSelectedItems = {
      ...selectedItems,
      [collectionId]: newItemsForCollection
    };
    
    // Remove empty arrays to keep the object clean
    if (newItemsForCollection.length === 0) {
      delete newSelectedItems[collectionId];
    }
    
    onItemsSelect?.(newSelectedItems);
  };

  const handleSelectAllItems = (collectionId, filteredOnly = false) => {
    const items = collectionItems[collectionId] || [];
    const filteredItems = getFilteredItems(collectionId, items);
    const itemsToSelect = filteredOnly ? filteredItems : items;
    const allItemIds = itemsToSelect.map(item => item.id);
    
    const newSelectedItems = {
      ...selectedItems,
      [collectionId]: allItemIds
    };
    
    onItemsSelect?.(newSelectedItems);
  };

  const handleSelectFilteredItems = (collectionId) => {
    handleSelectAllItems(collectionId, true);
  };

  const getFilteredItems = (collectionId, items) => {
    const searchTerm = itemSearchTerms[collectionId]?.toLowerCase() || '';
    if (!searchTerm) return items;
    
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm) ||
      (item.slug && item.slug.toLowerCase().includes(searchTerm))
    );
  };

  const handleItemSearch = (collectionId, searchTerm) => {
    setItemSearchTerms(prev => ({
      ...prev,
      [collectionId]: searchTerm
    }));
  };

  const handleDeselectAllItems = (collectionId) => {
    const newSelectedItems = { ...selectedItems };
    delete newSelectedItems[collectionId];
    onItemsSelect?.(newSelectedItems);
  };

  const renderItemsList = (collectionId) => {
    const items = collectionItems[collectionId];
    const selectedItemsForCollection = selectedItems[collectionId] || [];
    const isLoadingItems = loadingItems[collectionId];
    const error = itemsError[collectionId];

    if (!selectedCollections.includes(collectionId)) {
      return (
        <div className="text-sm text-muted-foreground p-4 text-center">
          Select this collection first to view its items
        </div>
      );
    }

    if (isLoadingItems) {
      return (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading items...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-sm text-red-500 p-4 text-center">
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2"
            onClick={() => fetchItemsForCollection(collectionId)}
          >
            Retry
          </Button>
        </div>
      );
    }

    if (!items || items.length === 0) {
      return (
        <div className="text-sm text-muted-foreground p-4 text-center">
          No items found in this collection
        </div>
      );
    }

    const searchTerm = itemSearchTerms[collectionId] || '';
    const filteredItems = getFilteredItems(collectionId, items);
    const selectedInFilteredItems = filteredItems.filter(item => 
      selectedItemsForCollection.includes(item.id)
    ).length;

    return (
      <div className="space-y-2 p-4 border-t">
        {/* Search box */}
        <div className="flex items-center space-x-2 mb-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => handleItemSearch(collectionId, e.target.value)}
            className="flex-1"
          />
        </div>

        {/* Batch selection controls */}
        <div className="flex items-center justify-between mb-3 p-2 bg-gray-50 rounded">
          <span className="text-sm font-medium">
            {selectedItemsForCollection.length} of {items.length} items selected
            {searchTerm && (
              <span className="text-muted-foreground">
                {' '}({selectedInFilteredItems} of {filteredItems.length} in search)
              </span>
            )}
          </span>
          <div className="flex space-x-2">
            {searchTerm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectFilteredItems(collectionId)}
                disabled={selectedInFilteredItems === filteredItems.length}
              >
                Select Filtered
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSelectAllItems(collectionId)}
              disabled={selectedItemsForCollection.length === items.length}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeselectAllItems(collectionId)}
              disabled={selectedItemsForCollection.length === 0}
            >
              Deselect All
            </Button>
          </div>
        </div>

        {/* Items list */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {filteredItems.length === 0 && searchTerm ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              No items match "{searchTerm}". Try a different search term.
            </div>
          ) : (
            filteredItems.map(item => (
            <div key={item.id} className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50">
              <Checkbox
                id={`item-${item.id}`}
                checked={selectedItemsForCollection.includes(item.id)}
                onCheckedChange={() => handleItemCheckboxChange(collectionId, item.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {item.name}
                </div>
                {item.slug && (
                  <div className="text-xs text-muted-foreground truncate">
                    /{item.slug}
                  </div>
                )}
                <div className="flex space-x-1 mt-1">
                  {item.isDraft && <Badge variant="secondary" className="text-xs">Draft</Badge>}
                  {item.isArchived && <Badge variant="destructive" className="text-xs">Archived</Badge>}
                </div>
              </div>
            </div>
            ))
          )}
        </div>
      </div>
    );
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

        <Accordion type="multiple" value={Array.from(expandedCollections)}>
          {collections.map(collection => {
            const isSelected = selectedCollections.includes(collection.id);
            const isExpanded = expandedCollections.has(collection.id);
            const selectedItemsCount = selectedItems[collection.id]?.length || 0;

            return (
              <AccordionItem key={collection.id} value={collection.id}>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                <Checkbox
              id={collection.id}
                    checked={isSelected}
                    onCheckedChange={() => handleCollectionCheckboxChange(collection.id)}
                                />
                  <div className="flex-1 flex items-center justify-between">
                                <label
              htmlFor={collection.id}
                      className="text-sm font-medium leading-none cursor-pointer"
                                >
              {collection.displayName || collection.name}
                      {isSelected && selectedItemsCount > 0 && (
                        <Badge variant="outline" className="ml-2">
                          {selectedItemsCount} items
                        </Badge>
                      )}
                                </label>
                    
                    {isSelected && (
                      <AccordionTrigger
                        className="hover:no-underline p-1"
                        onClick={() => toggleCollectionExpansion(collection.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </AccordionTrigger>
                    )}
                  </div>
                            </div>
                
                {isSelected && (
                  <AccordionContent>
                    {renderItemsList(collection.id)}
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
                        </div>
    );
  };

  const isNextEnabled = () => {
    if (selectedCollections.length === 0 || loading) {
      return false;
    }
    
    // Check if user has made item selections for selected collections
    // If no items are explicitly selected, we'll sync all items (backward compatibility)
    return true;
  };

  const getSelectionSummary = () => {
    const totalCollections = selectedCollections.length;
    const totalSelectedItems = Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0);
    
    if (totalSelectedItems > 0) {
      return `${totalCollections} collections, ${totalSelectedItems} specific items selected`;
    }
    
    return `${totalCollections} collections selected (all items will be synced)`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Select Content to Sync</CardTitle>
        <CardDescription>
          Choose the collections and optionally specific items from your Webflow site you want to sync to Notion.
          <br />
          <small className="text-muted-foreground">
            Tip: Click on a selected collection to choose specific items, or leave expanded to sync all items.
          </small>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderContent()}
        
        {selectedCollections.length > 0 && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Selection Summary:</strong> {getSelectionSummary()}
            </p>
          </div>
        )}
        
        <Button onClick={onNext} disabled={!isNextEnabled()}>
          Next
        </Button>
      </CardContent>
    </Card>
  );
} 