import React, { useState, useEffect } from "react";
import { SelectOption } from "./DropdownSelect";
import axiosInstance from "@/lib/axiosInstance"; // Import the configured Axios instance

export default function GetCollectionLists() {
  const [cmsItems, setCmsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // const [authorized, setAuthorized] = useState(false);

  async function fetchCollections() {
    try {
      setLoading(true);
      setError(null); // Reset error on new fetch
      
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
      
      // Make request using axiosInstance - Authorization header is added automatically
      console.log("Fetching collections from API via Axios...");
      // Use axiosInstance.get(). The response data is directly in response.data
      const response = await axiosInstance.get("/api/webflow/collections"); 

      // Axios throws errors for non-2xx responses automatically, 
      // so the explicit !response.ok check is usually not needed here.
      // Error handling will be done in the catch block or response interceptor.

      const collections = response.data; // Data is directly in response.data
      console.log("API response (Axios):", collections);

      const formattedCollections = Array.isArray(collections)
        ? collections.map((collection) => ({
            value: collection.id || collection._id, // Use actual unique IDs
            label: collection.displayName || collection.name,
            href: "https://api.notion.com/v1/oauth/authorize?client_id=1cdd872b-594c-804a-87f5-003708c4fbf2&response_type=code&owner=user&redirect_uri=https%3A%2F%2Fd2cf-2401-4900-74e7-98d8-81a9-d90c-1cc9-270d.ngrok-free.app%2Fconnect-notion",
            icon: "",
          }))
        : [];
      
      console.log("Formatted collections:", formattedCollections);
      
      setCmsItems(formattedCollections);
      
      if (formattedCollections.length > 0) {
        // localStorage.setItem('webflowCollections', JSON.stringify(formattedCollections)); // Consider if cache is still needed
        console.log("Fetched collections successfully");
      } else {
        console.warn("No collections received from API");
      }

    } catch (err) {
      // Error handling might be improved by the response interceptor now
      console.error("Error fetching Webflow collections (Axios catch):", err.response?.data || err.message);
      setError(err.response?.data?.message || err.message || 'Failed to load collections');
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
