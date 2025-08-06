import { WebflowClient } from "webflow-api";
import { getWebflowToken } from '../database/save-webflowInfo.js';
import { get_field_mappings } from '../database/save-notionInfo.js';
import { NotionInit } from './syncDbProp.js';

/**
 * Creates a minimal Webflow item (just structure, no content)
 * @param {string} userId - The user ID
 * @param {string} webflowAuthId - The Webflow auth ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @param {string} notionPageId - The Notion page ID
 * @returns {Promise<{success: boolean, webflowItemId?: string, error?: string}>}
 */
export async function createMinimalWebflowItem(userId, webflowAuthId, webflowCollectionId, notionPageId, notionPageTitle) {
    try {
        // Get Webflow access token
        const accessToken = await getWebflowToken(userId, webflowAuthId);
        if (!accessToken) {
            return { success: false, error: 'Failed to get Webflow access token' };
        }

        // Initialize Webflow client
        const webflow = new WebflowClient({ accessToken });

        // Create minimal Webflow item with just basic structure
        const createResponse = await webflow.collections.items.createItem(webflowCollectionId, {
            fieldData: {
                name: notionPageTitle,
                slug: notionPageTitle.toLowerCase().replace(/ /g, '-')
            },
            isDraft: true
        });

        if (createResponse && createResponse.id) {
            console.log(`[Webhook Sync] Created minimal Webflow item ${createResponse.id} for Notion page ${notionPageId}`);
            return { success: true, webflowItemId: createResponse.id };
        } else {
            return { success: false, error: 'Failed to create Webflow item - no ID returned' };
        }

    } catch (error) {
        console.error('[Webhook Sync] Error creating minimal Webflow item:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Creates a new item in a Webflow collection from Notion page data
 * @param {string} userId - The user ID
 * @param {string} webflowAuthId - The Webflow auth ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @param {string} notionPageId - The Notion page ID
 * @param {number} siteIntegrationId - The site integration ID
 * @returns {Promise<{success: boolean, webflowItemId?: string, error?: string}>}
 */
export async function createWebflowItemFromNotionPage(userId, webflowAuthId, webflowCollectionId, notionPageId, siteIntegrationId) {
    try {
        // Get Webflow access token
        const accessToken = await getWebflowToken(userId, webflowAuthId);
        if (!accessToken) {
            return { success: false, error: 'Failed to get Webflow access token' };
        }

        // Initialize clients
        const webflow = new WebflowClient({ accessToken });
        const { notion } = await NotionInit(userId);

        // Get the Notion page data
        const notionPage = await notion.pages.retrieve({ page_id: notionPageId });
        if (!notionPage) {
            return { success: false, error: 'Failed to retrieve Notion page' };
        }

        // Get field mappings for this integration
        const fieldMappings = await get_field_mappings(siteIntegrationId, notionPageId.split('-')[0], webflowCollectionId);
        
        // Convert Notion page properties to Webflow field data
        const webflowFieldData = await convertNotionPageToWebflowFields(notionPage, fieldMappings);

        // Create the Webflow item
        const createResponse = await webflow.collections.items.createItem(webflowCollectionId, {
            fieldData: webflowFieldData,
            isDraft: true // Start as draft for safety
        });

        if (createResponse && createResponse.id) {
            console.log(`[Webhook Sync] Created Webflow item ${createResponse.id} from Notion page ${notionPageId}`);
            return { success: true, webflowItemId: createResponse.id };
        } else {
            return { success: false, error: 'Failed to create Webflow item - no ID returned' };
        }

    } catch (error) {
        console.error('[Webhook Sync] Error creating Webflow item from Notion page:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a Webflow item
 * @param {string} userId - The user ID
 * @param {string} webflowAuthId - The Webflow auth ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @param {string} webflowItemId - The Webflow item ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteWebflowItem(userId, webflowAuthId, webflowCollectionId, webflowItemId) {
    try {
        // Get Webflow access token
        const accessToken = await getWebflowToken(userId, webflowAuthId);
        if (!accessToken) {
            return { success: false, error: 'Failed to get Webflow access token' };
        }

        // Initialize Webflow client
        const webflow = new WebflowClient({ accessToken });

        // Delete the Webflow item
        await webflow.collections.items.deleteItem(webflowCollectionId, webflowItemId);

        console.log(`[Webhook Sync] Deleted Webflow item ${webflowItemId} from collection ${webflowCollectionId}`);
        return { success: true };

    } catch (error) {
        console.error('[Webhook Sync] Error deleting Webflow item:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Converts Notion page properties to Webflow field data format
 * @param {object} notionPage - The Notion page object
 * @param {Array} fieldMappings - Array of field mappings between Notion and Webflow
 * @returns {Promise<object>} - Webflow field data object
 */
async function convertNotionPageToWebflowFields(notionPage, fieldMappings) {
    const webflowFieldData = {};
    
    if (!fieldMappings || fieldMappings.length === 0) {
        console.log('[Webhook Sync] No field mappings found, using basic title mapping');
        // Basic fallback - try to map the title
        if (notionPage.properties && notionPage.properties.Name) {
            const titleProp = notionPage.properties.Name;
            if (titleProp.title && titleProp.title.length > 0) {
                webflowFieldData.name = titleProp.title[0].plain_text || '';
            }
        }
        return webflowFieldData;
    }

    // Map each field according to the field mappings
    for (const mapping of fieldMappings) {
        const notionPropName = mapping.notion_property_name;
        const webflowFieldSlug = mapping.webflow_field_slug;
        const notionPropType = mapping.notion_property_type;

        const notionProperty = notionPage.properties[notionPropName];
        if (!notionProperty) continue;

        try {
            let webflowValue = null;

            // Convert based on Notion property type
            switch (notionPropType) {
                case 'title':
                    if (notionProperty.title && notionProperty.title.length > 0) {
                        webflowValue = notionProperty.title[0].plain_text || '';
                    }
                    break;

                case 'rich_text':
                    if (notionProperty.rich_text && notionProperty.rich_text.length > 0) {
                        webflowValue = notionProperty.rich_text.map(text => text.plain_text).join('');
                    }
                    break;

                case 'number':
                    webflowValue = notionProperty.number;
                    break;

                case 'select':
                    if (notionProperty.select) {
                        webflowValue = notionProperty.select.name;
                    }
                    break;

                case 'multi_select':
                    if (notionProperty.multi_select && notionProperty.multi_select.length > 0) {
                        webflowValue = notionProperty.multi_select.map(option => option.name);
                    }
                    break;

                case 'date':
                    if (notionProperty.date) {
                        webflowValue = notionProperty.date.start;
                    }
                    break;

                case 'checkbox':
                    webflowValue = notionProperty.checkbox;
                    break;

                case 'url':
                    webflowValue = notionProperty.url;
                    break;

                case 'email':
                    webflowValue = notionProperty.email;
                    break;

                case 'phone_number':
                    webflowValue = notionProperty.phone_number;
                    break;

                default:
                    console.log(`[Webhook Sync] Unsupported property type: ${notionPropType} for field ${notionPropName}`);
                    break;
            }

            if (webflowValue !== null && webflowValue !== undefined) {
                webflowFieldData[webflowFieldSlug] = webflowValue;
            }

        } catch (fieldError) {
            console.error(`[Webhook Sync] Error converting field ${notionPropName}:`, fieldError);
        }
    }

    return webflowFieldData;
}

/**
 * Updates an existing Webflow item from Notion page data
 * @param {string} userId - The user ID
 * @param {string} webflowAuthId - The Webflow auth ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @param {string} webflowItemId - The Webflow item ID
 * @param {string} notionPageId - The Notion page ID
 * @param {number} siteIntegrationId - The site integration ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateWebflowItemFromNotionPage(userId, webflowAuthId, webflowCollectionId, webflowItemId, notionPageId, siteIntegrationId) {
    try {
        // Get Webflow access token
        const accessToken = await getWebflowToken(userId, webflowAuthId);
        if (!accessToken) {
            return { success: false, error: 'Failed to get Webflow access token' };
        }

        // Initialize clients
        const webflow = new WebflowClient({ accessToken });
        const { notion } = await NotionInit(userId);

        // Get the Notion page data
        const notionPage = await notion.pages.retrieve({ page_id: notionPageId });
        if (!notionPage) {
            return { success: false, error: 'Failed to retrieve Notion page' };
        }

        // Get field mappings for this integration
        const fieldMappings = await get_field_mappings(siteIntegrationId, notionPageId.split('-')[0], webflowCollectionId);
        
        // Convert Notion page properties to Webflow field data
        const webflowFieldData = await convertNotionPageToWebflowFields(notionPage, fieldMappings);

        // Update the Webflow item
        await webflow.collections.items.updateItem(webflowCollectionId, webflowItemId, {
            fieldData: webflowFieldData
        });

        console.log(`[Webhook Sync] Updated Webflow item ${webflowItemId} from Notion page ${notionPageId}`);
        return { success: true };

    } catch (error) {
        console.error('[Webhook Sync] Error updating Webflow item from Notion page:', error);
        return { success: false, error: error.message };
    }
} 