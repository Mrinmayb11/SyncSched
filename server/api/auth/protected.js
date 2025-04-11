import express from 'express';
import { requireAuth } from '../../config/supabase.js';

const router = express.Router();

// Protected route example
// This route will only be accessible if a valid JWT token is provided
router.get('/user-data', requireAuth, (req, res) => {
  // The user object is attached by the requireAuth middleware
  // It contains user info from the verified JWT token
  const user = req.user;
  
  res.json({
    message: 'This is a protected route',
    user: {
      id: user.id,
      email: user.email,
      // Add any other user data you want to return
    }
  });
});

// Another protected route example
router.post('/user-action', requireAuth, async (req, res) => {
  try {
    // Access the authenticated user
    const userId = req.user.id;
    
    // Perform some action that requires authentication
    // For example, save user-specific data
    
    res.json({
      success: true,
      message: 'Action completed successfully',
      userId
    });
  } catch (error) {
    console.error('Error in protected route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 