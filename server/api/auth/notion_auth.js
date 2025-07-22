// Libraries
import express from 'express'; 
import axios from 'axios';
import 'dotenv/config';
import { save_notion_access_token } from '../../database/save-notionInfo.js';
import { requireAuth } from '../../config/supabase.js'; 


const router = express.Router();

router.post('/api/notion/complete-auth', requireAuth, async (req, res) => {
    // Get userId from the authenticated request (verified by requireAuth)
    const userId = req.user?.id;
    if (!userId) {
        // Should not happen if requireAuth works, but good practice
        console.error('User ID missing after auth in POST /api/notion/complete-auth');
        return res.status(401).json({ message: 'Authentication failed or user ID missing.' });
    }

    // Get code and state from the request BODY (sent by frontend)
    const { code, state } = req.body; 

    if (!code) {
        console.error('Missing Notion authorization code in request body');
        return res.status(400).json({ message: 'Missing Notion authorization code.' });
    }

    console.log(`Received POST /api/notion/complete-auth for user ${userId} with code ${code}`);

    try {
        // Construct the Authorization header for Notion API
        const clientId = process.env.NOTION_CLIENT_ID;
        const clientSecret = process.env.NOTION_CLIENT_SECRET;
        const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const authHeader = `Basic ${encoded}`;

        // 1. Fetch Notion Token from Notion API
        console.log('Exchanging Notion code for token...');
        const tokenResponse = await axios.post(
          'https://api.notion.com/v1/oauth/token',
          {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.NOTION_FRONTEND_REDIRECT_URI
          },
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            }
          }
        );

        const notionOAuthData = tokenResponse.data;
        const accessToken = notionOAuthData.access_token;
        console.log('Successfully exchanged code for Notion token.');

        // 2. NEW: Search for the single page the user authorized
        console.log('Searching for the authorized page...');
        const searchResponse = await axios.post(
          'https://api.notion.com/v1/search',
          {}, // Empty body to search all accessible pages/databases
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Notion-Version': '2022-06-28'
            }
          }
        );
        
        const accessiblePages = searchResponse.data.results.filter(
          result => result.object === 'page'
        );

        if (accessiblePages.length !== 1) {
            const errorMessage = `Expected exactly one page to be authorized, but found ${accessiblePages.length}. Please re-authenticate and select only a single parent page for the integration.`;
            console.error(errorMessage);
            return res.status(400).json({ message: errorMessage });
        }

        const authorizedPage = accessiblePages[0];
        const authorizedPageId = authorizedPage.id;
        console.log(`Found single authorized page with ID: ${authorizedPageId}`);

        // 3. Add the found page ID to the data object to be saved
        const dataToSave = {
            ...notionOAuthData,
            authorized_page_id: authorizedPageId
        };
  
        // 4. Save Notion Token to Supabase
        console.log('Attempting to save Notion token and page ID to database...');
        const newAuthRecord = await save_notion_access_token(userId, dataToSave);
        console.log('Successfully saved Notion token to database.');

        // Send success response back to the frontend
        res.status(200).json({ 
          message: 'Notion connection successful.',
          notionAuthId: newAuthRecord.id
        });

      } catch (error) {
        // Log detailed error from Notion API or database save
        const errorMessage = error.response?.data || error.message;
        console.error('Error during Notion token exchange or saving:', errorMessage, error.stack);
        
        // Send appropriate error response to frontend
        const displayMessage = error.message.includes('save_notion_access_token') 
            ? 'Failed to save Notion connection details.'
            : 'Failed to connect to Notion.';
        res.status(500).json({ message: displayMessage, error: errorMessage });
      }
});

export default router; 

