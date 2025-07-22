import express from 'express';

const router = express.Router();

// Health check endpoint for webhook testing
router.get('/notion', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Notion webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

// Notion Webhook endpoint for verification and handling events
router.post('/notion', async (req, res) => {
  try {
    console.log('Notion webhook received:', {
      body: req.body
    });

    // Handle actual webhook events
    if (req.body && req.body.type) {
      console.log('Notion webhook event received:', req.body.type);
      
      // TODO: Handle different event types
      switch (req.body.type) {
        case 'page.property_value_updated':
          console.log('Page property updated:', req.body.body.data);
          
          break;
        case 'page.created':
          console.log('Page created:', req.body);
          // TODO: Implement sync logic for new pages
          break;
        case 'page.updated':
          console.log('Page updated:', req.body);
          // TODO: Implement sync logic for page updates
          break;
        case 'database.updated':
          console.log('Database updated:', req.body);
          // TODO: Implement sync logic for database updates
          break;
        case 'page.properties_updated':
          console.log('Page properties updated:', req.body.data);
          // TODO: Implement sync logic for page properties updates
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

export default router; 