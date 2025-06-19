import { CreateDatabases, linkNotionRelations } from './syncDbProp.js';
import { syncWebflowItemsToNotionPages } from './syncDbPages.js';
import { syncReferenceAndOptionValues, syncRelationValues } from './syncRefOptvalue.js';
import { fetchAllWebflowData } from './fetch-webflow.js';
import { get_integration_by_id, save_collection_mappings } from '../database/save-notionInfo.js';

/**
 * Runs the full Webflow -> Notion synchronization process for a specific integration.
 * 1. Fetches the integration details and validates access.
 * 2. Fetches Webflow data for the specific site in the integration.
 * 3. Creates Notion databases based on Webflow collections.
 * 4. Links relation properties between the created databases.
 * 5. Syncs Webflow items into the corresponding Notion database pages.
 * 6. Syncs Reference/MultiReference values (Relations).
 * 7. Syncs Option/Set values (Select/MultiSelect).
 * 8. Updates the collection mappings in the database.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {number} integrationId - The ID of the site integration to sync.
 * @returns {Promise<{success: boolean, message: string, error?: any, databasesCreated?: number, pageSyncStats?: object, relationSyncStats?: object, optionSyncStats?: object}>}
 */
export async function runIntegrationSync(userId, integrationId) {
    if (!userId) {
        console.error("User ID is required to run the sync process.");
         return { success: false, message: "User ID not provided.", error: new Error("User ID missing") };
    }

    if (!integrationId) {
        console.error("Integration ID is required to run the sync process.");
        return { success: false, message: "Integration ID not provided.", error: new Error("Integration ID missing") };
    }

    let createdDatabasesInfo = [];

    try {
        // Step 0: Get integration details and validate user access
        const integration = await get_integration_by_id(userId, integrationId);
        if (!integration) {
            return { success: false, message: "Integration not found or access denied.", error: new Error("Integration not found") };
        }

        console.log(`Starting sync for integration: ${integration.integration_name || integration.id}`);

        // Step 1: Fetch Webflow Data for this specific site
        const allWebflowData = await fetchAllWebflowData(userId);

        if (!allWebflowData || allWebflowData.length === 0) {
            console.log("No Webflow data found to sync for this integration.");
            return { success: true, message: "Sync finished: No Webflow data found.", databasesCreated: 0 };
        }

        // Prepare the items map needed later
        const allWebflowItemsByCollection = allWebflowData.reduce((acc, colData) => {
            acc[colData.collectionId] = colData.items || [];
            return acc;
        }, {});

        // Step 2: Create Databases in the integration's Notion workspace
        const webflowCollectionsStructure = allWebflowData.map(col => ({
            collectionId: col.collectionId,
            collectionName: col.collectionName,
            fields: col.fields
        }));
        
        createdDatabasesInfo = await CreateDatabases(userId, webflowCollectionsStructure);

        if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
             console.log("No databases were created (or needed creation). Ending sync process.");
             return { success: true, message: "Sync finished: No databases created.", databasesCreated: 0 };
        }

        // Step 3: Save collection mappings to the database
        try {
            const mappings = createdDatabasesInfo.map(dbInfo => ({
                webflow_collection_id: dbInfo.webflowCollectionId,
                webflow_collection_name: dbInfo.webflowCollectionName,
                notion_database_id: dbInfo.notionDbId,
                notion_database_name: dbInfo.notionDbName,
                is_active: true
            }));
            
            await save_collection_mappings(integrationId, mappings);
            console.log(`Saved ${mappings.length} collection mappings for integration ${integrationId}`);
        } catch (saveError) {
            console.error(`Error saving collection mappings for integration ${integrationId}:`, saveError);
        }

        // Step 4: Link Relations (Schema level)
        await linkNotionRelations(userId, createdDatabasesInfo);

        // Step 5: Sync Items to Pages
        const pageSyncResult = await syncWebflowItemsToNotionPages(userId, createdDatabasesInfo, allWebflowData);
        const webflowItemToNotionPageMap = pageSyncResult.webflowItemToNotionPageMap;

        // Initialize stats objects
        let relationSyncStats = null;
        let optionSyncStats = null;

        if (webflowItemToNotionPageMap && webflowItemToNotionPageMap.size > 0) {
            // Step 6a: Sync Relation Values
            console.log("Starting Step 6a: Syncing Relation values...");
            relationSyncStats = await syncRelationValues(
                userId,
                createdDatabasesInfo,
                webflowItemToNotionPageMap,
                allWebflowItemsByCollection
            );
            console.log("Finished Step 6a.", relationSyncStats);

            // Step 6b: Sync Option Values
            console.log("Starting Step 6b: Syncing Option/Select values...");
            optionSyncStats = await syncReferenceAndOptionValues(
                userId,
                createdDatabasesInfo,
                webflowItemToNotionPageMap, 
                allWebflowItemsByCollection
            );
            console.log("Finished Step 6b.", optionSyncStats);

        } else {
            console.warn("Skipping Steps 6a & 6b (Relation/Option Value Sync) because the Webflow Item ID -> Notion Page ID map was not generated or is empty.");
        }

        return { 
            success: true, 
            message: `Sync completed successfully for integration: ${integration.integration_name || integration.id}`, 
            integrationId: integrationId,
            databasesCreated: createdDatabasesInfo.length,
            pageSyncStats: pageSyncResult, 
            relationSyncStats: relationSyncStats,
            optionSyncStats: optionSyncStats
        };

    } catch (error) {
        console.error("An error occurred during the integration sync process:", error);
        const dbCount = Array.isArray(createdDatabasesInfo) ? createdDatabasesInfo.length : 0;
        return { 
            success: false, 
            message: `Sync failed: ${error.message}`,
            error: error,
            integrationId: integrationId,
            databasesCreated: dbCount
        }; 
    }
}

/**
 * @deprecated Use runIntegrationSync instead. This function is kept for backward compatibility.
 */
export async function runFullSyncProcess(userId) {
    console.warn("DEPRECATED: runFullSyncProcess is deprecated. Use runIntegrationSync with a specific integration ID instead.");
    return {
        success: false,
        message: "This function is deprecated. Use runIntegrationSync with a specific integration ID instead."
    };
}

/**
 * Runs synchronization for only the selected collections.
 * This function filters Webflow data to include only the specified collection IDs.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {Array<string>} selectedCollectionIds - Array of Webflow collection IDs to sync.
 * @returns {Promise<{success: boolean, message: string, error?: any, databasesCreated?: number, pageSyncStats?: object, relationSyncStats?: object, optionSyncStats?: object}>}
 */
export async function runSelectedCollectionsSync(userId, selectedCollectionIds) {
    if (!userId) {
        console.error("User ID is required to run the sync process.");
        return { success: false, message: "User ID not provided.", error: new Error("User ID missing") };
    }

    if (!selectedCollectionIds || !Array.isArray(selectedCollectionIds) || selectedCollectionIds.length === 0) {
        console.error("Selected collection IDs are required to run the sync process.");
        return { success: false, message: "No collections selected for sync.", error: new Error("Selected collections missing") };
    }

    let createdDatabasesInfo = [];

    try {
        console.log(`Starting sync for selected collections: ${selectedCollectionIds.join(', ')}`);

        // Step 1: Fetch ALL Webflow Data first
        const allWebflowData = await fetchAllWebflowData(userId);

        if (!allWebflowData || allWebflowData.length === 0) {
            console.log("No Webflow data found to sync.");
            return { success: true, message: "Sync finished: No Webflow data found.", databasesCreated: 0 };
        }

        // Step 2: Filter Webflow data to include only selected collections
        const filteredWebflowData = allWebflowData.filter(colData => 
            selectedCollectionIds.includes(colData.collectionId)
        );

        if (filteredWebflowData.length === 0) {
            console.log("None of the selected collections were found in Webflow data.");
            return { success: false, message: "Selected collections not found in Webflow data.", error: new Error("Collections not found") };
        }

        console.log(`Filtered to ${filteredWebflowData.length} collections out of ${allWebflowData.length} total collections`);

        // Prepare the items map needed later (only for selected collections)
        const allWebflowItemsByCollection = filteredWebflowData.reduce((acc, colData) => {
            acc[colData.collectionId] = colData.items || [];
            return acc;
        }, {});

        // Step 3: Create Databases in Notion workspace (only for selected collections)
        const webflowCollectionsStructure = filteredWebflowData.map(col => ({
            collectionId: col.collectionId,
            collectionName: col.collectionName,
            fields: col.fields
        }));
        
        createdDatabasesInfo = await CreateDatabases(userId, webflowCollectionsStructure);

        if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
            console.log("No databases were created (or needed creation). Ending sync process.");
            return { success: true, message: "Sync finished: No databases created.", databasesCreated: 0 };
        }

        // Step 4: Link Relations (Schema level)
        await linkNotionRelations(userId, createdDatabasesInfo);

        // Step 5: Sync Items to Pages (only for selected collections)
        const pageSyncResult = await syncWebflowItemsToNotionPages(userId, createdDatabasesInfo, filteredWebflowData);
        const webflowItemToNotionPageMap = pageSyncResult.webflowItemToNotionPageMap;

        // Initialize stats objects
        let relationSyncStats = null;
        let optionSyncStats = null;

        if (webflowItemToNotionPageMap && webflowItemToNotionPageMap.size > 0) {
            // Step 6a: Sync Relation Values
            console.log("Starting Step 6a: Syncing Relation values...");
            relationSyncStats = await syncRelationValues(
                userId,
                createdDatabasesInfo,
                webflowItemToNotionPageMap,
                allWebflowItemsByCollection
            );
            console.log("Finished Step 6a.", relationSyncStats);

            // Step 6b: Sync Option Values
            console.log("Starting Step 6b: Syncing Option/Select values...");
             optionSyncStats = await syncReferenceAndOptionValues(
                 userId,
                 createdDatabasesInfo,
                 webflowItemToNotionPageMap, 
                 allWebflowItemsByCollection
             );
            console.log("Finished Step 6b.", optionSyncStats);

        } else {
            console.warn("Skipping Steps 6a & 6b (Relation/Option Value Sync) because the Webflow Item ID -> Notion Page ID map was not generated or is empty.");
        }

        return { 
            success: true, 
            message: `Sync completed successfully for ${createdDatabasesInfo.length} selected collection(s)`, 
            selectedCollections: selectedCollectionIds,
            databasesCreated: createdDatabasesInfo.length,
            pageSyncStats: pageSyncResult, 
            relationSyncStats: relationSyncStats,
            optionSyncStats: optionSyncStats
        };

    } catch (error) {
        console.error("An error occurred during the selected collections sync process:", error);
        const dbCount = Array.isArray(createdDatabasesInfo) ? createdDatabasesInfo.length : 0;
        return { 
            success: false, 
            message: `Sync failed: ${error.message}`,
            error: error,
            selectedCollections: selectedCollectionIds,
            databasesCreated: dbCount
        }; 
    }
} 