// webflowService.js
import { WebflowClient } from 'webflow-api';
import 'dotenv/config';
import { db_client } from '../config/database.js';

// Get access token from DB
export async function getAccessToken() {
  try {
    const result = await db_client.query("SELECT access_token FROM cms_users ORDER BY id DESC LIMIT 1");
    // Add a check in case no token is found
    if (!result.rows || result.rows.length === 0 || !result.rows[0].access_token) {
        console.error('No Webflow access token found in cms_users table.');
        return null; 
    }
    return result.rows[0].access_token;
  } catch (error) {
    console.error('Error retrieving token from DB:', error.message);
    return null;
  }
}

// Webflow initialization




// Fetch collections from Webflow
export async function getCollections() {
  const accessToken = await getAccessToken();
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
export async function getCollectionFields() {
  try {
    const collectionsResult = await getCollections();

    if (!collectionsResult || !collectionsResult.collections || !collectionsResult.access_token) {
      console.error("getCollections did not return the expected structure. Aborting getCollectionFields.");
      return [];
    }

    const { collections, access_token } = collectionsResult;

    if (!collections || collections.length === 0) {
         console.log("No collections found to fetch fields for.");
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
    // console.log('DEBUG: Final structure of collection fields being returned:', JSON.stringify(finalResults, null, 2)); 
    return finalResults;

  } catch (error) {
      console.error("Error in getCollectionFields:", error);
      return [];
  }
}


export async function getCollectionItems(){
  try {
    const {collections, access_token} = await getCollections();
    const collectionFields = await getCollectionFields();
    
    if (!collectionFields || collectionFields.length === 0) {
      console.log("No collections found");
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

export async function getCollectionItem(){
  try {
    const {collections, access_token} = await getCollections();
    const collectionFields = await getCollectionFields();
    const collectionItems = await getCollectionItems();

    if (!collectionItems || collectionItems.length === 0) {
      console.log("No collections found");
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

// --- Add this code to call the function and log the result ---

