import express from 'express';
import { WebflowClient } from 'webflow-api';
import { Client } from '@notionhq/client';
import { Webflow_AuthLink } from '../api/cms/auth/webflowOauth.js';
import { W_Auth_db, get_all_webflow_auth, getWebflowToken } from '../database/save-webflowInfo.js';
import { requireAuth, supabase } from '../config/supabase.js';
import { runSelectedCollectionsSync } from '../services/syncOrchestrator.js';
import {
  create_site_integration,
  get_integration_by_id,
  get_notion_access_token,
} from '../database/save-notionInfo.js';

const router = express.Router();

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

// Webflow Auth2.0 initiation
router.get('/auth', async (req, res) => {
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

// Handles the final step after frontend redirect
router.post('/complete-auth', requireAuth, async (req, res) => {
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

      if (!Array.isArray(sites) || sites.length !== 1) {
        console.error(`Webflow API returned ${sites.length} sites, but expected exactly 1.`);
        throw new Error("Please ensure you authorize exactly one site in the Webflow OAuth screen.");
      }
      
      const authorizedSite = sites[0];
      
      if (!authorizedSite) {
          throw new Error("Could not extract a valid site from the Webflow API response.");
      }

      siteInfo = { id: authorizedSite.id, name: authorizedSite.displayName || authorizedSite.name };
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

    // Return the unique ID and site info of the new auth record.
    res.status(200).json({ 
      status: 'success', 
      message: 'Webflow authentication completed successfully.',
      webflowAuthId: newAuthRecord.id,
      siteId: siteInfo.id,
      siteName: siteInfo.name,
    });

  } catch (error) {
    console.error(`[Webflow Auth] Error at step '${step}':`, error.response?.data || error.message);
    const displayMessage = (error.message || '').includes('W_Auth_db')
      ? 'Failed to save Webflow connection details.'
      : 'Internal Server Error during Webflow auth completion.';
    return res.status(500).json({ message: displayMessage, error: error.message });
  }
});

// Get all Webflow sites for the user
router.get('/sites', requireAuth, async (req, res) => {
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

// Get collections for a specific Webflow auth
router.get('/collections', requireAuth, async (req, res) => {
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

// Create integration and start sync
router.post('/integration/create-and-sync', requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { 
        webflow_auth_id, 
        webflow_site_id, 
        webflow_site_name,
        notion_auth_id, 
        integration_name, 
        collectionIds 
    } = req.body;

    // Set a longer timeout for this endpoint (5 minutes)
    req.setTimeout(300000); // 5 minutes in milliseconds
    res.setTimeout(300000);

    // --- Step 1: Create the integration record ---
    const integrationData = {
        user_id: userId,
        webflow_auth_id,
        webflow_site_id,
        webflow_site_name,
        notion_auth_id,
        integration_name
    };

    let integrationId;
    try {
        const newIntegration = await create_site_integration(integrationData);

        if (!newIntegration || !newIntegration.id) {
            return res.status(500).json({ 
                status: 'error', 
                message: 'Failed to create the site integration record in the database.' 
            });
        }

        integrationId = newIntegration.id;
        console.log(`Integration ${integrationId} created. Starting initial sync...`);
    } catch (createError) {
        console.error('Error creating integration:', createError);
        return res.status(500).json({ 
            status: 'error', 
            message: 'Failed to create integration: ' + createError.message 
        });
    }

    // --- Step 2: Run the full, synchronous sync process ---
    try {
        // Send an immediate response to acknowledge the request
        res.status(202).json({
            status: 'processing',
            message: 'Integration created successfully. Sync is in progress...',
            integrationId: integrationId,
            note: 'The sync process may take a few minutes depending on the size of your collections.'
        });

        // Continue with the sync process (this will happen after the response is sent)
        const syncResult = await runSelectedCollectionsSync(userId, integrationId, collectionIds);

        if (!syncResult.success) {
            console.error(`Sync failed for integration ${integrationId}:`, syncResult.error);
            // You could store this error in the database for later retrieval
            // For now, we'll just log it since the response was already sent
        } else {
            console.log(`Sync completed successfully for integration ${integrationId}`);
        }
    } catch (error) {
        console.error(`Critical error during initial sync for new integration ${integrationId}:`, error);
        // Since we already sent a response, we can only log this error
        // Consider implementing a webhook or status endpoint for checking sync status
    }
});

// Get mapping resources for an integration
router.get('/integration/:id/mapping-resources', requireAuth, async (req, res) => {
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

export default router;
