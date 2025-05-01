import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
// Use the Service Role Key for backend operations
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// Keep Anon key check for verifyToken if needed
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseServiceKey) { // Check for Service Key
  console.error(
    'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). ' +
    'Make sure they are defined in your .env file.'
  );
  // Optionally throw an error or exit, depending on desired behavior
  // throw new Error("Supabase environment variables are not set.");
}

// Initialize Supabase client with the SERVICE KEY
// This client will bypass RLS
const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

if (!supabase) {
    console.error("Supabase client could not be initialized due to missing environment variables.");
}

// Export the service client (typically just named 'supabase' for backend use)
export { supabase };


export async function verifyToken(req) {
  // This function NEEDS the anon key to call supabase.auth.getUser
  // Let's create a temporary client just for this purpose.
  const tempAnonClient = (supabaseUrl && supabaseAnonKey) 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;
    
  if (!tempAnonClient) {
      console.error("Cannot verify token: Supabase Anon client could not be initialized.");
      return null;
  }
  
  try {
    // Extract the Bearer token from the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token and get user data using the temporary ANONYMOUS client
    const { data, error } = await tempAnonClient.auth.getUser(token);
    
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