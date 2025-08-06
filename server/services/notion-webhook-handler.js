import { 
    get_item_mapping_by_notion_page_id, 
    get_collection_mapping_by_notion_db_id,
    delete_item_mapping_by_notion_page_id,
    save_item_mapping
} from '../database/save-notionInfo.js';
import { 
    createMinimalWebflowItem,
    createWebflowItemFromNotionPage, 
    deleteWebflowItem, 
    updateWebflowItemFromNotionPage 
} from './webflow-sync.js';
import { NotionInit } from './syncDbProp.js';
import { supabase } from '../config/supabase.js';

/**
 * Handles Notion page creation webhook event
 * Creates a minimal Webflow item without content - content sync happens on page.updated
 * @param {object} webhookData - The webhook event data
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function handleNotionPageCreated(webhookData) {
    try {
        console.log('[Notion Webhook] Processing page.created event');
        
        const notionPageId = webhookData.data?.id;
        const notionDatabaseId = webhookData.data?.parent?.database_id;
        const notionPageTitle = webhookData.data?.properties?.title[0]?.plain_text;
        
        if (!notionPageId || !notionDatabaseId) {
            return { success: false, message: 'Missing page ID or database ID in webhook data' };
        }

        console.log(`[Notion Webhook] Page created: ${notionPageId} in database: ${notionDatabaseId}`);
        
        // Find the integration and collection mapping for this database
        const result = await findIntegrationForNotionDatabase(notionDatabaseId);
        if (!result.success) {
            return { success: false, message: result.message };
        }

        const { integration, collectionMapping } = result;

        // Create minimal Webflow item (just structure, no content)
        const createResult = await createMinimalWebflowItem(
            integration.user_id,
            integration.webflow_auth_id,
            collectionMapping.webflow_collection_id,
            notionPageId,
            notionPageTitle
        );

        if (!createResult.success) {
            return { 
                success: false, 
                message: 'Failed to create Webflow item', 
                error: createResult.error 
            };
        }

        // Save the new mapping
        const mappingResult = await save_item_mapping(
            integration.id,
            createResult.webflowItemId,
            notionPageId,
            'notion_to_webflow'
        );

        if (!mappingResult) {
            // Try to clean up the created Webflow item if mapping fails
            await deleteWebflowItem(
                integration.user_id,
                integration.webflow_auth_id,
                collectionMapping.webflow_collection_id,
                createResult.webflowItemId
            );
            return { success: false, message: 'Failed to save item mapping' };
        }

        console.log(`[Notion Webhook] Successfully created minimal Webflow item ${createResult.webflowItemId} for Notion page ${notionPageId}`);
        
        return { 
            success: true, 
            message: `Successfully created minimal Webflow item ${createResult.webflowItemId}. Content will sync on first page update.`,
            webflowItemId: createResult.webflowItemId
        };

    } catch (error) {
        console.error('[Notion Webhook] Error handling page.created event:', error);
        return { success: false, message: 'Internal error processing webhook', error: error.message };
    }
}

/**
 * Handles Notion page deletion webhook event
 * @param {object} webhookData - The webhook event data
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function handleNotionPageDeleted(webhookData) {
    try {
        console.log('[Notion Webhook] Processing page.deleted event');
        
        const notionPageId = webhookData.data?.id;
        
        if (!notionPageId) {
            return { success: false, message: 'Missing page ID in webhook data' };
        }

        console.log(`[Notion Webhook] Page deleted: ${notionPageId}`);

        // Find the existing mapping for this page
        const mapping = await get_item_mapping_by_notion_page_id(notionPageId);
        if (!mapping) {
            console.log(`[Notion Webhook] No mapping found for deleted page ${notionPageId}, nothing to do`);
            return { success: true, message: 'No mapping found, no action needed' };
        }

        const integration = mapping.site_integrations;
        const webflowItemId = mapping.webflow_item_id;

        // Find the collection mapping to get the collection ID
        const collectionMapping = await findCollectionMappingForIntegration(integration.id, notionPageId);
        if (!collectionMapping) {
            console.log(`[Notion Webhook] No collection mapping found for page ${notionPageId}`);
            // Still delete the item mapping even if we can't find collection mapping
            await delete_item_mapping_by_notion_page_id(notionPageId);
            return { success: false, message: 'Collection mapping not found, cleaned up item mapping' };
        }

        // Delete the Webflow item
        const deleteResult = await deleteWebflowItem(
            integration.user_id,
            integration.webflow_auth_id,
            collectionMapping.webflow_collection_id,
            webflowItemId
        );

        if (!deleteResult.success) {
            console.error(`[Notion Webhook] Failed to delete Webflow item ${webflowItemId}:`, deleteResult.error);
            // Don't return error here - we'll still clean up the mapping
        }

        // Delete the mapping regardless of Webflow deletion success
        const mappingDeleted = await delete_item_mapping_by_notion_page_id(notionPageId);
        
        if (deleteResult.success && mappingDeleted) {
            console.log(`[Notion Webhook] Successfully deleted Webflow item ${webflowItemId} and mapping for Notion page ${notionPageId}`);
            return { 
                success: true, 
                message: `Successfully deleted Webflow item ${webflowItemId} and mapping`
            };
        } else if (mappingDeleted) {
            return { 
                success: true, 
                message: 'Mapping deleted, but Webflow item deletion may have failed'
            };
        } else {
            return { 
                success: false, 
                message: 'Failed to delete mapping'
            };
        }

    } catch (error) {
        console.error('[Notion Webhook] Error handling page.deleted event:', error);
        return { success: false, message: 'Internal error processing webhook', error: error.message };
    }
}

/**
 * Handles Notion page update webhook event
 * @param {object} webhookData - The webhook event data
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function handleNotionPageUpdated(webhookData) {
    try {
        console.log('[Notion Webhook] Processing page.updated event');
        
        const notionPageId = webhookData.data?.id;
        
        if (!notionPageId) {
            return { success: false, message: 'Missing page ID in webhook data' };
        }

        console.log(`[Notion Webhook] Page updated: ${notionPageId}`);

        // Find the existing mapping for this page
        const mapping = await get_item_mapping_by_notion_page_id(notionPageId);
        if (!mapping) {
            console.log(`[Notion Webhook] No mapping found for updated page ${notionPageId}, ignoring`);
            return { success: true, message: 'No mapping found, no sync needed' };
        }

        const integration = mapping.site_integrations;
        const webflowItemId = mapping.webflow_item_id;

        // Find the collection mapping to get the collection ID
        const collectionMapping = await findCollectionMappingForIntegration(integration.id, notionPageId);
        if (!collectionMapping) {
            return { success: false, message: 'Collection mapping not found' };
        }

        // Update the Webflow item
        const updateResult = await updateWebflowItemFromNotionPage(
            integration.user_id,
            integration.webflow_auth_id,
            collectionMapping.webflow_collection_id,
            webflowItemId,
            notionPageId,
            integration.id
        );

        if (!updateResult.success) {
            return { 
                success: false, 
                message: 'Failed to update Webflow item', 
                error: updateResult.error 
            };
        }

        console.log(`[Notion Webhook] Successfully updated Webflow item ${webflowItemId} for Notion page ${notionPageId}`);
        
        return { 
            success: true, 
            message: `Successfully updated Webflow item ${webflowItemId}`
        };

    } catch (error) {
        console.error('[Notion Webhook] Error handling page.updated event:', error);
        return { success: false, message: 'Internal error processing webhook', error: error.message };
    }
}

/**
 * Finds the integration and collection mapping for a given Notion database
 * @param {string} notionDatabaseId - The Notion database ID
 * @returns {Promise<{success: boolean, integration?: object, collectionMapping?: object, message?: string}>}
 */
async function findIntegrationForNotionDatabase(notionDatabaseId) {
    try {
        // Query to find active integrations that have mappings for this database
        const { data: mappings, error } = await supabase
            .from('collection_sync_mappings')
            .select(`
                *,
                site_integrations!inner(
                    id,
                    user_id,
                    webflow_auth_id,
                    webflow_site_id,
                    notion_auth_id,
                    status
                )
            `)
            .eq('notion_database_id', notionDatabaseId)
            .eq('is_active', true)
            .eq('site_integrations.status', 'active');

        if (error) {
            console.error('[Notion Webhook] Database query error:', error);
            return { success: false, message: 'Database query failed' };
        }

        if (!mappings || mappings.length === 0) {
            return { success: false, message: 'No active integration found for this database' };
        }

        // Use the first matching integration (there should typically only be one)
        const mapping = mappings[0];
        
        return {
            success: true,
            integration: mapping.site_integrations,
            collectionMapping: mapping
        };

    } catch (error) {
        console.error('[Notion Webhook] Error finding integration:', error);
        return { success: false, message: 'Error finding integration' };
    }
}

/**
 * Finds collection mapping for an integration by finding which database the notion page belongs to
 * @param {number} integrationId - The integration ID
 * @param {string} notionPageId - The Notion page ID
 * @returns {Promise<object|null>} - The collection mapping or null
 */
async function findCollectionMappingForIntegration(integrationId, notionPageId) {
    try {
        // We need to get the page to find which database it belongs to
        // This requires getting the user and initializing Notion client
        // For now, let's get it from the integration data
        const { data: integration, error: integrationError } = await supabase
            .from('site_integrations')
            .select(`
                user_id,
                notion_auth_id
            `)
            .eq('id', integrationId)
            .single();

        if (integrationError || !integration) {
            console.error('[Notion Webhook] Failed to get integration:', integrationError);
            return null;
        }

        // Initialize Notion client to get page details
        const { notion } = await NotionInit(integration.user_id);
        const page = await notion.pages.retrieve({ page_id: notionPageId });
        
        if (!page || !page.parent || !page.parent.database_id) {
            console.error('[Notion Webhook] Could not get database ID from page');
            return null;
        }

        const databaseId = page.parent.database_id;

        // Now get the collection mapping
        const collectionMapping = await get_collection_mapping_by_notion_db_id(integrationId, databaseId);
        return collectionMapping;

    } catch (error) {
        console.error('[Notion Webhook] Error finding collection mapping:', error);
        return null;
    }
} 