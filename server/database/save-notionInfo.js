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
        const { access_token, workspace_id, workspace_name } = notionOAuthData;
        const { data, error } = await supabase
            .from('notion_auth_info')
            .insert({ user_id: userId, access_token, workspace_id, workspace_name })
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
    
    const requiredKeys = ['user_id', 'webflow_auth_id', 'webflow_site_id', 'notion_auth_id', 'notion_page_id'];
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