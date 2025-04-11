import { WebflowClient } from 'webflow-api';
import 'dotenv/config';

async function Webflow_AuthLink(platform) {
    try {
        // Ensure STATE is defined
        if (!process.env.STATE) {
            throw new Error('STATE environment variable is not defined');
        }

        // Format the state parameter with platform info
        const stateData = platform ? 
            `${process.env.STATE}|${platform}` : 
            process.env.STATE;
            
        // Ensure required environment variables exist    
        if (!process.env.WEBFLOW_CLIENT_ID) {
            throw new Error('WEBFLOW_CLIENT_ID environment variable is not defined');
        }
        
        if (!process.env.REDIRECT_URI) {
            throw new Error('REDIRECT_URI environment variable is not defined');
        }
        
        // Generate the authorization URL
        const authorizeUrl = WebflowClient.authorizeURL({
            state: stateData,
            scope: 'sites:read cms:read cms:write pages:read',
            clientId: process.env.WEBFLOW_CLIENT_ID,
            redirectUri: process.env.REDIRECT_URI,
        });
        
        console.log(`Generated auth URL with state: ${stateData}`);
        return authorizeUrl;
    } catch (error) {
        console.error('Error generating Webflow auth link:', error);
        throw error;
    }
}

export  { Webflow_AuthLink };