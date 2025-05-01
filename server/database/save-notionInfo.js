import { supabase } from '../config/supabase.js';

/**
 * Saves the mapping between created Notion databases and Webflow collections to Supabase.
 * Deletes existing entries for the user before inserting new ones.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {Array<object>} createdDatabasesInfo - Array of objects containing info about successfully created Notion DBs.
 *                                            Expected keys per object: notionDbId, notionDbName, webflowCollectionId.
 * @returns {Promise<boolean>} - True if saving was attempted (regardless of success), false if prerequisites not met.
 */

export async function save_access_token(userId, notionOAuthData) {
    if (!supabase) {
      console.error("Supabase client not initialized. Cannot save Notion auth.");
      return null;
    }
    // Check userId FIRST
    if (!userId) { 
      console.error("User ID is required to save Notion auth info.");
      // Throw an error or return a specific failure indicator
      throw new Error("User ID not provided to save_access_token"); 
    }
    // Then check notionOAuthData
    if (!notionOAuthData || typeof notionOAuthData !== 'object' || !notionOAuthData.access_token) { 
        console.error("Invalid or missing Notion OAuth data provided.");
        // Throw an error or return a specific failure indicator
        throw new Error("Invalid Notion OAuth data provided to save_access_token");
    }
  
    try {
        const { 
            access_token, 
            workspace_id, 
            workspace_name, 
        } = notionOAuthData;
  
        // Upsert based on the Supabase userId
        const { data: upsertedData, error: upsertError } = await supabase
            .from('notion_auth_info')
            .upsert({
                user_id: userId, 
                access_token: access_token,
                workspace_id: workspace_id,
                workspace_name: workspace_name

            }, { onConflict: 'user_id' }) // Update if user_id exists
            .select('access_token')
            .single();
  
        if (upsertError) {
            console.error('Error upserting Notion auth info to Supabase:', upsertError);
            throw upsertError;
        }
  
        if (!upsertedData || !upsertedData.access_token) {
            console.error('Failed to retrieve access_token after upsert.');
            throw new Error('Failed to save/update Notion auth info.');
        }
  
        return upsertedData.access_token;
  
    } catch (error) {
        if (!error.message.includes('Supabase')) {
            console.error('Error in save_notion_access_token function:', error);
        }
        // Throw error to indicate failure
        throw error; 
    }
  }




export async function save_notion_db_info(userId, createdDatabasesInfo) {
    if (!supabase) {
        console.error("Supabase client not initialized. Cannot save Notion database mappings.");
        return false;
    }
    if (!userId) {
        console.error("User ID is required to save Notion database mappings.");
        return false;
    }
    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.log("No database info provided to save.");
        return false; // Nothing to save
    }

    try {
        // 1. Delete existing entries for this user
        const { error: deleteError } = await supabase
            .from('notion_database_info')
            .delete()
            .eq('user_id', userId);

        if (deleteError) {
            console.error("Error deleting old Notion database info:", deleteError);
            // Decide whether to proceed or throw based on application needs
            // For now, we'll log and attempt insertion anyway
        }

        // 2. Prepare data for insertion
        const dbInfoToInsert = createdDatabasesInfo.map(db => ({
            user_id: userId,
            database_id: db.notionDbId,
            database_name: db.notionDbName,
            webflow_collection_id: db.webflowCollectionId 
        }));

        // 3. Insert new records
        const { error: insertError } = await supabase
            .from('notion_database_info')
            .insert(dbInfoToInsert);

        if (insertError) {
            console.error("Error saving Notion database info to Supabase:", insertError);
            // Indicate failure occurred during insertion
            return false; 
        } else {
            console.log(`Saved mapping info for ${dbInfoToInsert.length} Notion databases for user ${userId}.`);
            return true; // Indicate successful insertion
        }

    } catch (dbSaveError) {
        console.error("Exception while saving Notion database mappings:", dbSaveError);
        return false; // Indicate failure due to exception
    }
}

// Add other Notion-related database utility functions here in the future 