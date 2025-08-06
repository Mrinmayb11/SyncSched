import express from 'express';
import { 
  handleNotionPageCreated, 
  handleNotionPageDeleted, 
  handleNotionPageUpdated 
} from '../services/notion-webhook-handler.js';
import { logWebhookEvent, updateWebhookEventStatus, getRecentWebhookLogs } from '../services/webhook-logger.js';

const router = express.Router();

// Health check endpoint for webhook testing
router.get('/notion', (req, res) => {

  res.status(200).json({ 
    status: 'ok', 
    message: 'Notion webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
});

// Notion Webhook endpoint for verification and handling events
router.post('/notion', async (req, res) => {
  
  try {
    // Handle actual webhook events
    if (req.body && req.body.type) {
      console.log('Notion webhook event received:', req.body.type);
      
      // Log the webhook event
      const webhookLog = await logWebhookEvent(
        req.headers['notion-webhook-id'] || 'unknown',
        req.body.type,
        req.body,
        'received'
      );
      
      // Handle different event types
      switch (req.body.type) {
        case 'page.created':
          console.log('Page created:', req.body);
          try {
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'processing');
            
            const result = await handleNotionPageCreated(req.body);
            if (result.success) {
              console.log(`[Webhook] Page creation handled successfully: ${result.message}`);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'completed');
            } else {
              console.error(`[Webhook] Page creation failed: ${result.message}`, result.error);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', result.message);
            }
          } catch (error) {
            console.error('[Webhook] Error handling page.created:', error);
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', error.message);
          }
          break;

        case 'page.deleted':
          console.log('Page deleted:', req.body);
          try {
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'processing');
            
            const result = await handleNotionPageDeleted(req.body);
            if (result.success) {
              console.log(`[Webhook] Page deletion handled successfully: ${result.message}`);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'completed');
            } else {
              console.error(`[Webhook] Page deletion failed: ${result.message}`, result.error);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', result.message);
            }
          } catch (error) {
            console.error('[Webhook] Error handling page.deleted:', error);
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', error.message);
          }
          break;

        case 'page.updated':
        case 'page.property_value_updated':
        case 'page.properties_updated':
          console.log('Page updated:', req.body);
          try {
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'processing');
            
            const result = await handleNotionPageUpdated(req.body);
            if (result.success) {
              console.log(`[Webhook] Page update handled successfully: ${result.message}`);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'completed');
            } else {
              console.error(`[Webhook] Page update failed: ${result.message}`, result.error);
              if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', result.message);
            }
          } catch (error) {
            console.error('[Webhook] Error handling page update:', error);
            if (webhookLog) await updateWebhookEventStatus(webhookLog.id, 'error', error.message);
          }
          break;

        case 'database.updated':
          console.log('Database updated:', req.body);
          // Database structure changes don't require immediate sync
          console.log('[Webhook] Database update ignored - no sync needed');
          break;

        default:
          console.log('Unhandled webhook event type:', req.body.type);
      }

      return res.status(200).json({ status: 'received' });
    }

    console.log('Notion webhook received without challenge or event type');
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Error handling Notion webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent webhook logs for debugging
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await getRecentWebhookLogs(limit);
    
    res.status(200).json({
      status: 'success',
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch webhook logs',
      error: error.message
    });
  }
});

export default router; 