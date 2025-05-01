import { WebflowClient } from 'webflow-api';
import 'dotenv/config';

export async function Webflow_AuthLink(platform) {
    try {
        // Ensure STATE is defined
        if (!process.env.STATE) {
            throw new Error('STATE environment variable is not defined');
        }

        // Combine state and platform, ensuring platform is included
        const state = `${process.env.STATE}|${platform}`;
        
        // Ensure required environment variables exist    
        if (!process.env.WEBFLOW_CLIENT_ID) {
            throw new Error('WEBFLOW_CLIENT_ID environment variable is not defined');
        }
        
        if (!process.env.WEBFLOW_REDIRECT_URI) {
            throw new Error('WEBFLOW_REDIRECT_URI environment variable is not defined');
        }
        
        // Generate the authorization URL
        const authorizeURL = WebflowClient.authorizeURL({
            clientId: process.env.WEBFLOW_CLIENT_ID,
            state: state,
            // Use the FRONTEND redirect URI for the initial authorization step
            redirectUri: process.env.WEBFLOW_REDIRECT_URI,
            scope: 'sites:read cms:read cms:write pages:read',
        });
        
        console.log(`Generated auth URL with state: ${state}`);
        return authorizeURL;
    } catch (error) {
        console.error('Error generating Webflow auth link:', error);
        throw error;
    }
}