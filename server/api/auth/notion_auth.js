// Libraries
import express from 'express'; 
import axios from 'axios';
import 'dotenv/config';
import { save_access_token } from '../../services/fetch-notion.js';
// Import the default export (runFullSyncProcess) from sync2notion.js
import runFullSyncProcess from '../../services/sync2notion.js'; 

const router = express.Router();

// TODO: Consider moving Notion logic to a dedicated file like server/api/notion/auth.js


// Define the route on the router instance
router.get('/connect-notion', async (req, res) => {
    const { code, state } = req.query;
    let syncStatus = 'unknown'; // Track sync status
    let syncMessage = '';

    if (!code) {
        console.error('Missing code in Notion callback');
        // Redirect with error for user feedback
        return res.redirect('http://localhost:3000/dashboard?notion_auth=error&message=Missing_code');
    }

    try {
        // Construct the Authorization header
        const clientId = process.env.NOTION_CLIENT_ID;
        const clientSecret = process.env.NOTION_CLIENT_SECRET;
        const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const authHeader = `Basic ${encoded}`;

        // 1. Fetch Notion Token
        console.log("Fetching Notion token...");
        const tokenResponse = await axios.post(
          'https://api.notion.com/v1/oauth/token',
          {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.NOTION_REDIRECT_URI
          },
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': authHeader, // Use the constructed header
              'Content-Type': 'application/json'
            }
          }
        );
  
        console.log("Notion Token Response received.");

        // 2. Save Notion Token
        await save_access_token(tokenResponse.data);
        console.log("Notion token saved successfully.");

        // 3. Trigger the Full Notion Sync Process
        // try {
        //     console.log("Starting the full Webflow -> Notion sync process...");
        //     const syncResult = await runFullSyncProcess(); // Call the single wrapper function
            
        //     if (syncResult.success) {
        //         console.log("Full sync process reported success.");
        //         syncStatus = 'success';
        //         syncMessage = syncResult.message || 'Sync_Completed_Successfully';
        //     } else {
        //         console.error("Full sync process reported failure:", syncResult.message);
        //         syncStatus = 'error';
        //         syncMessage = `Sync_Failed:_${syncResult.message}`.replace(/\s+/g, '_');
        //     }

        // } catch (syncError) {
        //     // Catch any unexpected errors from runFullSyncProcess itself
        //     console.error("Unexpected error during sync process execution:", syncError);
        //     syncStatus = 'error';
        //     syncMessage = `Sync_Execution_Error:_${syncError.message}`.replace(/\s+/g, '_');
        // }

        // 4. Redirect to Frontend Dashboard with status (indicate auth success ONLY)
        syncStatus = 'success'; // Auth was successful
        syncMessage = 'Notion_Connected_Successfully';
        console.log(`Redirecting to dashboard. Auth Status: ${syncStatus}, Message: ${syncMessage}`);
        // Redirect immediately after saving token
        res.redirect(`http://localhost:3000/dashboard?notion_auth=${syncStatus}&message=${syncMessage}`);

      } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error('Error during Notion authentication or token saving:', errorMessage);
        // Redirect with specific error
        const messageParam = `Token_Fetch_Failed:_${typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)}`.replace(/\s+/g, '_');
        res.redirect(`http://localhost:3000/dashboard?notion_auth=error&message=${messageParam}`);
      }
});

export default router; // Export the router

