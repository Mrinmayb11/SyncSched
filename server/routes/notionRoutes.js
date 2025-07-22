import express from 'express';
import { Client } from '@notionhq/client';
import { get_all_notion_auth } from '../database/save-notionInfo.js';
import { requireAuth } from '../config/supabase.js';

const router = express.Router();

// Notion OAuth2.0 initiation
router.get('/auth', async (req, res) => {
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

// Get all Notion pages for the user
router.get('/pages', requireAuth, async (req, res) => {
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

export default router;
