// webflowService.js
import { WebflowClient } from 'webflow-api';
import 'dotenv/config';
import { getWebflowToken } from '../database/save-webflowInfo.js'; 


async function getAccessToken(userId) { 
  if (!userId) {
      // This function is called internally by others in this file.
      // The userId needs to be passed down from the initial call (e.g., in syncOrchestrator or API route)
      console.error('getAccessToken in fetch-webflow.js requires a userId.');
      throw new Error("User ID not provided to getAccessToken.");
  }
  try {
    // Use the new function, passing the userId
    const token = await getWebflowToken(userId);
    if (!token) {
         console.error(`No Webflow token found in Supabase for user ${userId}.`);
    }
    return token;
    // Old query:
    // const result = await db_client.query("SELECT access_token FROM cms_users ORDER BY id DESC LIMIT 1");
    // return result.rows[0].access_token;
  } catch (error) {
    console.error('Error retrieving Webflow token via database.js:', error.message);
    return null;
  }
}

// Webflow initialization




// Fetch collections from Webflow
// MUST NOW ACCEPT userId
async function getCollections(userId) {
  const accessToken = await getAccessToken(userId); // Pass userId
  if (!accessToken) return [];
  const webflow = new WebflowClient({ accessToken });
  
  try {

    const sitesResponse = await webflow.sites.list();
    if (!sitesResponse?.sites?.length) return [];

    const siteId = sitesResponse.sites[0].id;
    const collectionsResponse = await webflow.collections.list(siteId);

    return {collections: collectionsResponse?.collections, access_token: accessToken};
  } catch (error) {
    console.error('Error fetching collections:', error.message);
    return [];
  }
}

// Fetch fields for each collection
// MUST NOW ACCEPT userId
async function getCollectionFields(userId) {
  try {
    // Pass userId down
    const collectionsResult = await getCollections(userId);

    if (!collectionsResult || !collectionsResult.collections || !collectionsResult.access_token) {
      console.error("getCollections did not return the expected structure. Aborting getCollectionFields.");
      return [];
    }

    const { collections, access_token } = collectionsResult;

    if (!collections || collections.length === 0) {
        //  console.log("No collections found to fetch fields for."); // Removed log
         return [];
    }

    const webflow = new WebflowClient({ accessToken: access_token });

    const fieldResults = await Promise.all(collections.map(async (collection) => {
       try {
           const collectionData = await webflow.collections.get(collection.id);

           const fields = collectionData.fields.map((field) => ({
             displayName: field.displayName,
             slug: field.slug,
             type: field.type,
             validations: field.validations,
             id: field.id
           }));

           return {
             collectionId: collection.id,
             collectionName: collection.displayName,
             fields: fields
           };
       } catch (error) {
            console.error(`Failed to fetch fields for collection ${collection?.displayName || collection?.id}:`, error.message);
            return null;
       }
    }));

    // Filter out null results and log the final structure for debugging
    const finalResults = fieldResults.filter(Boolean);
    // console.log('DEBUG: Final structure of collection fields being returned:', JSON.stringify(finalResults, null, 2)); // Keep commented
    return finalResults;

  } catch (error) {
      console.error("Error in getCollectionFields:", error);
      return [];
  }
}


// MUST NOW ACCEPT userId
async function getCollectionItems(userId){
  try {
    // Pass userId down
    const {collections, access_token} = await getCollections(userId);
    // Pass userId down
    const collectionFields = await getCollectionFields(userId); 
    
    if (!collectionFields || collectionFields.length === 0) {
    //   console.log("No collections found"); // Removed log
      return [];
    }

    const webflow = new WebflowClient({ accessToken: access_token });
    
    // Process each collection's items
    const allItems = await Promise.all(collectionFields.map(async (collection) => {
      try {
        const items = await webflow.collections.items.listItems(collection.collectionId);
        return {
          collectionId: collection.collectionId,
          collectionName: collection.collectionName,
          items: items.items
        };
      } catch (error) {
        console.error(`Error fetching items for collection ${collection.collectionName}:`, error.message);
        return {
          collectionId: collection.collectionId,
          collectionName: collection.collectionName,
          items: []
        };
      }
    }));

    return allItems;
  } catch (error) {
    console.error('Error in getCollectionItems:', error.message);
    return [];
  }
}

// MUST NOW ACCEPT userId
async function getCollectionItem(userId){
  try {
    // Pass userId down
    const {collections, access_token} = await getCollections(userId);
    // Pass userId down
    const collectionFields = await getCollectionFields(userId);
    // Pass userId down
    const collectionItems = await getCollectionItems(userId);

    if (!collectionItems || collectionItems.length === 0) {
    //   console.log("No collections found"); // Removed log
      return [];
    }
    
    const allItemData = await Promise.all(collectionItems.map(async (item) => {
      const item_id = item.items.id;
      const item_data = item.items.fieldData;
      return {item_id, item_data};
    }));

    return allItemData;
  } catch (error) {
    console.error('Error in getCollectionItem:', error.message);
    return [];
  }
}

/**
 * Fetches all relevant data from Webflow: Collections, their fields, and their items.
 * Performs fetches efficiently by initializing the client once.
 * @param {string} userId - The ID of the user whose Webflow data should be fetched.
 * @returns {Promise<Array<{collectionId: string, collectionName: string, fields: Array<object>, items: Array<object>}>>}
 */
async function fetchAllWebflowData(userId) { // MUST NOW ACCEPT userId
    const accessToken = await getAccessToken(userId); // Pass userId
    if (!accessToken) {
        console.error(`Failed to get Webflow access token for user ${userId}. Cannot fetch data.`);
        return [];
    }
    const webflow = new WebflowClient({ accessToken });
    let siteId = null;

    // 1. Get Site ID
    try {
        const sitesResponse = await webflow.sites.list();
        if (!sitesResponse?.sites?.length) {
            console.error("No Webflow sites found for this token.");
            return [];
        }
        siteId = sitesResponse.sites[0].id;
    } catch (error) {
        console.error('Error fetching Webflow sites:', error.message);
        return [];
    }

    // 2. Get Collections List
    let collectionsList = [];
    try {
        const collectionsResponse = await webflow.collections.list(siteId);
        collectionsList = collectionsResponse?.collections || [];
        if (collectionsList.length === 0) {
            console.log("No collections found in the Webflow site.");
            return [];
        }
    } catch (error) {
        console.error('Error fetching Webflow collections:', error.message);
        return [];
    }

    // 3. Fetch Fields and Items for each Collection
    const detailedCollectionsData = await Promise.all(collectionsList.map(async (collection) => {
        let fields = [];
        let items = [];

        // Fetch Fields
        try {
            const collectionData = await webflow.collections.get(collection.id);
            fields = collectionData.fields.map((field) => ({
                displayName: field.displayName,
                slug: field.slug,
                type: field.type,
                validations: field.validations,
                id: field.id
            }));
        } catch (error) {
            console.error(`Failed to fetch fields for collection ${collection?.displayName || collection?.id}:`, error.message);
            // Decide if we should continue without fields or return null/empty for this collection
        }

        // Fetch Items
        try {
             // Add pagination logic here if needed for collections with > 100 items
            const itemsResponse = await webflow.collections.items.listItems(collection.id);
            items = itemsResponse.items || [];
        } catch (error) {
            console.error(`Error fetching items for collection ${collection.displayName}:`, error.message);
        }

        return {
            collectionId: collection.id,
            collectionName: collection.displayName,
            fields: fields,
            items: items
        };
    }));

    // Filter out any collections that might have failed fetching details
    const finalData = detailedCollectionsData.filter(Boolean);
    return finalData;
}


// --- Add this code to call the function and log the result ---
// Update exported functions to reflect the need for userId
export { 
    getAccessToken, // Internal function, likely not needed to be exported
    getCollections, 
    getCollectionFields, 
    getCollectionItems, 
    getCollectionItem, 
    fetchAllWebflowData // Keep this export
};