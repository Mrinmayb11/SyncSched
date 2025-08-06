import { supabase } from '../config/supabase.js';

/**
 * Saves a new Notion authentication token to the database.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {object} notionOAuthData - The raw OAuth data returned from Notion.
 * @returns {Promise<object|null>} - The newly saved auth record, including its ID.
 */
export async function save_notion_access_token(userId, notionOAuthData) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId) throw new Error("User ID is required to save Notion auth info.");
    if (!notionOAuthData || !notionOAuthData.access_token) throw new Error("Invalid Notion OAuth data provided.");
  
    try {
        const { access_token, workspace_id, workspace_name, authorized_page_id } = notionOAuthData;
        const { data, error } = await supabase
            .from('notion_auth_info')
            .upsert({ 
                user_id: userId, 
                access_token, 
                workspace_id, 
                workspace_name,
                authorized_page_id: authorized_page_id
            }, {
                onConflict: 'user_id'
            })
            .select()
            .single();
  
        if (error) throw error;
        if (!data) throw new Error('Failed to save Notion auth info.');
  
        return data;
    } catch (error) {
        console.error('Error in save_notion_access_token:', error.message);
        return null;
    }
}

/**
 * Creates a new site integration record, linking a Webflow site to a Notion page.
 * @param {object} integrationData - The data for the new integration.
 * @returns {Promise<object|null>} - The newly created integration record.
 */
export async function create_site_integration(integrationData) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    
    const requiredKeys = ['user_id', 'webflow_auth_id', 'webflow_site_id', 'notion_auth_id'];
    for (const key of requiredKeys) {
        if (!integrationData[key]) throw new Error(`Missing required field for integration: ${key}`);
    }

    try {
        const { data, error } = await supabase
            .from('site_integrations')
            .insert(integrationData)
            .select()
            .single();

        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('Error in create_site_integration:', error.message);
        return null;
    }
}

/**
 * Saves a batch of collection-to-database sync mappings for a given site integration.
 * This will first delete all existing mappings for the integration.
 * @param {number} integrationId - The ID of the site_integration.
 * @param {Array<object>} mappings - An array of mapping objects to save.
 * @returns {Promise<boolean>} - True on success, false on failure.
 */
export async function save_collection_mappings(integrationId, mappings) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!integrationId) throw new Error("Integration ID is required.");

    try {
        // Step 1: Delete all existing mappings for this integration ID.
        const { error: deleteError } = await supabase
            .from('collection_sync_mappings')
            .delete()
            .eq('site_integration_id', integrationId);

        if (deleteError) {
            console.error(`Failed to delete old mappings for integration ${integrationId}:`, deleteError);
            throw deleteError;
        }

        // Step 2: If new mappings are provided, insert them.
        if (mappings && mappings.length > 0) {
            // Make sure each mapping has the integration ID attached.
            const mappingsToInsert = mappings.map(m => ({ ...m, site_integration_id: integrationId }));

            const { error: insertError } = await supabase
                .from('collection_sync_mappings')
                .insert(mappingsToInsert);

            if (insertError) throw insertError;
        }

        return true;
    } catch (error) {
        console.error('Error in save_collection_mappings:', error.message);
        return false;
    }
}

/**
 * Retrieves all site integrations and their associated collection mappings for a user.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @returns {Promise<Array<object>|null>} - An array of integration objects, or null on error.
 */
export async function get_all_user_integrations(userId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId) throw new Error("User ID is required.");

    try {
        // This RPC function would be the most efficient way to get all the data in one go.
        // It needs to be created in the database via a migration.
        const { data, error } = await supabase.rpc('get_integrations_with_mappings', { p_user_id: userId });

        if (error) throw error;
        
        // The RPC function should be designed to return data in a clean, nested format.
        // If it returns flat data, we'd need to group it here in the backend.
        return data;
    } catch (error) {
        console.error('Error in get_all_user_integrations:', error.message);
        return null;
    }
}

/**
 * Retrieves all Notion authentication records for a specific user.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @returns {Promise<Array<object>|null>} - An array of notion_auth_info objects.
 */
export async function get_all_notion_auth(userId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId) throw new Error("User ID is required.");

    try {
        const { data, error } = await supabase
            .from('notion_auth_info')
            .select('id, access_token, workspace_name')
            .eq('user_id', userId);

        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('Error in get_all_notion_auth:', error.message);
        return null;
    }
}

/**
 * Retrieves a single site integration by its ID, for a specific user.
 * @param {string} userId - The ID of the user.
 * @param {number} integrationId - The ID of the site_integrations record.
 * @returns {Promise<object|null>}
 */
export async function get_integration_by_id(userId, integrationId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId || !integrationId) throw new Error("User ID and Integration ID are required.");

    try {
        const { data, error } = await supabase
            .from('site_integrations')
            .select('*')
            .eq('user_id', userId)
            .eq('id', integrationId)
            .single();

        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('Error in get_integration_by_id:', error.message);
        return null;
    }
}

/**
 * Retrieves a single Notion access token for a specific auth record.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {number} authId - The ID of the notion_auth_info record.
 * @returns {Promise<string|null>} - The access token, or null on error/not found.
 */
export async function get_notion_access_token(userId, authId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId || !authId) throw new Error("User ID and Auth ID are required.");

    try {
        const { data, error } = await supabase
            .from('notion_auth_info')
            .select('access_token')
            .eq('user_id', userId)
            .eq('id', authId)
            .single();

        if (error) throw error;
        
        return data ? data.access_token : null;
    } catch (error) {
        console.error('Error in get_notion_access_token:', error.message);
        return null;
    }
}

/**
 * Retrieves a single Notion authentication record by its ID.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {number} authId - The ID of the notion_auth_info record.
 * @returns {Promise<object|null>} - A notion_auth_info object.
 */
export async function get_notion_auth_by_id(userId, authId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!userId || !authId) throw new Error("User ID and Auth ID are required.");

    try {
        const { data, error } = await supabase
            .from('notion_auth_info')
            .select('*')
            .eq('user_id', userId)
            .eq('id', authId)
            .single();

        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('Error in get_notion_auth_by_id:', error.message);
        return null;
    }
} 

/**
 * Saves or updates an item mapping between a Webflow item and Notion page
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} webflowItemId - The Webflow item ID
 * @param {string} notionPageId - The Notion page ID
 * @param {string} syncDirection - The sync direction ('webflow_to_notion' or 'notion_to_webflow')
 * @returns {Promise<object|null>} - The saved mapping or null on failure
 */
export async function save_item_mapping(siteIntegrationId, webflowItemId, notionPageId, syncDirection = 'webflow_to_notion') {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !webflowItemId || !notionPageId) {
        throw new Error("Site integration ID, Webflow item ID, and Notion page ID are required.");
    }

    try {
        const { data, error } = await supabase
            .from('item_mappings')
            .upsert({
                site_integration_id: siteIntegrationId,
                webflow_item_id: webflowItemId,
                notion_page_id: notionPageId,
                last_synced_at: new Date().toISOString(),
                last_sync_direction: syncDirection
            }, {
                onConflict: 'webflow_item_id',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving item mapping:', error);
            return null;
        }

        console.log(`[Item Mapping] Saved mapping: WF Item ${webflowItemId} → Notion Page ${notionPageId}`);
        return data;
    } catch (error) {
        console.error('Error saving item mapping:', error.message);
        return null;
    }
}

/**
 * Gets an existing item mapping for a Webflow item
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} webflowItemId - The Webflow item ID
 * @returns {Promise<object|null>} - The existing mapping or null if not found
 */
export async function get_item_mapping(siteIntegrationId, webflowItemId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !webflowItemId) {
        throw new Error("Site integration ID and Webflow item ID are required.");
    }

    try {
        const { data, error } = await supabase
            .from('item_mappings')
            .select('*')
            .eq('site_integration_id', siteIntegrationId)
            .eq('webflow_item_id', webflowItemId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error getting item mapping:', error.message);
        return null;
    }
}

/**
 * Gets all item mappings for a site integration
 * @param {number} siteIntegrationId - The site integration ID
 * @returns {Promise<Array<object>>} - Array of mappings or empty array
 */
export async function get_all_item_mappings(siteIntegrationId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId) {
        throw new Error("Site integration ID is required.");
    }

    try {
        const { data, error } = await supabase
            .from('item_mappings')
            .select('*')
            .eq('site_integration_id', siteIntegrationId);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting all item mappings:', error.message);
        return [];
    }
}

/**
 * Updates the last synced timestamp for an item mapping
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} webflowItemId - The Webflow item ID
 * @param {string} syncDirection - The sync direction
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function update_item_mapping_sync_time(siteIntegrationId, webflowItemId, syncDirection = 'webflow_to_notion') {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !webflowItemId) {
        throw new Error("Site integration ID and Webflow item ID are required.");
    }

    try {
        const { error } = await supabase
            .from('item_mappings')
            .update({
                last_synced_at: new Date().toISOString(),
                last_sync_direction: syncDirection
            })
            .eq('site_integration_id', siteIntegrationId)
            .eq('webflow_item_id', webflowItemId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating item mapping sync time:', error.message);
        return false;
    }
}

/**
 * Deletes item mappings for items that no longer exist
 * @param {number} siteIntegrationId - The site integration ID
 * @param {Array<string>} currentWebflowItemIds - Array of current Webflow item IDs
 * @returns {Promise<number>} - Number of deleted mappings
 */
export async function cleanup_deleted_item_mappings(siteIntegrationId, currentWebflowItemIds) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId) {
        throw new Error("Site integration ID is required.");
    }

    try {
        const { data, error } = await supabase
            .from('item_mappings')
            .delete()
            .eq('site_integration_id', siteIntegrationId)
            .not('webflow_item_id', 'in', `(${currentWebflowItemIds.map(id => `"${id}"`).join(',')})`)
            .select('id');

        if (error) throw error;
        const deletedCount = data ? data.length : 0;
        console.log(`Cleaned up ${deletedCount} deleted item mappings for integration ${siteIntegrationId}`);
        return deletedCount;
    } catch (error) {
        console.error('Error cleaning up deleted item mappings:', error.message);
        return 0;
    }
} 

/**
 * Reconciles existing synced items by finding Notion pages with Webflow IDs that don't have mappings
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} notionDatabaseId - The Notion database ID to search
 * @param {string} userId - The user ID for Notion authentication
 * @returns {Promise<number>} - Number of mappings created
 */
export async function reconcile_existing_synced_items(siteIntegrationId, notionDatabaseId, userId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    
    try {
        // This would require importing Notion client here or passing notion instance
        // For now, returning 0 - this can be implemented later if needed
        console.log(`[Reconciliation] Reconciliation for integration ${siteIntegrationId} would be implemented here`);
        return 0;
    } catch (error) {
        console.error('Error reconciling existing synced items:', error.message);
        return 0;
    }
} 

/**
 * Saves field mappings between Webflow fields and Notion properties for a specific database
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} notionDatabaseId - The Notion database ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @param {Array<object>} fieldMappings - Array of field mapping objects
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function save_field_mappings(siteIntegrationId, notionDatabaseId, webflowCollectionId, fieldMappings) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !notionDatabaseId || !webflowCollectionId || !fieldMappings) {
        throw new Error("All parameters are required for saving field mappings.");
    }

    try {
        // First, delete ALL existing field mappings for this specific database
        // This handles the unique constraint on (site_integration_id, notion_database_id, notion_property_id)
        const { error: deleteError } = await supabase
            .from('field_mappings')
            .delete()
            .eq('site_integration_id', siteIntegrationId)
            .eq('notion_database_id', notionDatabaseId);

        if (deleteError) {
            console.error('Error deleting existing field mappings:', deleteError);
            throw deleteError;
        }

        // Prepare mappings for insertion
        const mappingsToInsert = fieldMappings.map(mapping => ({
            site_integration_id: siteIntegrationId,
            notion_database_id: notionDatabaseId,
            webflow_collection_id: webflowCollectionId,
            notion_property_id: mapping.notion_property_id,
            notion_property_name: mapping.notion_property_name,
            notion_property_type: mapping.notion_property_type,
            webflow_field_slug: mapping.webflow_field_slug,
            webflow_field_name: mapping.webflow_field_name,
            webflow_field_type: mapping.webflow_field_type,
            webflow_field_id: mapping.webflow_field_id || null
        }));

        // Insert new field mappings
        const { error: insertError } = await supabase
            .from('field_mappings')
            .insert(mappingsToInsert);

        if (insertError) {
            console.error('Error inserting field mappings:', insertError);
            throw insertError;
        }

        console.log(`[Field Mapping] Saved ${mappingsToInsert.length} field mappings for ${webflowCollectionId} → ${notionDatabaseId}`);
        return true;
    } catch (error) {
        console.error('Error saving field mappings:', error.message);
        return false;
    }
}

/**
 * Gets all field mappings for a specific integration and database combination
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} notionDatabaseId - The Notion database ID
 * @param {string} webflowCollectionId - The Webflow collection ID
 * @returns {Promise<Array<object>|null>} - Array of field mappings or null on error
 */
export async function get_field_mappings(siteIntegrationId, notionDatabaseId, webflowCollectionId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !notionDatabaseId || !webflowCollectionId) {
        throw new Error("Site integration ID, Notion database ID, and Webflow collection ID are required.");
    }

    try {
        const { data, error } = await supabase
            .from('field_mappings')
            .select('*')
            .eq('site_integration_id', siteIntegrationId)
            .eq('notion_database_id', notionDatabaseId)
            .eq('webflow_collection_id', webflowCollectionId);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting field mappings:', error.message);
        return null;
    }
}

/**
 * Gets all field mappings for a specific site integration
 * @param {number} siteIntegrationId - The site integration ID
 * @returns {Promise<Array<object>|null>} - Array of field mappings or null on error
 */
export async function get_all_field_mappings(siteIntegrationId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId) {
        throw new Error("Site integration ID is required.");
    }

    try {
        const { data, error } = await supabase
            .from('field_mappings')
            .select('*')
            .eq('site_integration_id', siteIntegrationId);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting all field mappings:', error.message);
        return null;
    }
} 

/**
 * Gets an existing item mapping for a Notion page
 * @param {string} notionPageId - The Notion page ID
 * @returns {Promise<object|null>} - The existing mapping or null if not found
 */
export async function get_item_mapping_by_notion_page_id(notionPageId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!notionPageId) {
        throw new Error("Notion page ID is required.");
    }

    try {
        const { data, error } = await supabase
            .from('item_mappings')
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
            .eq('notion_page_id', notionPageId)
            .eq('site_integrations.status', 'active')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error getting item mapping by notion page ID:', error.message);
        return null;
    }
}

/**
 * Gets collection mapping information for a site integration
 * @param {number} siteIntegrationId - The site integration ID
 * @param {string} notionDatabaseId - The Notion database ID
 * @returns {Promise<object|null>} - The collection mapping or null if not found
 */
export async function get_collection_mapping_by_notion_db_id(siteIntegrationId, notionDatabaseId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!siteIntegrationId || !notionDatabaseId) {
        throw new Error("Site integration ID and Notion database ID are required.");
    }

    try {
        const { data, error } = await supabase
            .from('collection_sync_mappings')
            .select('*')
            .eq('site_integration_id', siteIntegrationId)
            .eq('notion_database_id', notionDatabaseId)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error getting collection mapping by notion database ID:', error.message);
        return null;
    }
}

/**
 * Deletes an item mapping
 * @param {string} notionPageId - The Notion page ID
 * @returns {Promise<boolean>} - True on success, false on failure
 */
export async function delete_item_mapping_by_notion_page_id(notionPageId) {
    if (!supabase) throw new Error("Supabase client not initialized.");
    if (!notionPageId) {
        throw new Error("Notion page ID is required.");
    }

    try {
        const { error } = await supabase
            .from('item_mappings')
            .delete()
            .eq('notion_page_id', notionPageId);

        if (error) {
            console.error('Error deleting item mapping:', error);
            return false;
        }

        console.log(`[Item Mapping] Deleted mapping for Notion page ${notionPageId}`);
        return true;
    } catch (error) {
        console.error('Error deleting item mapping:', error.message);
        return false;
    }
} 