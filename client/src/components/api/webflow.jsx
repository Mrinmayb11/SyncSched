import React, { useState, useEffect } from "react";

function WebflowData() {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
  
    useEffect(() => {
      async function fetchWebflowData() {
        try {
          setLoading(true);
          const response = await fetch('/api/webflow/collections');
          
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          setCollections(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error('Error in fetchWebflowData:', err);
          setError(err);
        } finally {
          setLoading(false);
        }
      }

      fetchWebflowData();
    }, []);

    if (loading) {
      return <div>Loading webflow data...</div>;
    }

    if (error) {
      return <div>Error loading webflow data: {error.message}</div>;
    }

    return (
      <div className="webflow-data">
        <h2 className="text-xl font-bold mb-2">Webflow Collections</h2>
        {collections && collections.length > 0 ? (
          <ul className="space-y-1">
            {collections.map((collection, index) => (
              <li key={index} className="p-2 bg-gray-100 rounded">
                {collection.name || collection.displayName}
              </li>
            ))}
          </ul>
        ) : (
          <div>No collections found</div>
        )}
      </div>
    );
}

export default WebflowData;