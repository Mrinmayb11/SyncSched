import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize the Supabase client with server-side credentials
// Use service role key for admin privileges (careful with this)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Create a function to verify JWT tokens from client requests
export async function verifyToken(req) {
  try {
    // Extract the Bearer token from the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token and get user data
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.error('Token verification error:', error.message);
      return null;
    }
    
    return data.user;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// Create an auth middleware for Express routes
export function requireAuth(req, res, next) {
  verifyToken(req)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Attach the user to the request object for use in route handlers
      req.user = user;
      next();
    })
    .catch(error => {
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
} 