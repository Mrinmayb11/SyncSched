import { db_client } from "../config/database.js";

let cachedToken = null;
let userId = null;
let tokenTimeoutId = null;

// Function to clear the token
function clearCachedToken() {
  console.log('Clearing cached token');
  cachedToken = null;
  tokenTimeoutId = null;
}

// Function to clear the token after 10 seconds
function clearTokenAfterTimeout() {
  // Clear any existing timeout
  if (tokenTimeoutId) {
    clearTimeout(tokenTimeoutId);
  }
  
  // Set new timeout to clear token after 10 seconds
  tokenTimeoutId = setTimeout(() => {
    console.log('Token cache timeout reached - clearing cached token');
    clearCachedToken();
  }, 10000); // 10 seconds
}

export  async function W_Auth_db(token, platform) {
  try {
    await db_client.query('BEGIN');
    
    // Insert user with access_token and platform in one operation
    const result = await db_client.query(
      "INSERT INTO cms_users (access_token, cms_platforms) VALUES ($1, $2) RETURNING id , access_token",
      [token, platform]
    );
    
    userId = result.rows[0].id;
    
    await db_client.query('COMMIT');
    
    // Update cache with token and userId
    cachedToken = token;

    
    
    // Start the timeout to clear token
    clearTokenAfterTimeout();

    const access_token = result.rows[0].access_token;

    return { access_token, userId };
    
    
  } catch (error) {
    await db_client.query('ROLLBACK');
    throw error;
  }
}

export async function W_Collection_db(collections) {
  if (!userId) {
    throw new Error("No user ID available. User must authenticate first.");
  }
  
  try {
    await db_client.query('BEGIN');
    
    // Delete any existing collections for this user
    await db_client.query("DELETE FROM user_collections WHERE user_id = $1", [userId]);
    
    // Insert each collection with reference to the user
    for (const collection of collections) {
      await db_client.query(
        "INSERT INTO user_collections (user_id, collection_id, collection_name) VALUES ($1, $2, $3)",
        [userId, collection.id || collection._id, collection.displayName || collection.name]
      );
    }
    
    await client.query('COMMIT');
    
    // Clear cached token after collections are saved
    clearCachedToken();
    
    console.log(`Saved ${collections.length} collections for user ${userId}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error saving collections:", error);
    throw error;
  }
}

export async function getWebflowToken() {
  // Use cached token if available
  if (cachedToken) {
    // Reset the token timeout whenever it's accessed
    clearTokenAfterTimeout();
    return cachedToken;
  }
  throw new Error("No token found");
}
