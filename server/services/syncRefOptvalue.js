import pLimit from 'p-limit';
import { NotionInit } from './syncDbProp.js';

// Placeholder function to sync reference and option values
// This will need the database mappings and a map of Webflow Item IDs to Notion Page IDs

/**
 * Synchronizes the selected values for Webflow **Reference** and **MultiReference**
 * fields to the corresponding Notion **Relation** properties.
 * 
 * Requires that initial page sync has run and provides an ID map.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {Array<object>} createdDatabasesInfo - Array containing info about linked Notion DBs and Webflow Collections (including schemas).
 * @param {Map<string, string>} webflowItemToNotionPageMap - A Map where keys are Webflow Item IDs and values are corresponding Notion Page IDs.
 * @param {object} allWebflowItemsByCollection - Object where keys are Webflow Collection IDs and values are arrays of Webflow items for that collection.
 * @returns {Promise<{success: boolean, updatedRelations: number, failedUpdates: number, message?: string}>} - Sync status and stats.
 */
export async function syncRelationValues(userId, createdDatabasesInfo, webflowItemToNotionPageMap, allWebflowItemsByCollection) {
    if (!userId) throw new Error("User ID required for syncRelationValues");
    let stats = { success: true, updatedRelations: 0, failedUpdates: 0 }; // Stats specific to relations

    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.warn("[syncRelationValues] No database info provided. Skipping relation value sync.");
        return { ...stats, success: false, message: "No database info provided." };
    }
    if (!webflowItemToNotionPageMap || webflowItemToNotionPageMap.size === 0) {
        console.warn("[syncRelationValues] Webflow Item ID -> Notion Page ID map is missing or empty. Cannot sync relations. Skipping.");
        return { ...stats, success: false, message: "ID map not provided." };
    }
     if (!allWebflowItemsByCollection || Object.keys(allWebflowItemsByCollection).length === 0) {
        console.warn("[syncRelationValues] Webflow item data is missing or empty. Skipping relation value sync.");
        return { ...stats, success: false, message: "Webflow item data not provided." };
    }

    let notion;
    try {
        ({ notion } = await NotionInit(userId));
    } catch (error) {
        console.error("[syncRelationValues] Failed to initialize Notion client for relation value sync:", error);
        return { ...stats, success: false, message: "Notion client init failed." };
    }

    const limit = pLimit(2); // Notion API concurrency limit

    // --- Main Logic Loop --- 
    const allSyncPromises = createdDatabasesInfo.flatMap(dbInfo => {
        const { notionDbId, webflowCollectionId, webflowFields /* Removed notionDbProperties */ } = dbInfo;
        const itemsInCollection = allWebflowItemsByCollection[webflowCollectionId];

        if (!itemsInCollection || itemsInCollection.length === 0) {
            return []; // No items to process for this DB
        }

        // Fetch current DB properties *before* processing items for this DB
        let currentNotionDbProperties = {}; // Default to empty object
        const fetchDbInfoPromise = notion.databases.retrieve({ database_id: notionDbId })
            .then(dbData => {
                currentNotionDbProperties = dbData.properties || {};
            })
            .catch(err => {
                console.error(`[syncRelationValues] Failed to retrieve DB schema for ${notionDbId}. Relation sync for this DB might fail.`, err.body || err.message);
                // Keep currentNotionDbProperties as {} if fetch fails
            });

        return itemsInCollection.map(item => limit(async () => {
            // Ensure DB info fetch is complete before processing item
            await fetchDbInfoPromise;

            const webflowItemId = item.id;
            const webflowItemFieldData = item.fieldData || item;
            const notionPageId = webflowItemToNotionPageMap.get(webflowItemId);

            if (!notionPageId) {
                return; // Cannot update if we don't know the page ID
            }

            const propertiesToUpdate = {};
            let relationsUpdatedOnThisPage = 0;

            // Loop through Webflow fields schema for this collection
            for (const wfField of webflowFields) {

                // --- Handle ONLY Relations (Reference / MultiReference) ---
                if (wfField.type === 'Reference' || wfField.type === 'MultiReference') {
                    const notionPropName = wfField.displayName;
                    const wfFieldSlug = wfField.slug;
                    const wfValue = webflowItemFieldData[wfFieldSlug];
                    // Use the freshly fetched properties
                    const notionPropConfig = currentNotionDbProperties[notionPropName]; 

                    if (!notionPropConfig) {
                        // Log if property is missing in the *current* schema (it shouldn't be if linkRelations worked)
                        console.warn(`[syncRelationValues] Page ${notionPageId}, Field '${notionPropName}': Corresponding property not found in current Notion DB schema for ${notionDbId}.`);
                        continue; 
                    }

                    // REMOVED: Debug log checking stale notionPropConfig
                    // console.log(`[Debug Relations Check] Page ${notionPageId}, Field '${notionPropName}', NotionPropConfig:`, notionPropConfig);

                    if (notionPropConfig.type === 'relation') {
                        // 1. Get target Webflow Item IDs from the current item's field value
                        let targetWebflowItemIds = []; // Initialize as empty
                        if (Array.isArray(wfValue)) {
                            // MultiReference case
                            targetWebflowItemIds = wfValue;
                        } else if (typeof wfValue === 'string' && wfValue.trim()) {
                            // Single Reference case (handle non-empty string ID)
                            targetWebflowItemIds = [wfValue]; 
                        }
                        // If wfValue is null, undefined, empty string etc., targetWebflowItemIds remains []
                        
                        console.log(`[Debug Relations] Page ${notionPageId}, Field '${notionPropName}': Found Target WF Item IDs:`, targetWebflowItemIds);

                        // 2. Map Webflow Item IDs to Notion Page IDs using the pre-generated map
                        const targetNotionPageIds = targetWebflowItemIds
                            .map(wfId => webflowItemToNotionPageMap.get(wfId)) // Lookup each ID
                            .filter(Boolean); // Remove any nulls/undefined (if lookup failed)
                        console.log(`[Debug Relations] Page ${notionPageId}, Field '${notionPropName}': Mapped Notion Page IDs:`, targetNotionPageIds);

                        // 3. Prepare the Notion relation update payload
                        propertiesToUpdate[notionPropName] = {
                            relation: targetNotionPageIds.map(id => ({ id }))
                        };
                        relationsUpdatedOnThisPage++;

                        if (targetWebflowItemIds.length > 0 && targetNotionPageIds.length !== targetWebflowItemIds.length) {
                             const missingWfIds = targetWebflowItemIds.filter(id => !webflowItemToNotionPageMap.has(id));
                             console.warn(`[Sync Warning] Page ${notionPageId}, Field '${notionPropName}': Could not find Notion pages for some linked Webflow items: ${missingWfIds.join(', ')}. Relation might be incomplete.`);
                        }
                    } else {
                         // console.warn(`Skipping relation value update for '${notionPropName}' on page ${notionPageId}: Notion property type is ${notionPropConfig.type}, expected 'relation'.`);
                    }
                }
                // End of Relation Handling
            } // End loop through Webflow fields
            
            // --- Update Notion Page if needed ---
            if (Object.keys(propertiesToUpdate).length > 0) {
                try {
                    await notion.pages.update({
                        page_id: notionPageId,
                        properties: propertiesToUpdate,
                    });
                    
                    if (relationsUpdatedOnThisPage > 0) stats.updatedRelations += relationsUpdatedOnThisPage;
                } catch (error) {
                    console.error(`[syncRelationValues] Failed to update relation values for Notion page ${notionPageId}:`, error.body ? JSON.stringify(error.body) : error.message);
                    console.error(`   -> Failing payload: ${JSON.stringify(propertiesToUpdate)}`);
                    stats.failedUpdates++;
                }
            }
        })); // End limit wrapper for item
    }); // End flatMap for databases    

    // --- Wait for all updates --- 
    try {
        await Promise.all(allSyncPromises);
    } catch (error) {
        console.error("[syncRelationValues] Error occurred during final Promise.all for relation sync updates:", error);
        stats.success = false;
        stats.message = "Error executing relation sync updates.";
    }

    return stats;
}

/**
 * Synchronizes the selected values for Webflow **Option** and **Set** fields 
 * to the corresponding Notion **Select** and **Multi-Select** properties.
 * 
 * Requires that initial page sync has run and provides an ID map.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {Array<object>} createdDatabasesInfo - Array containing info about linked Notion DBs and Webflow Collections (including schemas).
 * @param {Map<string, string>} webflowItemToNotionPageMap - A Map where keys are Webflow Item IDs and values are corresponding Notion Page IDs.
 * @param {object} allWebflowItemsByCollection - Object where keys are Webflow Collection IDs and values are arrays of Webflow items for that collection.
 * @returns {Promise<{success: boolean, updatedOptions: number, failedUpdates: number, message?: string}>} - Sync status and stats.
 */
export async function syncReferenceAndOptionValues(userId, createdDatabasesInfo, webflowItemToNotionPageMap, allWebflowItemsByCollection) {
    if (!userId) throw new Error("User ID required for syncReferenceAndOptionValues");
    // Modified Stats: Only tracks Options
    let stats = { success: true, updatedOptions: 0, failedUpdates: 0 }; 

    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.warn("[syncReferenceAndOptionValues] No database info provided. Skipping option value sync.");
        return { ...stats, success: false, message: "No database info provided." };
    }
    // Removed map check as it's not strictly needed for Options-only sync
    // if (!webflowItemToNotionPageMap || webflowItemToNotionPageMap.size === 0) { ... }
     if (!allWebflowItemsByCollection || Object.keys(allWebflowItemsByCollection).length === 0) {
        console.warn("[syncReferenceAndOptionValues] Webflow item data is missing or empty. Skipping option value sync.");
        return { ...stats, success: false, message: "Webflow item data not provided." };
    }

    let notion;
    try {
        ({ notion } = await NotionInit(userId));
    } catch (error) {
        console.error("[syncReferenceAndOptionValues] Failed to initialize Notion client for option value sync:", error);
        return { ...stats, success: false, message: "Notion client init failed." };
    }

    const limit = pLimit(2); // Notion API concurrency limit

    // --- Main Logic Loop --- 
    const allSyncPromises = createdDatabasesInfo.flatMap(dbInfo => {
        const { notionDbId, webflowCollectionId, webflowFields, notionDbProperties } = dbInfo;
        const itemsInCollection = allWebflowItemsByCollection[webflowCollectionId];

        if (!itemsInCollection || itemsInCollection.length === 0) {
            return []; // No items to process for this DB
        }

        return itemsInCollection.map(item => limit(async () => {
            const webflowItemId = item.id;
            const webflowItemFieldData = item.fieldData || item;
            // Get notionPageId even if not strictly needed for options, for logging context
            const notionPageId = webflowItemToNotionPageMap?.get(webflowItemId) || 'unknown'; 

            const propertiesToUpdate = {};
            let optionsUpdatedOnThisPage = 0;

            // Loop through Webflow fields schema for this collection
            for (const wfField of webflowFields) {
                // ADDED: Log the field being processed and its type
                console.log(`[Debug Field Loop - Options] Page ${notionPageId}, Processing WF Field: '${wfField.displayName}', Type: '${wfField.type}'`);

                const notionPropName = wfField.displayName;
                const wfFieldSlug = wfField.slug;
                const wfValue = webflowItemFieldData[wfFieldSlug];
                const notionPropConfig = notionDbProperties[notionPropName]; // Get Notion property config

                if (!notionPropConfig) continue; // Skip if no corresponding Notion property

                // --- Handle Select (Option) ---
                if (wfField.type === 'Option') { // Changed from else if
                    if (notionPropConfig.type === 'select') {
                        // wfValue is the selected Webflow Option ID (e.g., '7b6f...')
                        const selectedWfOptionId = typeof wfValue === 'string' ? wfValue.trim() : null;
                        let notionSelectOption = null;
                        let targetNotionOptionName = null;

                        if (selectedWfOptionId) {
                            // 1. Find the corresponding Webflow Option Name using the ID
                            const webflowFieldDefinition = wfField; // The full field definition including validations
                            const webflowOption = webflowFieldDefinition.validations?.options?.find(
                                opt => opt.id === selectedWfOptionId
                            );

                            if (webflowOption) {
                                const webflowOptionName = webflowOption.name;
                                // 2. Find the matching Notion Select option by NAME
                                if (webflowOptionName && notionPropConfig.select.options) {
                                    notionSelectOption = notionPropConfig.select.options.find(
                                        opt => opt.name.toLowerCase() === webflowOptionName.toLowerCase()
                                    );
                                    if (notionSelectOption) {
                                        targetNotionOptionName = notionSelectOption.name; // Use the exact Notion name
                                    }
                                }
                            } else {
                                console.warn(`[Sync Warning] Page ${notionPageId}, Field '${notionPropName}': Could not find Webflow option definition for ID '${selectedWfOptionId}' in field schema.`);
                            }
                        }

                        // 3. Prepare the update payload for Notion
                        propertiesToUpdate[notionPropName] = {
                            select: targetNotionOptionName ? { name: targetNotionOptionName } : null
                        };
                        optionsUpdatedOnThisPage++;

                        // Update warning logic to check if the name was found
                        if (selectedWfOptionId && !targetNotionOptionName) {
                             console.warn(`[Sync Warning] Page ${notionPageId}, Field '${notionPropName}': Could not find matching Notion Select option for Webflow option ID '${selectedWfOptionId}' (Name lookup failed or Notion option missing).`);
                        }
                    } else {
                         // console.warn(`Skipping select value update for '${notionPropName}' on page ${notionPageId}: Notion property type is ${notionPropConfig.type}, expected 'select'.`);
                    }
                }
                // TODO: Add handling for 'Set' -> 'multi_select' if needed
            } // End loop through Webflow fields
            
            // --- Update Notion Page if needed ---
            if (Object.keys(propertiesToUpdate).length > 0) {
                try {
                    await notion.pages.update({
                        page_id: notionPageId,
                        properties: propertiesToUpdate,
                    });
                    
                    // Only increment options stats
                    if (optionsUpdatedOnThisPage > 0) stats.updatedOptions += optionsUpdatedOnThisPage; 
                } catch (error) {
                    console.error(`[syncReferenceAndOptionValues] Failed to update option values for Notion page ${notionPageId}:`, error.body ? JSON.stringify(error.body) : error.message);
                    console.error(`   -> Failing payload: ${JSON.stringify(propertiesToUpdate)}`);
                    stats.failedUpdates++;
                }
            }
        })); // End limit wrapper for item
    }); // End flatMap for databases    

    // --- Wait for all updates --- 
    try {
        await Promise.all(allSyncPromises);
    } catch (error) {
        console.error("[syncReferenceAndOptionValues] Error occurred during final Promise.all for option sync updates:", error);
        stats.success = false;
        stats.message = "Error executing option sync updates.";
    }

    return stats;
}
