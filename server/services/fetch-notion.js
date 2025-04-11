import { db_client } from '../config/database.js';
import { Client } from '@notionhq/client';


export async function save_access_token(data) {
    try {
        await db_client.query('BEGIN');

        const access_token = data.access_token;
        const workspace_id = data.workspace_id;
        const workspace_name = data.workspace_name;
        const user_id = data.owner.user.id;
        const user_name = data.owner.user.name;
        
        const result = await db_client.query(
            "INSERT INTO notion_auth_info (access_token, workspace_id, workspace_name, user_id, user_name) VALUES ($1, $2, $3, $4, $5) RETURNING access_token",
            [access_token, workspace_id, workspace_name, user_id, user_name]
        );

        const notion_access_token = result.rows[0].access_token;

        await db_client.query('COMMIT');

        return notion_access_token;
        
        
        
    } catch (error) {
        console.error('Error saving Notion auth info:', error);
        await db_client.query('ROLLBACK');
        throw error;
    }
}

// New function to retrieve the token
export async function get_notion_access_token() {
    try {
        // Query for the most recently added token
        const result = await db_client.query(
            "SELECT access_token FROM notion_auth_info ORDER BY created_at DESC LIMIT 1"
        );
        if (result.rows.length > 0) {
            return result.rows[0].access_token;
        } else {
            console.error("No Notion access token found in the database.");
            // Handle appropriately - maybe throw error or return null
            throw new Error("Notion access token not found."); 
        }
    } catch (error) {
        console.error('Error retrieving Notion token from database:', error);
        throw error; // Re-throw
    }
}

// Accept token as argument
export async function parent_page_id(notion_access_token) {

    // Remove internal token fetching:
    // const notion_access_token = await n_access_token(); 

    if (!notion_access_token) {
        throw new Error("Notion access token is required for parent_page_id function.");
    }

    // Use the passed token to create the client
    const notion = new Client({
        auth: notion_access_token,
    });

    try { // Add try...catch for robustness
        const page = await notion.search({
            filter:{
                property:'object',
                value:'page',
            }
        });

        let page_id = null;

        // Check if results exist and log the ID of the first result
        if (page && page.results && page.results.length > 0) {
            // Assuming we want the *first* page found as the parent. 
            // You might need more specific logic here depending on your use case.
            page_id = page.results[0].id; 
        } else {
            console.log("No pages found matching the search criteria to use as parent.");
            // Decide how to handle this: throw error? return null? create a page?
            // For now, returning null.
        }
        return page_id;

    } catch (error) {
        console.error('Error searching for Notion parent page:', error);
        throw error; // Re-throw
    }
}