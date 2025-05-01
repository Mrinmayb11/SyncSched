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

// Accept token as argument
export async function parent_page_id(notion_access_token) {

    if (!notion_access_token) {
        throw new Error("Notion access token is required for parent_page_id function.");
    }

    // Use the passed token to create the client
    const notion = new Client({
        auth: notion_access_token,
    });

    try {
        const page = await notion.search({
            filter:{
                property:'object',
                value:'page',
            }
        });

        let page_id = null;

        if (page && page.results && page.results.length > 0) {
            page_id = page.results[0].id; 
        } else {
            // Decide how to handle this: throw error? return null? create a page?
            // For now, returning null.
        }
        return page_id;

    } catch (error) {
        console.error('Error searching for Notion parent page:', error);
        throw error;
    }
}