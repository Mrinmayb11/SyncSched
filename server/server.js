import express from "express";
import bodyParser from "body-parser";
import 'dotenv/config';
import cors from 'cors';

import { Webflow_AuthLink } from './api/cms/auth/webflowOauth.js'
import { W_Auth_db, get_all_webflow_auth, getWebflowToken }  from './database/save-webflowInfo.js';
import { WebflowClient } from 'webflow-api';
import protectedRoutes from "./api/auth/protected.js";
import notionAuthRouter from "./api/auth/notion_auth.js";
import { runIntegrationSync, runSelectedCollectionsSync } from './services/syncOrchestrator.js';
import { requireAuth } from './config/supabase.js';
import {
  get_all_user_integrations,
  get_all_notion_auth,
  create_site_integration,
  get_integration_by_id,
  get_notion_access_token,
  save_collection_mappings
} from './database/save-notionInfo.js';
import { Client } from '@notionhq/client';
import { supabase } from './config/supabase.js';

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
    
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Error generating Notion auth URL:', error);
    res.status(500).send('Error initiating Notion authentication');
  }
});

// Handles the final step after frontend redirect
app.post('/api/webflow/complete-auth', requireAuth, async (req, res) => {
  let step = 'start';
  try {
    step = 'get_user_id';
    const userId = req.user?.id;

    if (!userId) {
      console.error('User ID missing after auth.');
      return res.status(401).send('Authentication failed or user ID missing.');
    }

    step = 'extract_body';
    const { code, state } = req.body;

    if (!code || !state) {
      console.error('Missing code or state parameter from frontend.');
      return res.status(400).send('Missing code or state parameter from frontend.');
    }

    step = 'parse_state';
    let stateValue, platform;
    try {
      const stateParts = state.split('|');
      stateValue = stateParts[0];
      platform = stateParts[1] || 'unknown';
    } catch (error) {
      console.error('Error parsing state:', error);
      return res.status(400).send('Invalid state format');
    }

    step = 'validate_state';
    if (stateValue !== process.env.STATE) {
      console.error('State validation failed. Received state does not match expected state.');
      return res.status(400).send('State does not match. Authorization failed.');
    }

    step = 'get_access_token';
    const accessToken = await getAccessToken(code);
    
    if (!accessToken) { 
      console.error('Failed to get access token from Webflow');
      return res.status(500).send('Failed to get valid access token from Webflow');
    }

    // Step 4: Fetch site info using the new access token
    step = 'fetch_site_info';
    let siteInfo;
    try {
      const webflow = new WebflowClient({ accessToken });
      const response = await webflow.sites.list();

      const sites = response.sites;

      if (!Array.isArray(sites) || sites.length === 0) {
        throw new Error("No sites are associated with this Webflow token or the API returned an unexpected format.");
      }
      
      const primarySite = sites[0];
      
      if (!primarySite) {
          throw new Error("Could not extract a valid site from the Webflow API response.");
      }

      siteInfo = { id: primarySite.id, name: primarySite.displayName || primarySite.name };
    } catch (fetchError) {
      console.error('Error fetching Webflow site info:', fetchError);
      return res.status(500).json({ message: "Could not fetch site details from Webflow after authentication." });
    }

    // Step 5: Save token and site info to the database
    step = 'save_token_db';
    const newAuthRecord = await W_Auth_db(userId, accessToken, platform, siteInfo);
    
    if (!newAuthRecord || !newAuthRecord.id) {
        console.error("Failed to save new Webflow auth record or record is missing an ID.");
        return res.status(500).json({ message: "Failed to save new Webflow auth record." });
    }

    // Return the unique ID of the new auth record.
    // The frontend will use this for subsequent requests.
    res.status(200).json({ 
      status: 'success', 
      message: 'Webflow authentication completed successfully.',
      webflowAuthId: newAuthRecord.id 
    });

  } catch (error) {
    console.error(`[Webflow Auth] Error at step '${step}':`, error.response?.data || error.message);
    const displayMessage = (error.message || '').includes('W_Auth_db')
      ? 'Failed to save Webflow connection details.'
      : 'Internal Server Error during Webflow auth completion.';
    return res.status(500).json({ message: displayMessage, error: error.message });
  }
});

app.get('/api/webflow/sites', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    const authRecords = await get_all_webflow_auth(userId);
    if (!authRecords) {
      return res.status(500).json({ error: 'Could not retrieve Webflow connections.' });
    }

    const allSites = [];
    for (const auth of authRecords) {
      try {
        const webflow = new WebflowClient({ accessToken: auth.access_token });
        const sites = await webflow.sites.list();
        
        const sitesWithAuth = sites.map(site => ({
          ...site,
          webflow_auth_id: auth.id,
        }));

        allSites.push(...sitesWithAuth);
      } catch (error) {
        console.error(`Failed to fetch sites for Webflow auth ID ${auth.id}:`, error.message);
      }
    }

    res.status(200).json(allSites);

  } catch (error) {
    console.error('Error in /api/webflow/sites route:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching Webflow sites.' });
  }
});

app.get('/api/notion/pages', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    const authRecords = await get_all_notion_auth(userId);
    if (!authRecords) {
      return res.status(500).json({ error: 'Could not retrieve Notion connections.' });
    }

    const allPages = [];
    for (const auth of authRecords) {
      try {
        const notion = new Client({ auth: auth.access_token });
        const response = await notion.search({
          filter: {
            property: 'object',
            value: 'page'
          }
        });

        const pagesWithAuth = response.results.map(page => ({
          id: page.id,
          title: page.properties.title?.title[0]?.plain_text || 'Untitled',
          notion_auth_id: auth.id,
          workspace_name: auth.workspace_name,
        }));
        
        allPages.push(...pagesWithAuth);
      } catch (error) {
        console.error(`Failed to fetch pages for Notion auth ID ${auth.id}:`, error.message);
      }
    }

    res.status(200).json(allPages);

  } catch (error) {
    console.error('Error in /api/notion/pages route:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching Notion pages.' });
  }
});

app.post('/api/integrations/create', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const {
    webflow_auth_id,
    webflow_site_id,
    webflow_site_name,
    notion_auth_id,
    notion_page_id,
    notion_page_name,
    integration_name,
  } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed.' });
  }

  if (!webflow_auth_id || !webflow_site_id || !notion_auth_id || !notion_page_id) {
    return res.status(400).json({ error: 'Missing required fields for creating an integration.' });
  }

  try {
    const newIntegration = await create_site_integration({
      user_id: userId,
      webflow_auth_id,
      webflow_site_id,
      webflow_site_name,
      notion_auth_id,
      notion_page_id,
      notion_page_name,
      integration_name,
    });

    if (!newIntegration) {
      return res.status(500).json({ error: 'Failed to create integration in the database.' });
    }

    res.status(201).json(newIntegration);

  } catch (error) {
    console.error('Error in /api/integrations/create route:', error);
    res.status(500).json({ error: 'An unexpected error occurred while creating the integration.' });
  }
});

app.get('/api/integrations/:id/mapping-resources', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const { id: integrationId } = req.params;

  try {
    const integration = await get_integration_by_id(userId, integrationId);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found or user does not have access.' });
    }

    const webflowToken = await getWebflowToken(userId, integration.webflow_auth_id);
    if (!webflowToken) {
      return res.status(400).json({ error: 'Could not find a valid Webflow token for this integration.' });
    }
    const webflow = new WebflowClient({ accessToken: webflowToken });
    const collections = await webflow.collections.list(integration.webflow_site_id);

    const notionToken = await get_notion_access_token(userId, integration.notion_auth_id);
    if (!notionToken) {
      return res.status(400).json({ error: 'Could not find a valid Notion token for this integration.' });
    }
    const notion = new Client({ auth: notionToken });
    
    const { results: notionDatabases } = await notion.search({
      filter: { property: 'object', value: 'database' },
    });

    res.status(200).json({
      integration,
      webflowCollections: collections,
      notionDatabases: notionDatabases.map(db => ({
        id: db.id,
        name: db.title[0]?.plain_text || 'Untitled Database'
      })),
    });

  } catch (error) {
    console.error(`Error fetching mapping resources for integration ${integrationId}:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to load resources for mapping.' });
  }
});

app.post('/api/integrations/:id/mappings', requireAuth, async (req, res) => {
  const { id: integrationId } = req.params;
  const mappings = req.body.mappings;

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const success = await save_collection_mappings(integrationId, mappings);
    if (!success) {
      return res.status(500).json({ error: 'Failed to save mappings.' });
    }
    res.status(200).json({ message: 'Mappings saved successfully.' });
  } catch (error) {
    console.error(`Error saving mappings for integration ${integrationId}:`, error);
    res.status(500).json({ error: 'An unexpected error occurred while saving mappings.' });
  }
});

app.post('/api/integrations/:id/sync', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const { id: integrationId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  if (!integrationId) {
    return res.status(400).json({ error: 'Integration ID is required.' });
  }

  try {
    const syncResult = await runIntegrationSync(userId, parseInt(integrationId));

    if (syncResult.success) {
      res.status(200).json({ 
        status: 'success', 
        message: syncResult.message || 'Integration sync completed successfully.',
        details: syncResult
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: syncResult.message || 'Integration sync failed.', 
        error: syncResult.error ? syncResult.error.toString() : 'Unknown sync error' 
      });
    }
  } catch (error) {
    console.error(`Error in integration sync for ID ${integrationId}:`, error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to start integration sync process.', 
      error: error.message 
    });
  }
});

// Legacy endpoint - kept for backward compatibility
app.post('/api/sync/start-blog-sync', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const { platformId, collectionIds } = req.body;
  
  if (!userId) {
    console.error('User ID not found after authentication in /api/sync/start-blog-sync');
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  if (!platformId || platformId !== 'webflow') {
    return res.status(400).json({ error: 'Only Webflow platform is currently supported.' });
  }

  if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
    return res.status(400).json({ error: 'At least one collection must be selected.' });
  }

  try {
    const syncResult = await runSelectedCollectionsSync(userId, collectionIds);

    if (syncResult.success) {
      res.status(200).json({ 
        status: 'success', 
        message: syncResult.message || 'Sync completed successfully.',
        details: syncResult
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: syncResult.message || 'Sync failed.', 
        error: syncResult.error ? syncResult.error.toString() : 'Unknown sync error' 
      });
    }
  } catch (error) {
    console.error('Error in /api/sync/start-blog-sync:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to start sync process.', 
      error: error.message 
    });
  }
});

app.get('/api/sync/list-integrations', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    const integrations = await get_all_user_integrations(userId);
    if (integrations === null) {
      return res.status(500).json({ error: 'Failed to retrieve integrations.' });
    }
    res.status(200).json(integrations);
  } catch (error) {
    console.error('Error in /api/sync/list-integrations route:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching integrations.' });
  }
});

app.get('/api/webflow/collections', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const webflowAuthId = req.query.webflowAuthId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  if (!webflowAuthId) {
    return res.status(400).json({ error: 'A webflowAuthId query parameter is required.' });
  }

  try {
    // 1. Get the specific Webflow auth record for the user using the provided ID.
    const { data: authRecord, error } = await supabase
      .from('cms_auth_info')
      .select('*')
      .eq('user_id', userId)
      .eq('id', webflowAuthId)
      .single();

    if (error || !authRecord) {
      console.error(`Could not find webflowAuthId ${webflowAuthId} for user ${userId}`, error);
      return res.status(404).json({ error: 'Webflow connection not found. Please try reconnecting.' });
    }

    if (!authRecord.site_id || !authRecord.access_token) {
      return res.status(400).json({ error: 'The stored Webflow connection is incomplete and missing a Site ID. Please reconnect.' });
    }

    // 2. Use the token and siteId from the DB to fetch collections from Webflow API.
    const webflow = new WebflowClient({ accessToken: authRecord.access_token });
    const collectionsResponse = await webflow.collections.list(authRecord.site_id);


    const collections = collectionsResponse.collections || collectionsResponse;

    console.log('Webflow collections response:', JSON.stringify(collectionsResponse, null, 2));
    console.log('Extracted collections:', JSON.stringify(collections, null, 2));

    // 3. Return the collections and site info.
    res.status(200).json({
      site: {
        id: authRecord.site_id,
        displayName: authRecord.site_name,
      },
      collections: collections
    });

  } catch (error) {
    console.error('Error fetching collections via DB lookup:', error);
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Webflow token is invalid or has expired. Please reconnect your account.' });
    }
    res.status(500).json({ error: 'An unexpected error occurred while fetching collections.' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}