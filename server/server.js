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
app.get('/api/webflow/auth', async (req, res) => {
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

// Notion OAuth2.0 initiation
app.get('/api/notion/auth', async (req, res) => {
  try {
    const clientId = process.env.NOTION_CLIENT_ID;
    const redirectUri = process.env.NOTION_FRONTEND_REDIRECT_URI;
    const oauthUrl = process.env.NOTION_AUTH_URL;
    
    if (!clientId || !redirectUri || !oauthUrl) {
      console.error('Missing Notion OAuth environment variables');
      return res.status(500).send('Server configuration error');
    }
    
    console.log('Redirecting to Notion OAuth:', oauthUrl);
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Error generating Notion auth URL:', error);
    res.status(500).send('Error initiating Notion authentication');
  }
});

// Renamed and changed to POST. Handles the final step after frontend redirect.
app.post('/api/webflow/complete-auth', requireAuth, async (req, res) => {
  console.log('[Webflow Auth] Received request to /api/webflow/complete-auth');
  let step = 'start';
  try {
    // Get userId from the authenticated request (verified by requireAuth)
    step = 'get_user_id';
    const userId = req.user?.id;

    if (!userId) {
      console.error('[Webflow Auth] User ID missing after auth.');
      return res.status(401).send('Authentication failed or user ID missing.');
    }
    console.log(`[Webflow Auth] Authenticated user ID: ${userId}`);

    // Extract code and state from the request BODY (sent by frontend)
    step = 'extract_body';
    const { code, state } = req.body;

    if (!code || !state) {
      console.error('[Webflow Auth] Missing code or state parameter from frontend.');
      return res.status(400).send('Missing code or state parameter from frontend.');
    }

    // Extract the platform from state
    step = 'parse_state';
    let stateValue, platform;
    try {
      const stateParts = state.split('|');
      stateValue = stateParts[0];
      platform = stateParts[1] || 'unknown';
    } catch (error) {
      console.error('[Webflow Auth] Error parsing state:', error);
      return res.status(400).send('Invalid state format');
    }

    step = 'validate_state';
    if (stateValue !== process.env.STATE) {
      console.error('[Webflow Auth] State validation failed. Received state does not match expected state.');
      return res.status(400).send('State does not match. Authorization failed.');
    }

    // Pass the FRONTEND redirect URI here as it must match the initial request
    step = 'get_access_token';
    const accessToken = await getAccessToken(code);
    console.log('[Webflow Auth] Successfully received access token from Webflow.');
    console.log('[Webflow Auth] Access token structure:', JSON.stringify(accessToken, null, 2));
    
    if (!accessToken) { 
      console.error('[Webflow Auth] Failed to get access token from Webflow');
      return res.status(500).send('Failed to get valid access token from Webflow');
    }

    // Save token and platform
    step = 'save_token_db';
    await W_Auth_db(userId, accessToken, platform);

    // Fetch and save collections
    step = 'fetch_save_collections';
    
    // Initialize the client with the token inside an object
    const webflow = new WebflowClient({ token: accessToken });
    const sites = await webflow.sites.list();
    
    // Assuming we're working with the first site for now
    if (sites.length > 0) {
        const siteId = sites[0].id;
        const collectionsResult = await webflow.collections.list(siteId);
        
        await W_Collection_db(userId, collectionsResult);
    } else {
        console.log('[Webflow Auth] No sites found for this user, skipping collection sync.');
    }

    res.status(200).json({ status: 'success', message: 'Webflow authentication completed successfully.' });

  } catch (error) {
    console.error(`[Webflow Auth] Error at step '${step}':`, error.response?.data || error.message);
    const displayMessage = (error.message || '').includes('W_Auth_db')
      ? 'Failed to save Webflow connection details.'
      : 'Internal Server Error during Webflow auth completion.';
    return res.status(500).json({ message: displayMessage, error: error.message });
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


app.post('/api/sync/start-blog-sync', requireAuth, async (req, res) => {
 
  const userId = req.user?.id;
  if (!userId) {
    console.error('User ID not found after authentication in /api/sync/start');
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    // Call the sync orchestrator function, PASSING userId
    const syncResult = await runFullSyncProcess(userId);

    if (syncResult.success) {
      res.status(200).json({ 
        status: 'success', 
        message: syncResult.message || 'Sync completed successfully.',
        details: syncResult // Include any details returned by the sync function
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: syncResult.message || 'Sync failed.', 
        error: syncResult.error ? syncResult.error.toString() : 'Unknown sync error' 
      });
    }
  } catch (error) {
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