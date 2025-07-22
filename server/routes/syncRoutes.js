import express from 'express';
import { requireAuth, supabase } from '../config/supabase.js';
import { get_all_user_integrations } from '../database/save-notionInfo.js';

const router = express.Router();

// List all integrations for the user
router.get('/list-integrations', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication failed or user ID missing.' });
  }

  try {
    let integrations = await get_all_user_integrations(userId);
    
    // If the RPC function failed or returned null, try a direct query
    if (!integrations) {
      const { data: directIntegrations, error } = await supabase
        .from('site_integrations')
        .select(`
          *,
          collection_sync_mappings (
            id,
            webflow_collection_name,
            notion_database_name,
            is_active
          )
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('Direct query error:', error);
        return res.status(500).json({ error: 'Failed to retrieve integrations.' });
      }

      // Transform the data to include mappings in the expected format
      integrations = directIntegrations.map(integration => ({
        ...integration,
        mappings: integration.collection_sync_mappings || []
      }));
    }

    res.status(200).json(integrations || []);
  } catch (error) {
    console.error('Error in /api/sync/list-integrations route:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching integrations.' });
  }
});

export default router; 