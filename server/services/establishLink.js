import { Client } from "@notionhq/client";
import { WebflowClient } from 'webflow-api';
import { get_notion_access_token } from '../services/fetch-notion.js';
import { getWebflowToken } from '../database/save-webflowInfo.js';
import pLimit from 'p-limit';

// --- Configuration ---
const NOTION_WEBFLOW_ID_PROPERTY_NAME = 'Webflow Item ID'; // Name of the property in Notion
const WEBFLOW_NOTION_ID_FIELD_NAME = 'Notion Page ID';    // Display Name of the field in Webflow
const WEBFLOW_NOTION_ID_FIELD_SLUG = 'notion-page-id';  // Slug for the field in Webflow (lowercase, hyphens)

// Rate limiting for API calls
const notionLimit = pLimit(1); // Limit Notion API concurrency
const webflowLimit = pLimit(1); // Limit Webflow API 

// --- Client Initialization (Now Requires userId) ---

async function getNotionClient(userId) {
    if (!userId) throw new Error("User ID required for getNotionClient");
    try {
        const token = await get_notion_access_token(userId); // Use DB function with userId
        if (!token) throw new Error(`Notion access token not found for user ${userId}.`);
        return new Client({ auth: token });
    } catch (error) {
        console.error(`Failed to initialize Notion client for user ${userId}:`, error.message);
        // Throw a more specific error
        throw new Error(`Could not initialize Notion client for user ${userId}.`);
    }
}

async function getWebflowClient(userId) {
     if (!userId) throw new Error("User ID required for getWebflowClient");
    try {
        const accessToken = await getWebflowToken(userId); // Use DB function with userId
        if (!accessToken) throw new Error(`Webflow access token not found for user ${userId}.`);
        return new WebflowClient({ accessToken });
    } catch (error) {
        console.error(`Failed to initialize Webflow client for user ${userId}:`, error.message);
        // Throw a more specific error
        throw new Error(`Could not initialize Webflow client for user ${userId}.`);
    }
}

// --- Notion Linking Functions (Now Require userId) ---

/**
 * Ensures a specific property exists in a Notion database schema.
 * Adds the property if it's missing.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {string} notionDbId - The ID of the Notion database.
 * @returns {Promise<object|null>} - The property object if it exists or was created, null on error.
 */
export async function CreateNotionIdProperty(userId, notionDbId) {
    if (!notionDbId) {
        console.error("[CreateNotionIdProperty] Missing notionDbId.");
        return null;
    }
    if (!userId) {
         console.error("[CreateNotionIdProperty] Missing userId.");
         return null;
    }
    const notion = await getNotionClient(userId);
    try {
        const dbInfo = await notion.databases.retrieve({ database_id: notionDbId });
        const properties = dbInfo.properties;

        if (properties[NOTION_WEBFLOW_ID_PROPERTY_NAME]) {
            return properties[NOTION_WEBFLOW_ID_PROPERTY_NAME];
        } else {
            const newPropertySchema = {
                [NOTION_WEBFLOW_ID_PROPERTY_NAME]: {
                    rich_text: {}

                }
            };
            await notion.databases.update({
                database_id: notionDbId,
                properties: newPropertySchema,
            });
            const updatedDbInfo = await notion.databases.retrieve({ database_id: notionDbId });
            return updatedDbInfo.properties[NOTION_WEBFLOW_ID_PROPERTY_NAME];
        }
    } catch (error) {
        console.error(`[Notion Link] Error ensuring Notion property in DB ${notionDbId}:`, error.body ? JSON.stringify(error.body) : error.message);
        return null;
    }
}

/**
 * Updates a specific property on a Notion page with the Webflow Item ID.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {string} notionPageId - The ID of the Notion page to update.
 * @param {string} webflowItemId - The Webflow Item ID to store.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function updateNotionPageWithWebflowId(userId, notionPageId, webflowItemId) {
     if (!notionPageId || !webflowItemId) {
        console.error("[updateNotionPageWithWebflowId] Missing notionPageId or webflowItemId.");
        return false;
    }
    if (!userId) {
         console.error("[updateNotionPageWithWebflowId] Missing userId.");
         return false;
    }
    const notion = await getNotionClient(userId);
    try {
        const propertiesToUpdate = {
            [NOTION_WEBFLOW_ID_PROPERTY_NAME]: {
                rich_text: [
                    {
                        type: 'text',
                        text: { content: webflowItemId }
                    }
                ]
            }
        };

        await notion.pages.update({
            page_id: notionPageId,
            properties: propertiesToUpdate,
        });
        return true;
    } catch (error) {
        console.error(`[Notion Link] Error updating Notion page ${notionPageId} with Webflow ID:`, error.body ? JSON.stringify(error.body) : error.message);
        return false;
    }
}


// --- Webflow Linking Functions (Now Require userId) ---

/**
 * Attempts to create the standard "Notion Page ID" PlainText field in a Webflow collection.
 * Handles errors gracefully if the field already exists.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {string} webflowCollectionId - The ID of the Webflow collection.
 * @returns {Promise<boolean>} - True if the field likely exists (either created or already present), false on other errors.
 */
export async function ensureWebflowNotionIdField(userId, webflowCollectionId) {
    if (!webflowCollectionId) {
        console.error("[ensureWebflowNotionIdField] Missing webflowCollectionId.");
        return false;
    }
     if (!userId) {
         console.error("[ensureWebflowNotionIdField] Missing userId.");
         return false;
    }
    const webflow = await getWebflowClient(userId);
    try {
        // 1. Check if the field already exists by fetching collection details
        const collection = await webflow.collections.get(webflowCollectionId);
        const existingField = collection.fields?.find(field => field.displayName === WEBFLOW_NOTION_ID_FIELD_NAME);

        if (existingField) {
            // console.log(`[Webflow Link] Field '${WEBFLOW_NOTION_ID_FIELD_NAME}' already exists in Collection ${webflowCollectionId}.`);
            return true; // Field already exists
        }

        // 2. If not found, attempt to create it
        // console.log(`[Webflow Link] Field '${WEBFLOW_NOTION_ID_FIELD_NAME}' not found. Attempting to create...`);
        const newFieldData = {
            type: 'PlainText',
            displayName: WEBFLOW_NOTION_ID_FIELD_NAME, // Webflow will auto-generate the slug
        };
        await webflow.collections.fields.create(webflowCollectionId, newFieldData);
        // console.log(`[Webflow Link] Successfully created field '${WEBFLOW_NOTION_ID_FIELD_NAME}' in Collection ${webflowCollectionId}.`);
        return true; // Field created successfully

    } catch (error) {
        // Log errors that occur during fetching or creation (excluding the 'already exists' case handled above)
        const errorData = error.response?.data;
        const errorMessage = errorData?.message || errorData?.msg || error.message || '';
        const errorCode = errorData?.code;

        // Avoid logging expected 400 if the field *was* found but creation was still attempted (shouldn't happen with the check)
        // Log other errors
        console.error(`[Webflow Link] Error ensuring Webflow field '${WEBFLOW_NOTION_ID_FIELD_NAME}' in Collection ${webflowCollectionId}:`);
        console.error(`  - Status: ${error.response?.status}`);
        console.error(`  - Code: ${errorCode || 'N/A'}`);
        console.error(`  - Message: ${errorMessage}`);
        if (errorData) {
             console.error(`  - Body: ${JSON.stringify(errorData)}`);
        }
        return false; // Indicate failure
    }
}

/**
 * Updates a specific Webflow collection item with the Notion Page ID.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {string} webflowCollectionId - The ID of the Webflow collection.
 * @param {string} webflowItemId - The ID of the Webflow item to update.
 * @param {string} notionPageId - The Notion Page ID to store in the item.
 * @param {Array<object>} [webflowFieldsSchema] - Optional: The fields schema for the collection to avoid an extra API call.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function updateWebflowItemWithNotionId(userId, webflowCollectionId, webflowItemId, notionPageId, webflowFieldsSchema = null) {
    if (!webflowCollectionId || !webflowItemId || !notionPageId) {
        console.error("[updateWebflowItemWithNotionId] Missing required arguments.");
        return false;
    }
    if (!userId) {
         console.error("[updateWebflowItemWithNotionId] Missing userId.");
         return false;
    }

    const webflow = await getWebflowClient(userId);
    try {
        let notionIdField = null;

        // Use provided schema if available
        
            const collection = await webflow.collections.get(webflowCollectionId);
            notionIdField = collection.fields?.find(field => field.displayName === WEBFLOW_NOTION_ID_FIELD_NAME);
  

        if (!notionIdField) {
            console.error(`[Webflow Link] Field '${WEBFLOW_NOTION_ID_FIELD_NAME}' not found in collection ${webflowCollectionId}. Ensure the field exists or was passed correctly.`);
            return false;
        }
        // Use the ACTUAL slug from the found field object
        const actualSlug = notionIdField.slug;
        // console.log(`[Webflow Link] Found slug '${actualSlug}' for field '${WEBFLOW_NOTION_ID_FIELD_NAME}'`);

        const fieldsToUpdate = {
            [actualSlug]: notionPageId 
        };

        delete fieldsToUpdate._id; 
        delete fieldsToUpdate['item-id']; 

        await webflow.collections.items.updateItem(webflowCollectionId, webflowItemId, { fieldData: fieldsToUpdate });
        return true;
    } catch (error) {
        console.error(`[Webflow Link] Error updating Webflow item ${webflowItemId} in collection ${webflowCollectionId}:`, error.response?.data || error.message);
        return false;
    }
}

