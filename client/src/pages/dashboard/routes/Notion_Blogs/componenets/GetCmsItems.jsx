import React, { useState, useEffect } from "react";
import { SelectOption } from "./DropdownSelect";
import axiosInstance from "@/lib/axiosInstance"; // Import the configured Axios instance

export default function GetCollectionLists() {
  const [cmsItems, setCmsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchCollections() {
    try {
      setLoading(true);
      setError(null); 

      const selectedCollectionsString = localStorage.getItem('selectedCollections');

      if (selectedCollectionsString) {
        try {
          const parsedSelectedCollections = JSON.parse(selectedCollectionsString);

          // If there are valid, non-empty selected collections, use them.
          if (Array.isArray(parsedSelectedCollections) && parsedSelectedCollections.length > 0) {
            setCmsItems(parsedSelectedCollections); // These are already in the correct format
            setLoading(false);
            return; // Done, no need to fetch full list
          } else if (Array.isArray(parsedSelectedCollections) && parsedSelectedCollections.length === 0) {
            // Proceed to fetch full list if selection is empty
          } else {
            localStorage.removeItem('selectedCollections');
          }
        } catch (e) {
          localStorage.removeItem('selectedCollections');
        }
      }
      
      // If we reach here, it means we need to fetch the full list from the API
      const response = await axiosInstance.get("/api/webflow/collections"); 
      const collectionsFromApi = response.data;

      const formattedApiCollections = Array.isArray(collectionsFromApi)
        ? collectionsFromApi.map((collection) => ({
            value: collection.id || collection._id,
            label: collection.displayName || collection.name,
            href: "", // Removed hardcoded Notion OAuth URL
            icon: "", 
          }))
        : [];
      
      setCmsItems(formattedApiCollections);

    } catch (err) {
      console.error("Error fetching Webflow collections:", err.response?.data || err.message);
      setError(err.response?.data?.message || err.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCollections();
  }, []);

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
      storageKey="selectedCollectionsForNotion" // Corrected to use "selectedCollectionsForNotion"
    />
  );
}
