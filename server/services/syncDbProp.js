import { Client } from "@notionhq/client";
import 'dotenv/config';
import pLimit from 'p-limit';
import { get_notion_access_token, parent_page_id } from './fetch-notion.js';




async function NotionInit(userId) {
    if (!userId) throw new Error("User ID required for NotionInit");
    try {
        const token = await get_notion_access_token(userId);
        if (!token) {
             throw new Error(`Notion access token not found for user ${userId}.`);
        }
        return { notion: new Client({ auth: token }), notionToken: token };
    } catch (error) {
        console.error(`Failed to initialize Notion client for user ${userId}:`, error.message);
        throw new Error(`Could not initialize Notion client for user ${userId}. Is the token saved and valid?`);
    }
}


async function createNotionPages(userId, webflowCollectionsStructure) {
    if (!userId) throw new Error("User ID required for createNotionPages");
    const { notion, notionToken } = await NotionInit(userId);

    // Use the passed argument
    if (!webflowCollectionsStructure || webflowCollectionsStructure.length === 0) {
        return [];
    }

    const parentId = await parent_page_id(notionToken); // This uses the token, doesn't need userId directly

    if (!parentId) {
        console.error("Could not determine Notion parent page ID. Cannot create pages.");
        return [];
    }

    const limit = pLimit(1); // Keep concurrency at 1

    // Use webflowCollectionsStructure here
    const pageCreationPromises = webflowCollectionsStructure.map(collection => limit(async () => {
        if (!collection.collectionId) {
            console.warn(`Skipping page creation for collection named '${collection.collectionName}' because it lacks a collectionId.`);
            return null;
        }

        const createPageAttempt = async (isRetry = false) => {
            try {
                const page = await notion.pages.create({
                    parent: { type: 'page_id', page_id: parentId },
                    properties: {
                        title: {
                            title: [{ text: { content: collection.collectionName } }]
                        }
                    }
                });
                return { page, collectionData: collection };
            } catch (error) {
                // Retry ONLY on conflict error, and only once
                if (!isRetry && error.code === 'conflict_error') {
                    console.warn(`⚠️ Conflict error creating page for ${collection.collectionName}. Retrying in 1.5s...`);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    // Return the result of the retry attempt
                    return await createPageAttempt(true);
                } else {
                    // Log other errors or the error after retry
                    console.error(`❌ Failed to create page for ${collection.collectionName}${isRetry ? ' on retry' : ''}:`, error.body ? JSON.stringify(error.body) : error.message);
                    return null; // Return null on final failure
                }
            }
        };

        let result = null;
        try {
            result = await createPageAttempt();
        } finally {
             // Keep a small delay even after successful creation or final failure
             // This helps prevent conflicts between subsequent unrelated attempts
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return result;

    })); // <-- End of limit wrapper

    // Wait for all limited promises to settle
    const createdPageResults = (await Promise.all(pageCreationPromises)).filter(Boolean);

    return createdPageResults; // Filter out nulls from failed attempts or skipped collections
}

function mapingFields(webflowFields) {
    const propertiesSchema = {};
    propertiesSchema["Name"] = { title: {} };
    
    // Add the Webflow Item ID property from the start
    propertiesSchema["Webflow Item ID"] = { rich_text: {} };

    // ADDED: Add Scheduled Publish Time property (Date type)
    propertiesSchema["Scheduled Publish Time"] = { date: {} };

    webflowFields.forEach(field => {
        const fieldType = field.type;
        const fieldName = field.displayName;

        if (!fieldName || fieldName === "Name" || fieldName === "Webflow Item ID" || fieldName === "Notion Page ID") return;
        if (propertiesSchema[fieldName]) {
             console.warn(`Duplicate property name detected: '${fieldName}'. Skipping subsequent definition.`);
             return;
        }

        let notionPropertyConfig = null;

        switch (fieldType) {
            case 'PlainText':
            case 'Color':
                notionPropertyConfig = { rich_text: {} };
                break;
            case 'RichText': // Handle RichText during schema creation
                notionPropertyConfig = { rich_text: {} }; // Create as placeholder
                break;
            case 'Number':
                notionPropertyConfig = { number: { format: field.validations?.format === 'integer' ? "number" : "number_with_commas" } };
                break;
            case 'DateTime':
                notionPropertyConfig = { date: {} };
                break;
            case 'Switch':
                 notionPropertyConfig = { checkbox: {} };
                 break;
            case 'Option': // Ensure options are mapped correctly
                const options = field.validations?.options?.map(opt => ({ name: opt.name })) || [];
                notionPropertyConfig = { select: { options: options } };
                break;
            case 'Set': // Ensure options are mapped correctly for multi-select
                 const multiOptions = field.validations?.options?.map(opt => ({ name: opt.name })) || [];
                 notionPropertyConfig = { multi_select: { options: multiOptions } };
                 break;
            case 'Reference':
            case 'MultiReference':
                 // REVERTING: Create as rich_text placeholder initially
                 notionPropertyConfig = { rich_text: {} }; 
                 break;
            case 'Link':
            case 'VideoLink':
                notionPropertyConfig = { url: {} };
                break;
            case 'Email':
                notionPropertyConfig = { email: {} };
                break;
            case 'Phone':
                notionPropertyConfig = { phone_number: {} };
                break;
            case 'Image':       // Updated based on user edits
            case 'MultiImage':  // Updated based on user edits
            case 'FileRef':
            case 'File':        // Add support for Webflow 'File' type
                 notionPropertyConfig = { files: {} };
                 break;
            default:
                if (!['SkuValues', 'Price', 'MultiExternalFile', 'MembershipPlan', 'TextOption', 'SkuSettings'].includes(fieldType)) { // MultiImage removed as it's handled now
                     console.warn(`Unsupported Webflow field type '${fieldType}' for field '${fieldName}'. Skipping.`);
                }
        }

        if (notionPropertyConfig) {
            propertiesSchema[fieldName] = notionPropertyConfig;
        }
    });

    return propertiesSchema;
}

// Accept userId and webflowCollectionsStructure as arguments
async function CreateDatabases(userId, webflowCollectionsStructure) {
    if (!userId) throw new Error("User ID required for CreateDatabases");
    
    const createdPageResults = await createNotionPages(userId, webflowCollectionsStructure);

    if (!createdPageResults || createdPageResults.length === 0) {
        console.log("No Notion pages created, skipping database creation.");
        return [];
    }

    const { notion } = await NotionInit(userId); // Get notion client instance for DB creation
    const limitDb = pLimit(1); 

    const databaseCreationPromises = createdPageResults.map(({ page, collectionData }) => limitDb(async () => {
        if (!page || !collectionData || !collectionData.collectionId) {
             console.warn("Skipping database creation due to missing page or collection data/ID.");
             return null;
        }

        const pageId = page.id;
        const dbTitle = collectionData.collectionName || `Database for ${collectionData.collectionId}`;
        const webflowFields = collectionData.fields;
        const webflowCollectionId = collectionData.collectionId;
        let propertiesSchema = {}; // Define here to be accessible in catch

        try {
            propertiesSchema = mapingFields(webflowFields); // Assign to outer scope variable

             if (Object.keys(propertiesSchema).length <= 1 && propertiesSchema["Name"]) {
                 console.warn(`Skipping database creation for '${dbTitle}' as no mappable fields were found besides 'Name'.`);
                 return null;
             }
             
            // Add the hardcoded "Sync Status" select property
            propertiesSchema["Status"] = {
                select: {
                    options: [
                        { name: "Draft", color: "gray" },
                        { name: "Published", color: "green" },
                        { name: "Scheduled", color: "blue" },
                        { name: "Queued to Publish", color: "blue" },
                        { name: "Draft Changes", color: "orange" },
                    ]
                }
            };

            // add a scheduled property
           

            // Now propertiesSchema includes both dynamic and hardcoded properties
            const database = await notion.databases.create({
                parent: { type: 'page_id', page_id: pageId },
                is_inline: true,
                title: [{ type: 'text', text: { content: dbTitle } }],
                properties: propertiesSchema,
            });

            // Return structured info including Webflow details needed later
            return {
                webflowCollectionId: webflowCollectionId,
                webflowFields: webflowFields, // Keep fields for relation linking
                notionDbId: database.id,
                notionDbName: dbTitle, // Capture the name used
                notionDbProperties: database.properties // Keep properties for later steps
            };
        } catch (error) {
            console.error(`❌ Failed to create database for '${dbTitle}' (from Webflow ID: ${webflowCollectionId}) inside page ${pageId}:`, error.body ? JSON.stringify(error.body) : error.message);
            return null;
        }
    }));

    const createdDatabasesInfo = (await Promise.all(databaseCreationPromises)).filter(Boolean);

    // --- REMOVE Save Created Database Info to Supabase logic --- 
    // if (createdDatabasesInfo.length > 0) { ... } block removed
    // ----------------------------------------------------------

    return createdDatabasesInfo; // Return the detailed info needed for subsequent steps
}

// --- Helper function findNotionDbIdForWebflowCollection ---
/**
 * Finds the Notion Database ID corresponding to a given Webflow Collection ID.
 * @param {string} targetWebflowCollectionId - The Webflow Collection ID to search for.
 * @param {Array<{webflowCollectionId: string, notionDbId: string}>} databaseMappings - Array of objects mapping Webflow Collection IDs to Notion DB IDs.
 * @returns {string | null} The corresponding Notion Database ID or null if not found.
 */
function findNotionDbIdForWebflowCollection(targetWebflowCollectionId, databaseMappings) {
    const mapping = databaseMappings.find(dbMap => dbMap.webflowCollectionId === targetWebflowCollectionId);
    return mapping ? mapping.notionDbId : null;
}

// Accept userId
// --- Modified function to link Notion Relation Properties --- (Focus on conversion)
async function linkNotionRelations(userId, createdDatabasesInfo) {
    if (!userId) throw new Error("User ID required for linkNotionRelations");
    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        return [];
    }

    let notion;
    try {
        // Pass userId to NotionInit
        ({ notion } = await NotionInit(userId));
    } catch (error) {
        console.error("Cannot link relations due to Notion client initialization failure:", error);
        return [];
    }

    const simpleMappings = createdDatabasesInfo.map(db => ({
        webflowCollectionId: db.webflowCollectionId,
        notionDbId: db.notionDbId
    }));

    const limitLink = pLimit(1); // Limit concurrent linking operations (Reduced from 3 to 1)

    const updatePromises = createdDatabasesInfo.map((dbInfo) => limitLink(async () => {
        const { notionDbId, webflowFields, notionDbProperties, webflowCollectionId } = dbInfo;
        const propertiesToUpdate = {};
        let relationsFoundCount = 0;
        let relationsLinkedCount = 0;
        let relationsFailedCount = 0;

        // Iterate through Webflow fields to find Reference/MultiReference types
        // These correspond to the rich_text placeholders we created earlier.
        for (const field of webflowFields) {
            if (field.type === 'Reference' || field.type === 'MultiReference') {
                const propName = field.displayName;

                // Check if the corresponding property in Notion is still a rich_text placeholder
                if (notionDbProperties[propName]?.type === 'rich_text') {
                    relationsFoundCount++;

                    const targetWfCollectionId = field.validations?.collectionId;
                    if (targetWfCollectionId) {
                        const targetNotionDbId = findNotionDbIdForWebflowCollection(targetWfCollectionId, simpleMappings);

                        if (targetNotionDbId) {
                            // Prepare update payload to CHANGE TYPE and LINK
                            propertiesToUpdate[propName] = {
                                // Explicitly define the new type and its configuration
                                type: "relation",
                                relation: {
                                    database_id: targetNotionDbId,
                                    // Set the relation type (single/dual). Defaulting to single.
                                    // TODO: Differentiate if Webflow MultiReference should be dual_property
                                    type: "single_property",
                                    single_property: {} // Required for single_property type
                                }
                                // We don't need to specify the original name/id here, just the new config.
                            };
                            relationsLinkedCount++;
                        } else {
                            console.warn(`    - ⚠️ Could not find target Notion DB for Webflow Collection ID '${targetWfCollectionId}'. Cannot convert/link placeholder '${propName}'.`);
                            relationsFailedCount++;
                        }
                    } else {
                        console.warn(`    - ⚠️ Webflow field '${propName}' (Type: ${field.type}) is missing target 'collectionId'. Cannot convert/link placeholder.`);
                        relationsFailedCount++;
                    }
                } else if (notionDbProperties[propName]?.type === 'relation') {
                    // Property already exists as a relation - maybe from a previous run?
                    // We could potentially add logic here to check if it's linked correctly, but for now, just note it.
                } else if (notionDbProperties[propName]) {
                    // Property exists but is neither rich_text nor relation - unexpected
                     console.warn(`    - ⚠️ Property '${propName}' exists but is unexpected type '${notionDbProperties[propName]?.type}'. Skipping conversion.`);
                     relationsFailedCount++;
                }
                // If notionDbProperties[propName] doesn't exist, mapingFields skipped it correctly.
            }
        }

        // If there are properties to update (convert/link)
        if (Object.keys(propertiesToUpdate).length > 0) {
            try {
                await notion.databases.update({
                    database_id: notionDbId,
                    properties: propertiesToUpdate,
                });
                return {
                    notionDbId,
                    status: 'success',
                    linked: relationsLinkedCount,
                    found: relationsFoundCount,
                    failed: relationsFailedCount
                };
            } catch (error) {
                console.error(`❌ Failed to update properties for database ${notionDbId}:`, error.body ? JSON.stringify(error.body) : error.message);
                 console.error("--- Update payload causing error: ---");
                 console.error(JSON.stringify(propertiesToUpdate, null, 2));
                 console.error("--- End Update Payload ---");
                return {
                    notionDbId,
                    status: 'error',
                    error: error.body ? JSON.stringify(error.body) : error.message,
                    linked: 0,
                    found: relationsFoundCount,
                    failed: relationsFoundCount
                 };
            }
        } else if (relationsFoundCount > 0) {
             // Placeholders found, but none could be converted (e.g., missing targets)
             return {
                notionDbId,
                status: 'skipped',
                linked: 0,
                found: relationsFoundCount,
                failed: relationsFailedCount
            };
        } else {
             return null;
        }
    })); // <-- End of limitLink wrapper

    // Wait for all update attempts and filter out nulls (where no action was needed)
    const updateResults = (await Promise.all(updatePromises)).filter(Boolean);

    // Optional: Provide a summary of the linking process
    const summary = updateResults.reduce((acc, result) => {
        acc.totalFound += result.found || 0;
        acc.totalLinked += result.linked || 0;
        acc.totalFailedAttempt += result.failed || 0;
        if (result.status === 'error') acc.databasesErrored += 1;
        if (result.status === 'success') acc.databasesUpdated += 1;
        if (result.status === 'skipped') acc.databasesSkipped += 1;
        return acc;
    }, { totalFound: 0, totalLinked: 0, totalFailedAttempt: 0, databasesUpdated: 0, databasesErrored: 0, databasesSkipped: 0 });

    return updateResults; // Return the detailed results
}

// Update exports if needed
export { NotionInit, createNotionPages, mapingFields, linkNotionRelations, CreateDatabases }; 