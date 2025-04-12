import { Client } from "@notionhq/client";
import { WebflowClient } from 'webflow-api';
import { get_notion_access_token } from './fetch-notion.js'; // Assuming this uses pg for now
import { getAccessToken as getWebflowAccessToken } from './fetch-webflow.js'; // Assuming this uses pg for now
import pLimit from 'p-limit';

// --- Configuration ---
const NOTION_WEBFLOW_ID_PROPERTY_NAME = 'Webflow Item ID'; // Name of the property in Notion
const WEBFLOW_NOTION_ID_FIELD_NAME = 'Notion Page ID';    // Display Name of the field in Webflow
const WEBFLOW_NOTION_ID_FIELD_SLUG = 'notion-page-id';  // Slug for the field in Webflow (lowercase, hyphens)

// Rate limiting for API calls
const notionLimit = pLimit(1); // Limit Notion API concurrency
const webflowLimit = pLimit(1); // Limit Webflow API concurrency

// --- Placeholder Client Initialization ---
// TODO: Refactor token management (use Supabase or consolidate pg usage)
async function getNotionClient() {
    try {
        const token = await get_notion_access_token(); // From fetch-notion.js
        if (!token) throw new Error("Notion access token not found.");
        return new Client({ auth: token });
    } catch (error) {
        console.error("Failed to initialize Notion client:", error.message);
        throw new Error("Could not initialize Notion client.");
    }
}

async function getWebflowClient() {
    try {
        const accessToken = await getWebflowAccessToken(); // From fetch-webflow.js
        if (!accessToken) throw new Error("Webflow access token not found.");
        return new WebflowClient({ accessToken });
    } catch (error) {
        console.error("Failed to initialize Webflow client:", error.message);
        throw new Error("Could not initialize Webflow client.");
    }
}

// --- Notion Linking Functions ---

/**
 * Ensures a specific property exists in a Notion database schema.
 * Adds the property if it's missing.
 * @param {string} notionDbId - The ID of the Notion database.
 * @returns {Promise<object|null>} - The property object if it exists or was created, null on error.
 */
export const ensureNotionWebflowIdProperty = notionLimit(async (notionDbId) => {
    if (!notionDbId) {
        console.error("[ensureNotionWebflowIdProperty] Missing notionDbId.");
        return null;
    }
    console.log(`[Notion Link] Ensuring property '${NOTION_WEBFLOW_ID_PROPERTY_NAME}' exists in DB ${notionDbId}...`);
    const notion = await getNotionClient();
    try {
        const dbInfo = await notion.databases.retrieve({ database_id: notionDbId });
        const properties = dbInfo.properties;

        if (properties[NOTION_WEBFLOW_ID_PROPERTY_NAME]) {
            console.log(`[Notion Link] Property '${NOTION_WEBFLOW_ID_PROPERTY_NAME}' already exists in DB ${notionDbId}.`);
            return properties[NOTION_WEBFLOW_ID_PROPERTY_NAME];
        } else {
            console.log(`[Notion Link] Property '${NOTION_WEBFLOW_ID_PROPERTY_NAME}' not found. Adding...`);
            const newPropertySchema = {
                [NOTION_WEBFLOW_ID_PROPERTY_NAME]: {
                    // Using rich_text is generally safer and simpler than URL for IDs
                    rich_text: {}
                    // Alternatively, use URL type if you prefer:
                    // url: {}
                }
            };
            await notion.databases.update({
                database_id: notionDbId,
                properties: newPropertySchema,
            });
            console.log(`[Notion Link] Successfully added property '${NOTION_WEBFLOW_ID_PROPERTY_NAME}' to DB ${notionDbId}.`);
            // Retrieve again to confirm and return the new property object
            const updatedDbInfo = await notion.databases.retrieve({ database_id: notionDbId });
            return updatedDbInfo.properties[NOTION_WEBFLOW_ID_PROPERTY_NAME];
        }
    } catch (error) {
        console.error(`[Notion Link] Error ensuring Notion property in DB ${notionDbId}:`, error.body ? JSON.stringify(error.body) : error.message);
        return null;
    }
});

/**
 * Updates a specific property on a Notion page with the Webflow Item ID.
 * @param {string} notionPageId - The ID of the Notion page to update.
 * @param {string} webflowItemId - The Webflow Item ID to store.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export const updateNotionPageWithWebflowId = notionLimit(async (notionPageId, webflowItemId) => {
     if (!notionPageId || !webflowItemId) {
        console.error("[updateNotionPageWithWebflowId] Missing notionPageId or webflowItemId.");
        return false;
    }
    console.log(`[Notion Link] Updating Notion page ${notionPageId} property '${NOTION_WEBFLOW_ID_PROPERTY_NAME}' with Webflow ID ${webflowItemId}...`);
    const notion = await getNotionClient();
    try {
        const propertiesToUpdate = {
            [NOTION_WEBFLOW_ID_PROPERTY_NAME]: {
                // Ensure format matches the property type defined in ensureNotionWebflowIdProperty
                rich_text: [
                    {
                        type: 'text',
                        text: { content: webflowItemId }
                    }
                ]
                // If using URL type:
                // url: `https://webflow.com/item/${webflowItemId}` // Example URL structure
            }
        };

        await notion.pages.update({
            page_id: notionPageId,
            properties: propertiesToUpdate,
        });
        console.log(`[Notion Link] Successfully updated Notion page ${notionPageId} with Webflow ID ${webflowItemId}.`);
        return true;
    } catch (error) {
        console.error(`[Notion Link] Error updating Notion page ${notionPageId} with Webflow ID:`, error.body ? JSON.stringify(error.body) : error.message);
        return false;
    }
});


// --- Webflow Linking Functions ---

/**
 * Ensures a specific "PlainText" field exists in a Webflow collection schema.
 * Adds the field if it's missing.
 * @param {string} webflowCollectionId - The ID of the Webflow collection.
 * @returns {Promise<object|null>} - The field object if it exists or was created, null on error.
 */
export const ensureWebflowNotionIdField = webflowLimit(async (webflowCollectionId) => {
    if (!webflowCollectionId) {
        console.error("[ensureWebflowNotionIdField] Missing webflowCollectionId.");
        return null;
    }
    console.log(`[Webflow Link] Ensuring field '${WEBFLOW_NOTION_ID_FIELD_NAME}' (slug: ${WEBFLOW_NOTION_ID_FIELD_SLUG}) exists in Collection ${webflowCollectionId}...`);
    const webflow = await getWebflowClient();
    try {
        const collection = await webflow.collections.get(webflowCollectionId);
        const existingField = collection.fields?.find(f => f.slug === WEBFLOW_NOTION_ID_FIELD_SLUG);

        if (existingField) {
            console.log(`[Webflow Link] Field '${WEBFLOW_NOTION_ID_FIELD_SLUG}' already exists in Collection ${webflowCollectionId}.`);
            // Optional: Check if type is PlainText and log warning/error if not
            if (existingField.type !== 'PlainText') {
                 console.warn(`[Webflow Link] WARNING: Existing field '${WEBFLOW_NOTION_ID_FIELD_SLUG}' in Collection ${webflowCollectionId} is type '${existingField.type}', expected 'PlainText'. Linking might fail.`);
            }
            return existingField;
        } else {
            console.log(`[Webflow Link] Field '${WEBFLOW_NOTION_ID_FIELD_SLUG}' not found. Adding...`);
            const newFieldData = {
                type: 'PlainText',
                displayName: WEBFLOW_NOTION_ID_FIELD_NAME,
                slug: WEBFLOW_NOTION_ID_FIELD_SLUG,
                required: false,
                helpText: 'Stores the ID of the corresponding Notion page for sync purposes.',
            };
            const createdField = await webflow.collections.createField(webflowCollectionId, newFieldData);
            console.log(`[Webflow Link] Successfully added field '${WEBFLOW_NOTION_ID_FIELD_SLUG}' to Collection ${webflowCollectionId}.`);
            return createdField;
        }
    } catch (error) {
        console.error(`[Webflow Link] Error ensuring Webflow field in Collection ${webflowCollectionId}:`, error.response?.data || error.message);
        return null;
    }
});

/**
 * Updates a specific field on a Webflow item with the Notion Page ID.
 * @param {string} webflowCollectionId - The ID of the Webflow collection.
 * @param {string} webflowItemId - The ID of the Webflow item to update.
 * @param {string} notionPageId - The Notion Page ID to store.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export const updateWebflowItemWithNotionId = webflowLimit(async (webflowCollectionId, webflowItemId, notionPageId) => {
    if (!webflowCollectionId || !webflowItemId || !notionPageId) {
        console.error("[updateWebflowItemWithNotionId] Missing webflowCollectionId, webflowItemId, or notionPageId.");
        return false;
    }
    console.log(`[Webflow Link] Updating Webflow item ${webflowItemId} in Collection ${webflowCollectionId} field '${WEBFLOW_NOTION_ID_FIELD_SLUG}' with Notion ID ${notionPageId}...`);
    const webflow = await getWebflowClient();
    try {
        const fieldsToUpdate = {
            [WEBFLOW_NOTION_ID_FIELD_SLUG]: notionPageId,
             // Important: Specify publishing status. Set to false to save as draft, true to publish.
            // Or omit them if you want patchItem behavior (though patch might not be standard in all SDK versions)
            _archived: false,
            _draft: false, // Set to true if you want to save as draft initially
        };

        // Use updateItem (safer, replaces all fields implicitly)
        // or patchItem if available and preferred (only updates specified fields)
        await webflow.items.updateItem(webflowCollectionId, webflowItemId, { fields: fieldsToUpdate });
        // If using patchItem:
        // await webflow.items.patchItem(webflowCollectionId, webflowItemId, { fields: fieldsToUpdate });

        console.log(`[Webflow Link] Successfully updated Webflow item ${webflowItemId} with Notion ID ${notionPageId}.`);
        return true;
    } catch (error) {
        console.error(`[Webflow Link] Error updating Webflow item ${webflowItemId} with Notion ID:`, error.response?.data || error.message);
        return false;
    }
}); 