import { CreateDatabases, linkNotionRelations } from './syncDbProp.js';
import { syncWebflowItemsToNotionPages } from './syncDbPages.js';
import { syncReferenceAndOptionValues, syncRelationValues } from './syncRefOptvalue.js';
import { fetchAllWebflowData } from './fetch-webflow.js';
import { save_notion_db_info } from '../database/save-notionInfo.js';

/**
 * Runs the full Webflow -> Notion synchronization process for a specific user.
 * 1. Fetches all Webflow data for the user.
 * 2. Creates Notion databases based on Webflow collections.
 * 3. Links relation properties between the created databases.
 * 4. Syncs Webflow items into the corresponding Notion database pages.
 * 5. Syncs Reference/MultiReference values (Relations).
 * 6. Syncs Option/Set values (Select/MultiSelect).
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @returns {Promise<{success: boolean, message: string, error?: any, databasesCreated?: number, pageSyncStats?: object, relationSyncStats?: object, optionSyncStats?: object}>}
 */
export async function runFullSyncProcess(userId) {
    if (!userId) {
         console.error("User ID is required to run the full sync process.");
         return { success: false, message: "User ID not provided.", error: new Error("User ID missing") };
    }
    let createdDatabasesInfo = [];

    try {
        // Step 0: Fetch ALL Webflow Data Once - Pass userId
        const allWebflowData = await fetchAllWebflowData(userId);

        if (!allWebflowData || allWebflowData.length === 0) {
            console.log("No Webflow data found to sync.");
        }

        // Prepare the items map needed later (can be derived from allWebflowData)
        const allWebflowItemsByCollection = allWebflowData.reduce((acc, colData) => {
            acc[colData.collectionId] = colData.items || [];
            return acc;
        }, {});

        // Step 1: Create Databases - Pass userId
        const webflowCollectionsStructure = allWebflowData.map(col => ({
            collectionId: col.collectionId,
            collectionName: col.collectionName,
            fields: col.fields
        }));
        createdDatabasesInfo = await CreateDatabases(userId, webflowCollectionsStructure);

        // --- Step 1.5: Save DB Mappings to Supabase --- 
        try {
             await save_notion_db_info(userId, createdDatabasesInfo);
        } catch (saveError) {
             console.error(`Error saving Notion DB mappings to Supabase for user ${userId}:`, saveError);
        }
        // -------------------------------------------

        if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
             console.log("No databases were created (or needed creation). Ending sync process.");
             return { success: true, message: "Sync finished: No databases created.", databasesCreated: 0 };
        }

        // Step 2: Link Relations (Schema level) - Pass userId
        await linkNotionRelations(userId, createdDatabasesInfo);

        // Step 3: Sync Items to Pages - Pass userId
        const pageSyncResult = await syncWebflowItemsToNotionPages(userId, createdDatabasesInfo, allWebflowData);
        const webflowItemToNotionPageMap = pageSyncResult.webflowItemToNotionPageMap;

        // Initialize stats objects
        let relationSyncStats = null;
        let optionSyncStats = null;

        if (webflowItemToNotionPageMap && webflowItemToNotionPageMap.size > 0) {
            // Step 4a: Sync Relation Values
            console.log("Starting Step 4a: Syncing Relation values...");
            relationSyncStats = await syncRelationValues(
                userId,
                createdDatabasesInfo,
                webflowItemToNotionPageMap,
                allWebflowItemsByCollection
            );
             console.log("Finished Step 4a.", relationSyncStats);

            // Step 4b: Sync Option Values (using the renamed function)
             console.log("Starting Step 4b: Syncing Option/Select values...");
             optionSyncStats = await syncReferenceAndOptionValues(
                 userId,
                 createdDatabasesInfo,
                 webflowItemToNotionPageMap, 
                 allWebflowItemsByCollection
             );
              console.log("Finished Step 4b.", optionSyncStats);

        } else {
            console.warn("Skipping Steps 4a & 4b (Relation/Option Value Sync) because the Webflow Item ID -> Notion Page ID map was not generated or is empty.");
        }

        return { 
            success: true, 
            message: "Sync completed successfully.", 
            databasesCreated: createdDatabasesInfo.length,
            pageSyncStats: pageSyncResult, 
            relationSyncStats: relationSyncStats,
            optionSyncStats: optionSyncStats
        };

    } catch (error) {
        console.error("An error occurred during the full sync process orchestration:", error);
        const dbCount = Array.isArray(createdDatabasesInfo) ? createdDatabasesInfo.length : 0;
        return { 
            success: false, 
            message: `Sync failed: ${error.message}`,
            error: error,
            databasesCreated: dbCount
        }; 
    }
} 