import express from "express";
import bodyParser from "body-parser";
import 'dotenv/config';
import cors from 'cors';

import { Webflow_AuthLink } from './api/cms/auth/webflowOauth.js'
import { W_Auth_db, W_Collection_db }  from './database/database.js';
import { WebflowClient } from 'webflow-api';
import protectedRoutes from "./api/auth/protected.js";
import notionAuthRouter from "./api/auth/notion_auth.js";
import { getCollections, getCollectionFields } from "./services/fetch-webflow.js";
import  createAndPopulateDatabases  from "./services/syncDbProp.js";
import runFullSyncProcess from './services/syncDbProp.js';



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
  
  console.log(`Auth request for platform: ${platform || 'webflow'}`);
  
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
    redirectUri: process.env.REDIRECT_URI,
  });
  
  // Log the full response object to see all fields
  console.log('Full token response:', JSON.stringify(tokenResponse, null, 2));
  
  return tokenResponse;
}

// Get Webflow code
app.get('/api/save-platform-connection', async (req, res) => {
  const { code, state } = req.query;

  // Check if state exists before trying to split it
  if (!state) {
    console.error('No state parameter provided in callback');
    return res.status(400).send('Missing state parameter. Authorization failed.');
  }

  // Extract the platform from state
  let stateValue, platform;
  try {
    const stateParts = state.split('|');
    stateValue = stateParts[0];
    platform = stateParts[1];
    
    // Handle missing platform
    if (!platform) {
      console.warn('No platform specified in state parameter');
      platform = 'unknown';
    }
  } catch (error) {
    console.error('Error parsing state parameter:', error);
    return res.status(400).send('Invalid state format');
  }
  
  // Validate state
  if (stateValue !== process.env.STATE) {
    console.error('State validation failed', { 
      expected: process.env.STATE, 
      received: stateValue 
    });
    return res.status(400).send('State does not match. Authorization failed.');
  }

  try {
    const tokenResponse = await getAccessToken(code);
    console.log('Token response:', tokenResponse);
    
    if (!tokenResponse) {
      console.error('Invalid token response:', tokenResponse);
      return res.status(500).send('Failed to get valid access token');
    }
    
    // Save both token and platform in one operation
    await W_Auth_db(tokenResponse, platform);
    
    // After successful authentication, fetch and save collections
    try {
      const collections = await getCollections();
      if (collections && Array.isArray(collections)) {
        await W_Collection_db(collections);
        console.log('Collections saved to database and token cleared');
      }
    } catch (collectionError) {
      console.error('Error saving collections:', collectionError);
      // Continue with redirect even if collection saving fails
    }
    
    // Redirect the user back to the frontend
    res.redirect('http://localhost:3000');

  } catch (error) {
    console.error('Error during OAuth process:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Create a proxy endpoint for Webflow collections

app.get('/api/webflow/collections', async (req, res) => {
  try {
    console.log('Received request for Webflow collections');
    const collections = await getCollections();
    
    res.json(Array.isArray(collections) ? collections : 
             collections.collections ? collections.collections : []);
  } catch (error) {
    console.error('Error fetching Webflow collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});



app.get('/api/webflow/fetch-webflow-data', async (req, res) => {
  const collectionFields = await getCollectionFields();

  const notionPages = await createAndPopulateDatabases();

  if (notionPages) {
    res.redirect('http://localhost:3000/dashboard/notion-to-blogs?notion_auth=success');
  } else {
    res.status(500).json({ error: 'Failed to create Notion pages' });
  }
});


app.post('/api/sync/start', async (req, res) => {
  console.log("Received request to start sync process...");
  try {
    // Consider running this asynchronously if it takes a very long time
    // For now, run it directly and wait for completion
    const syncResult = await runFullSyncProcess();

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



// Start the server only if this file is run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}