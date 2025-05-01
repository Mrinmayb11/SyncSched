import express from "express";
import bodyParser from "body-parser";
import 'dotenv/config';
import cors from 'cors';

import { Webflow_AuthLink } from './api/cms/auth/webflowOauth.js'
import { W_Auth_db, W_Collection_db }  from './database/save-webflowInfo.js';
import { WebflowClient } from 'webflow-api';
import protectedRoutes from "./api/auth/protected.js";
import notionAuthRouter from "./api/auth/notion_auth.js";
import { getCollections, getCollectionFields } from "./services/fetch-webflow.js";
import { CreateDatabases } from "./services/syncDbProp.js";
import { runFullSyncProcess } from './services/syncOrchestrator.js';
import { requireAuth } from './config/supabase.js';



// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Register protected routes
app.use('/api/protected', protectedRoutes);

// Use the Notion router
app.use(notionAuthRouter);

// Webflow Auth2.0
app.get('/auth', async (req, res) => {
  const platform = req.query.platform;
  
  // Log and validate platform parameter
  if (!platform) {
    console.warn('No platform specified in auth request, using "webflow" as default');
  }
  
  try {
    const authorizeURL = await Webflow_AuthLink(platform || 'webflow');
    res.redirect(authorizeURL);
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).send('Error initiating authentication');
  }
});

// Get Webflow access token
async function getAccessToken(code) {
  const tokenResponse = await WebflowClient.getAccessToken({
    clientId: process.env.WEBFLOW_CLIENT_ID,
    clientSecret: process.env.WEBFLOW_SECRET,
    code: code,
    redirectUri: process.env.WEBFLOW_REDIRECT_URI,
  });
  
  return tokenResponse;
}






// Renamed and changed to POST. Handles the final step after frontend redirect.
app.post('/api/webflow/complete-auth', requireAuth, async (req, res) => {
  try {
    // Get userId from the authenticated request (verified by requireAuth)
    const userId = req.user?.id;
    if (!userId) {
      console.error('User ID not found after authentication in /api/webflow/complete-auth');
      return res.status(401).send('Authentication failed or user ID missing.');
    }

    // Extract code and state from the request BODY (sent by frontend)
    const { code, state } = req.body;

    if (!code || !state) {
      console.error('Missing code or state in request body');
      return res.status(400).send('Missing code or state parameter from frontend.');
    }

    // Extract the platform from state
    let stateValue, platform;
    try {
      const stateParts = state.split('|');
      stateValue = stateParts[0];
      platform = stateParts[1] || 'unknown';
    } catch (error) {
      console.error('Error parsing state parameter:', error);
      return res.status(400).send('Invalid state format');
    }

    if (stateValue !== process.env.STATE) {
      console.error('State validation failed', { 
        expected: process.env.STATE, 
        received: stateValue 
      });
      return res.status(400).send('State does not match. Authorization failed.');
    }

    // Pass the FRONTEND redirect URI here as it must match the initial request
    const accessToken = await getAccessToken(code);
    console.log('Value of accessToken immediately after await:', accessToken); // DEBUG LOG
    
    if (!accessToken) { 
      console.error('Invalid token response from Webflow helper'); 
      return res.status(500).send('Failed to get valid access token from Webflow');
    }

    // Save token and platform
    console.log(`Attempting to save Webflow token for user ${userId}...`);
    await W_Auth_db(userId, accessToken, platform);
    console.log(`Successfully saved Webflow token for user ${userId}.`);

    // Fetch and save collections
    console.log(`Attempting to fetch/save collections for user ${userId}...`);
    try {
      console.log(`Calling getCollections for user ${userId}...`);
      const collectionsResult = await getCollections(userId);
      console.log(`Received collections result for user ${userId}:`, JSON.stringify(collectionsResult));

      const collections = collectionsResult?.collections;

      if (collections && Array.isArray(collections) && collections.length > 0) {
        console.log(`Found ${collections.length} collections. Attempting to save...`);
        await W_Collection_db(userId, collections);
        console.log(`Collections saved for user ${userId} after Webflow auth.`);
      } else {
        console.log(`No new collections found or collections format invalid for user ${userId}. Raw result:`, JSON.stringify(collectionsResult));
      }
    } catch (collectionError) {
      console.error(`Error fetching/saving collections for user ${userId}:`, collectionError);
    }

    // Success response
    console.log(`Completing request successfully for user ${userId}.`);
    res.status(200).json({ message: 'Webflow authentication completed successfully.' });

  } catch (error) {
    console.error('ERROR in /api/webflow/complete-auth:', error);

    if (error.response && error.response.data) {
      console.error('Webflow API Error details:', error.response.data);
      return res.status(500).json({ 
        message: 'Error communicating with Webflow API', 
        details: error.response.data 
      });
    } else {
      return res.status(500).json({ message: 'Internal Server Error during Webflow auth completion.' });
    }
  }
});






app.get('/api/webflow/collections', requireAuth, async (req, res) => {
  // Get userId from the authenticated request
  const userId = req.user?.id;
  if (!userId) {
    console.error('User ID not found after authentication in /api/webflow/collections');
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    // Fetch collections FOR THIS USER
    const collectionsResult = await getCollections(userId);
    
    // Adjust response based on actual structure returned by getCollections
    const collections = collectionsResult?.collections || [];
    
    res.json(collections);
  } catch (error) {
    console.error('Error fetching Webflow collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});


app.post('/api/sync/start', requireAuth, async (req, res) => {
 
  const userId = req.user?.id;
  if (!userId) {
    console.error('User ID not found after authentication in /api/sync/start');
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  console.log(`Received request to start sync process for user ${userId}...`);
  try {
    // Call the sync orchestrator function, PASSING userId
    const syncResult = await runFullSyncProcess(userId);

    if (syncResult.success) {
      console.log("Sync process completed successfully (from API endpoint).");
      res.status(200).json({ 
        status: 'success', 
        message: syncResult.message || 'Sync completed successfully.',
        details: syncResult // Include any details returned by the sync function
      });
    } else {
      console.error("Sync process failed (from API endpoint):", syncResult.message);
      res.status(500).json({ 
        status: 'error', 
        message: syncResult.message || 'Sync failed.', 
        error: syncResult.error ? syncResult.error.toString() : 'Unknown sync error' 
      });
    }
  } catch (error) {
    console.error("Error triggering sync process from API endpoint:", error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to start sync process.', 
      error: error.message 
    });
  }
});


if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}