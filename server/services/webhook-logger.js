import { supabase } from '../config/supabase.js';

/**
 * Logs a webhook event to the database
 * @param {string} notionWebhookId - The Notion webhook ID (if available)
 * @param {string} eventType - The type of webhook event
 * @param {object} eventData - The webhook event data
 * @param {string} status - The processing status ('received', 'processing', 'completed', 'error')
 * @param {string} errorMessage - Error message if status is 'error'
 * @returns {Promise<object|null>} - The logged event or null on failure
 */
export async function logWebhookEvent(notionWebhookId, eventType, eventData, status = 'received', errorMessage = null) {
    if (!supabase) {
        console.error('Supabase client not initialized for webhook logging');
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('webhook_event_logs')
            .insert({
                notion_webhook_id: notionWebhookId || 'unknown',
                event_type: eventType,
                event_data: eventData,
                status: status,
                error_message: errorMessage
            })
            .select()
            .single();

        if (error) {
            console.error('Error logging webhook event:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Error in logWebhookEvent:', error.message);
        return null;
    }
}

/**
 * Updates the status of a webhook event log
 * @param {number} logId - The webhook event log ID
 * @param {string} status - The new status
 * @param {string} errorMessage - Error message if status is 'error'
 * @returns {Promise<boolean>} - True on success, false on failure
 */
export async function updateWebhookEventStatus(logId, status, errorMessage = null) {
    if (!supabase) {
        console.error('Supabase client not initialized for webhook logging');
        return false;
    }

    try {
        const updateData = { status };
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }

        const { error } = await supabase
            .from('webhook_event_logs')
            .update(updateData)
            .eq('id', logId);

        if (error) {
            console.error('Error updating webhook event status:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error in updateWebhookEventStatus:', error.message);
        return false;
    }
}

/**
 * Gets recent webhook event logs for debugging
 * @param {number} limit - Number of logs to retrieve (default: 50)
 * @returns {Promise<Array<object>>} - Array of webhook event logs
 */
export async function getRecentWebhookLogs(limit = 50) {
    if (!supabase) {
        console.error('Supabase client not initialized for webhook logging');
        return [];
    }

    try {
        const { data, error } = await supabase
            .from('webhook_event_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error getting webhook logs:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getRecentWebhookLogs:', error.message);
        return [];
    }
}

/**
 * Cleans up old webhook logs (older than specified days)
 * @param {number} daysToKeep - Number of days to keep logs (default: 30)
 * @returns {Promise<number>} - Number of logs deleted
 */
export async function cleanupOldWebhookLogs(daysToKeep = 30) {
    if (!supabase) {
        console.error('Supabase client not initialized for webhook logging');
        return 0;
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const { data, error } = await supabase
            .from('webhook_event_logs')
            .delete()
            .lt('created_at', cutoffDate.toISOString())
            .select('id');

        if (error) {
            console.error('Error cleaning up webhook logs:', error);
            return 0;
        }

        const deletedCount = data ? data.length : 0;
        console.log(`[Webhook Cleanup] Deleted ${deletedCount} old webhook logs`);
        return deletedCount;
    } catch (error) {
        console.error('Error in cleanupOldWebhookLogs:', error.message);
        return 0;
    }
} 