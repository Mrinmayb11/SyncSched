import { supabase } from '../config/supabase.js';
import { Client } from '@notionhq/client';

/**
 * Saves Notion OAuth data to the database, associating it with a Supabase user.
 * @param {string} userId - The Supabase authenticated user ID (auth.users.id).
 * @param {object} notionOAuthData - The data object received from Notion OAuth callback.
 *                                    Expected keys: access_token, workspace_id, workspace_name, owner.user.id, owner.user.name
 * @returns {Promise<string | null>} - The saved access token or null on error.
 *

/**
 * Retrieves the latest Notion access token for a specific Supabase user.
 * @param {string} userId - The Supabase authenticated user ID.
 * @returns {Promise<string | null>} - The access token or null if not found/error.
 */
export async function get_notion_access_token(userId) {
  if (!supabase) {
    console.error("Supabase client not initialized. Cannot get Notion token.");
    return null;
  }
  if (!userId) {
    console.error("User ID is required to get Notion token.");
    return null;
  }

  try {
      const { data, error } = await supabase
          .from('notion_auth_info')
          .select('access_token')
          .eq('user_id', userId) // Filter by Supabase user ID
          .limit(1)
          .maybeSingle(); // Use maybeSingle to return null if not found

      if (error) {
          console.error('Error retrieving Notion token from Supabase:', error);
          return null; // Return null on error
      }

      if (data && data.access_token) {
          return data.access_token;
      } else {
          // console.warn(`No Notion access token found in Supabase for user ${userId}.`);
          return null; // Return null if not found
      }
  } catch (error) {
       console.error('Exception in get_notion_access_token function:', error);
       return null; // Return null on exception
  }
}