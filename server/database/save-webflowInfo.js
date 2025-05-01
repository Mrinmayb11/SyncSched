import { supabase } from '../config/supabase.js'; // Import the initialized Supabase client
 
export async function W_Auth_db(userId, token, platform) {
  if (!supabase) {
    console.error("Supabase client not initialized. Cannot save Webflow auth.");
    return null;
  }
  if (!userId) {
    console.error("User ID is required to save Webflow auth info.");
    return null;
  }

  try {
    // Upsert allows inserting or updating if a record for the user already exists
    const { data, error } = await supabase
      .from('cms_auth_info')
      .upsert({ 
        user_id: userId, // Link to the authenticated user
        access_token: token, 
        platform: platform 
      })
      .select('access_token, user_id') // Select the fields to return
      .single(); // Expecting a single record back

    if (error) {
      console.error('Error saving Webflow auth info to Supabase:', error);
      throw error;
    }

    if (!data) {
        console.error('No data returned after saving Webflow auth info.');
        return null;
    }

    // Return the relevant data
    return { access_token: data.access_token, userId: data.user_id };

  } catch (error) {
    // Log the error, but the specific Supabase error is logged above
    console.error('Exception during W_Auth_db:', error.message);
    return null; // Indicate failure
  }
}

export async function W_Collection_db(userId, collections) {
  if (!supabase) {
    console.error("Supabase client not initialized. Cannot save collections.");
    return false;
  }
  if (!userId) {
    console.error("User ID is required to save collections.");
    return false;
  }
  if (!Array.isArray(collections)) {
      console.error("Collections data must be an array.");
      return false;
  }

  try {
    // 1. Delete existing collections for this user
    const { error: deleteError } = await supabase
      .from('cms_collections_info')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting old collections from Supabase:', deleteError);
      throw deleteError;
    }

    // 2. Prepare new collection data for insertion
    if (collections.length > 0) {
        const collectionsToInsert = collections.map(collection => ({
          user_id: userId,
          collection_id: collection.id || collection._id, // Use appropriate ID field
          collection_name: collection.displayName || collection.name // Use appropriate name field
        }));
    
        // 3. Insert new collections
        const { error: insertError } = await supabase
          .from('cms_collections_info')
          .insert(collectionsToInsert);
    
        if (insertError) {
          console.error('Error inserting new collections into Supabase:', insertError);
          throw insertError;
        }
        console.log(`Saved ${collections.length} collections for user ${userId} to Supabase.`);
    } else {
         console.log(`No new collections to save for user ${userId}.`);
    }

    return true; // Indicate success

  } catch (error) {
    console.error('Exception during W_Collection_db:', error.message);
    return false; // Indicate failure
  }
}

export async function getWebflowToken(userId) {

  if (!supabase) {
    console.error("Supabase client not initialized. Cannot get Webflow token.");
    return null;
  }
   if (!userId) {
    console.error("User ID is required to get Webflow token.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('cms_auth_info')
      .select('access_token')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Returns single object or null, doesn't throw error if not found

    if (error) {
      console.error('Error fetching Webflow token from Supabase:', error);
      return null;
    }

    return data ? data.access_token : null; // Return token or null if no record found

  } catch (error) {
      console.error('Exception during getWebflowToken:', error.message);
      return null;
  }
}
