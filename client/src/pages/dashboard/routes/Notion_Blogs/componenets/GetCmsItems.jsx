import React, { useState, useEffect } from "react";
import { SelectOption } from "./DropdownSelect";

export default function GetCollectionLists() {
  const [cmsItems, setCmsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // const [authorized, setAuthorized] = useState(false);

  async function fetchCollections() {
    try {
      setLoading(true);
      
      // First check for cached collections
      const cachedCollections = localStorage.getItem('webflowCollections');
      console.log("Cached collections from localStorage:", cachedCollections);
      
      if (cachedCollections) {
        try {
          const parsedCollections = JSON.parse(cachedCollections);
          console.log("Parsed cached collections:", parsedCollections);
          
          if (Array.isArray(parsedCollections) && parsedCollections.length > 0) {
            console.log("Using cached collections, count:", parsedCollections.length);
            setCmsItems(parsedCollections);
            setLoading(false);
            // setAuthorized(true);
            return; // Use cached data and don't proceed with fetch
          }
        } catch (e) {
          console.error("Error parsing cached collections:", e);
          // Continue with fetch if parsing fails
        }
      }
      
      // Correct API endpoint for collections
      console.log("Fetching collections from API");
      const response = await fetch("http://localhost:5000/api/webflow/collections");
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const collections = await response.json();
      console.log("API response:", collections);

      const formattedCollections = Array.isArray(collections)
        ? collections.map((collection) => ({
            value: collection.id || collection._id, // Use actual unique IDs
            label: collection.displayName || collection.name,
            href: "#",
            icon: "",
          }))
        : [];
      
      console.log("Formatted collections:", formattedCollections);
      
      // Update state
      setCmsItems(formattedCollections);
      
      // Properly store collections in localStorage as a JSON string
      if (formattedCollections.length > 0) {
        localStorage.setItem('webflowCollections', JSON.stringify(formattedCollections));
        setAuthorized(true);
        console.log("Saved collections to localStorage");
      } else {
        console.warn("No collections to save to localStorage");
      }
      
      console.log("Fetched collections successfully");
    } catch (err) {
      console.error("Error fetching Webflow collections:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCollections();
  }, []);

  console.log("Rendering GetCollectionLists with cmsItems:", cmsItems);

  if (loading && cmsItems.length === 0) {
    return <div className="loader">Loading collections...</div>;
  }

  if (error && cmsItems.length === 0) {
    return <div className="text-sm text-red-500">Error loading collections</div>;
  }

  return (
    <SelectOption
      options={cmsItems} // Use state instead of direct localStorage access
      CustomText="With Notion"
      multiSelect={true}
      storageKey="selectedCollections" // Let dropdown handle its own selections
    />
  );
}
