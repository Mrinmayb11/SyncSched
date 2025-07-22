import { supabase } from '../config/supabase.js'; // Import the initialized Supabase client
import 'dotenv/config';
 
export async function W_Auth_db(userId, accessToken, platform, siteInfo) {
  if (!supabase) {
    console.error("Supabase client not initialized. Cannot save Webflow auth.");
    return null;
  }
  if (!userId) {
    throw new Error('User ID is required to save Webflow auth info.');
  }
  if (!accessToken) {
    throw new Error('Access token is required to save Webflow auth info.');
  }
  if (!siteInfo || !siteInfo.id || !siteInfo.name) {
    throw new Error('Site info (id and name) is required to save Webflow auth info.');
  }

  try {
    // Use upsert to handle both new sites and updates to existing sites
    const { data, error } = await supabase
      .from('cms_auth_info')
      .upsert({ 
        user_id: userId,
        platform: platform || 'webflow',
        access_token: accessToken,
        site_id: siteInfo.id,
        site_name: siteInfo.name,
      }, { 
        onConflict: 'user_id,site_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving Webflow info to Supabase:', error);
      throw error;
    }

    console.log('Successfully saved/updated Webflow auth and site info for user:', userId, 'site:', siteInfo.name);
    return data;
  } catch (err) {
    console.error('An exception occurred in W_Auth_db:', err);
    throw new Error('Failed to save Webflow authentication details in W_Auth_db.');
  }
}

/**
 * Retrieves all Webflow authentication records for a specific user.
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @returns {Promise<Array<object>|null>} - An array of cms_auth_info objects.
 */
export async function get_all_webflow_auth(userId) {
  if (!supabase) throw new Error("Supabase client not initialized.");
  if (!userId) {
    console.error("User ID is required to get Webflow auth info.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('cms_auth_info')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'webflow')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching Webflow auth info from Supabase:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error in get_all_webflow_auth:', error.message);
    return null;
  }
}

export async function getWebflowToken(userId, authId = null) {
  if (!supabase) {
    console.error("Supabase client not initialized. Cannot get Webflow token.");
    return null;
  }
  
  if (!userId) {
    console.error("User ID is required to get Webflow token.");
    return null;
  }

  try {
    let query = supabase
      .from('cms_auth_info')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'webflow');

    if (authId) {
      // If authId is provided, get that specific auth record
      query = query.eq('id', authId).maybeSingle();
    } else {
      // If no authId provided, get the most recent one for backward compatibility
      query = query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      console.log(`No authId provided for user ${userId}, using most recent Webflow auth record`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching Webflow token from Supabase:', error);
      return null;
    }

    return data ? data.access_token : null;

  } catch (error) {
      console.error('Exception during getWebflowToken:', error.message);
      return null;
  }
}
