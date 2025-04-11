import { Client } from "@notionhq/client";
import 'dotenv/config';
import pLimit from 'p-limit';
import { getCollectionFields, getCollectionItems } from './fetch-webflow.js';
import { save_access_token, get_notion_access_token, parent_page_id } from './fetch-notion.js';
import { syncWebflowItemsToNotionPages } from './syncNotionPages.js';



async function NotionInit() {
    try {
        const token = await get_notion_access_token();
        if (!token) {
             throw new Error("Notion access token not found.");
        }
        return { notion: new Client({ auth: token }), notionToken: token };
    } catch (error) {
        console.error("Failed to initialize Notion client:", error.message);
        // Rethrow or handle appropriately depending on desired application behavior
        throw new Error("Could not initialize Notion client. Is the token saved and valid?");
    }
}




export async function createNotionPages() {
    const { notion, notionToken } = await NotionInit();
    let collectionFields;
    try {
        collectionFields = await getCollectionFields();
    } catch (error) {
        console.error("Failed to get Webflow collection fields:", error);
        return []; // Stop if we can't get Webflow info
    }


    if (!collectionFields || collectionFields.length === 0) {
        console.log("No Webflow collections found to create pages for.");
        return [];
    }

    const parentId = await parent_page_id(notionToken); // Assuming this handles potential errors

    if (!parentId) {
        console.error("Could not determine Notion parent page ID. Cannot create pages.");
        return [];
    }

    console.log(`Creating Notion pages under parent ID: ${parentId}`);

    const limit = pLimit(1); // Keep concurrency at 1

    const pageCreationPromises = collectionFields.map(collection => limit(async () => {
        if (!collection.collectionId) {
            console.warn(`Skipping page creation for collection named '${collection.collectionName}' because it lacks a collectionId.`);
            return null;
        }

        const createPageAttempt = async (isRetry = false) => {
            try {
                console.log(`Attempting to create page for: ${collection.collectionName} (Webflow ID: ${collection.collectionId})${isRetry ? ' (Retry)' : ''}`);
                const page = await notion.pages.create({
                    parent: { type: 'page_id', page_id: parentId },
                    properties: {
                        title: {
                            title: [{ text: { content: collection.collectionName } }]
                        }
                    }
                });
                console.log(`✅ Created Notion page for ${collection.collectionName} (ID: ${page.id})`);
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

    webflowFields.forEach(field => {
        const fieldType = field.type;
        const fieldName = field.displayName;

        if (!fieldName || fieldName === "Name") return;
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
                console.log(`   -> Mapping field '${fieldName}' (Type: ${fieldType}) as temporary rich_text during DB creation.`);
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
                 // Create as rich_text placeholder to avoid validation errors
                 console.log(`   -> Mapping field '${fieldName}' (Type: ${fieldType}) as temporary rich_text.`);
                 notionPropertyConfig = { rich_text: {} }; // Placeholder!
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




export async function CreateDatabases() {
    const { notion } = await NotionInit();

    const createdPageResults = await createNotionPages();

    if (!createdPageResults || createdPageResults.length === 0) {
        console.log("No parent pages were created (or Webflow collections found), cannot create databases.");
        return [];
    }

    console.log(`Proceeding to create databases inside ${createdPageResults.length} created pages...`);

    const limitDb = pLimit(1); // Limit concurrent DB creations (Reduced from 3 to 1)

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
            console.log(`Mapping properties for database '${dbTitle}' (from Webflow ID: ${webflowCollectionId}) inside page ${pageId}...`);
            propertiesSchema = mapingFields(webflowFields); // Assign to outer scope variable

             if (Object.keys(propertiesSchema).length <= 1 && propertiesSchema["Name"]) {
                 console.warn(`Skipping database creation for '${dbTitle}' as no mappable fields were found besides 'Name'.`);
                 return null;
             }

            console.log(`Creating database '${dbTitle}' inside page ${pageId}...`);

            const database = await notion.databases.create({
                parent: { type: 'page_id', page_id: pageId },
                is_inline: true,
                title: [{ type: 'text', text: { content: dbTitle } }],
                properties: propertiesSchema,
            });
            console.log(`✅ Created database '${dbTitle}' (ID: ${database.id}) linked to Webflow Collection ${webflowCollectionId}`);
            return {
                webflowCollectionId: webflowCollectionId,
                webflowFields: webflowFields,
                notionDbId: database.id,
                notionDbProperties: database.properties
            };
        } catch (error) {
            console.error(`❌ Failed to create database for '${dbTitle}' (from Webflow ID: ${webflowCollectionId}) inside page ${pageId}:`, error.body ? JSON.stringify(error.body) : error.message);
            // Log the properties schema that caused the error
            console.error("--- Schema causing error: ---");
            console.error(JSON.stringify(propertiesSchema, null, 2));
            console.error("--- End Schema ---");
            return null;
        }
    }));

    const createdDatabasesInfo = (await Promise.all(databaseCreationPromises)).filter(Boolean);
    console.log(`Finished creating databases. ${createdDatabasesInfo.length} databases successfully created.`);

    return createdDatabasesInfo;
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


// --- Modified function to link Notion Relation Properties --- (Focus on conversion)
export async function linkNotionRelations(createdDatabasesInfo) {
    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.log("No database information provided. Skipping relation conversion/linking.");
        return [];
    }

    let notion;
    try {
        ({ notion } = await NotionInit());
    } catch (error) {
        console.error("Cannot link relations due to Notion client initialization failure:", error);
        return [];
    }

    const simpleMappings = createdDatabasesInfo.map(db => ({
        webflowCollectionId: db.webflowCollectionId,
        notionDbId: db.notionDbId
    }));

    console.log(`
Attempting to convert placeholders and link relations for ${createdDatabasesInfo.length} databases...`);

    const limitLink = pLimit(1); // Limit concurrent linking operations (Reduced from 3 to 1)

    const updatePromises = createdDatabasesInfo.map((dbInfo) => limitLink(async () => {
        const { notionDbId, webflowFields, notionDbProperties, webflowCollectionId } = dbInfo;
        const propertiesToUpdate = {};
        let relationsFoundCount = 0;
        let relationsLinkedCount = 0;
        let relationsFailedCount = 0;

        console.log(`Checking for relation placeholders in DB ${notionDbId} (from Webflow Collection ${webflowCollectionId})`);

        // Iterate through Webflow fields to find Reference/MultiReference types
        // These correspond to the rich_text placeholders we created earlier.
        for (const field of webflowFields) {
            if (field.type === 'Reference' || field.type === 'MultiReference') {
                const propName = field.displayName;

                // Check if the corresponding property in Notion is still a rich_text placeholder
                if (notionDbProperties[propName]?.type === 'rich_text') {
                    relationsFoundCount++;
                    console.log(`  - Found placeholder property '${propName}' to convert to relation.`);

                    const targetWfCollectionId = field.validations?.collectionId;
                    if (targetWfCollectionId) {
                        const targetNotionDbId = findNotionDbIdForWebflowCollection(targetWfCollectionId, simpleMappings);

                        if (targetNotionDbId) {
                            console.log(`    - Converting and linking '${propName}' to Notion DB ${targetNotionDbId}`);
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
                    console.log(`  - Property '${propName}' is already a relation. Skipping conversion.`);
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
                console.log(`  Updating ${Object.keys(propertiesToUpdate).length} property types/links for database ${notionDbId}...`);
                await notion.databases.update({
                    database_id: notionDbId,
                    properties: propertiesToUpdate,
                });
                console.log(`✅ Successfully updated properties for database ${notionDbId}.`);
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
             console.log(`  Database ${notionDbId} had ${relationsFoundCount} placeholder(s), but none could be converted/linked.`);
             return {
                notionDbId,
                status: 'skipped',
                linked: 0,
                found: relationsFoundCount,
                failed: relationsFailedCount
            };
        } else {
             // No placeholders found that needed conversion
             console.log(`  Database ${notionDbId} has no relation placeholders to convert.`);
             return null;
        }
    })); // <-- End of limitLink wrapper

    // Wait for all update attempts and filter out nulls (where no action was needed)
    const updateResults = (await Promise.all(updatePromises)).filter(Boolean);
    console.log("\nFinished attempting to link relations.");

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

    console.log(`Summary: Across ${createdDatabasesInfo.length} databases checked:`);
    console.log(`  - Found ${summary.totalFound} potential relations.`);
    console.log(`  - Successfully linked ${summary.totalLinked} relations.`);
    console.log(`  - Failed to link ${summary.totalFailedAttempt} relations (missing target/data).`);
    console.log(`  - ${summary.databasesUpdated} databases had relations successfully updated.`);
    console.log(`  - ${summary.databasesErrored} databases encountered an API error during update.`);
    console.log(`  - ${summary.databasesSkipped} databases had relations found but none could be linked.`);


    return updateResults; // Return the detailed results
}

/**
 * Runs the full Notion synchronization process:
 * 1. Creates Notion databases based on Webflow collections.
 * 2. Links relation properties between the created databases.
 * 3. Syncs Webflow items into the corresponding Notion database pages.
 */
export default async function runFullSyncProcess() {
    console.log("Starting full Webflow -> Notion sync process...");
    try {
        // Step 1: Create Databases
        console.log("\n--- Step 1: Creating Databases ---");
        const createdDatabasesInfo = await CreateDatabases(); // Call the named export

        if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
            console.log("Database creation step yielded no results. Halting sync.");
            return { success: true, message: "No databases needed creation.", databasesCreated: 0 };
        }
        console.log(`--- Step 1 Complete: ${createdDatabasesInfo.length} database(s) info captured ---`);

        // Step 2: Link Relations
        console.log("\n--- Step 2: Linking Relations ---");
        await linkNotionRelations(createdDatabasesInfo);
        console.log("--- Step 2 Complete: Relation linking attempted ---");

        // Step 3: Sync Items to Pages (Uses imported function)
        console.log("\n--- Step 3: Syncing Items to Pages ---");
        await syncWebflowItemsToNotionPages(createdDatabasesInfo);
        console.log("--- Step 3 Complete: Item sync attempted ---");

        console.log("\nFull Webflow -> Notion sync process completed successfully.");
        return { success: true, message: "Sync completed successfully.", databasesCreated: createdDatabasesInfo.length };

    } catch (error) {
        console.error("An error occurred during the full sync process:", error);
        return { success: false, message: `Sync failed: ${error.message}`, error: error };
    }
}

// Ensure the exports only include functions defined in *this* file + the imported sync function
export {  NotionInit, syncWebflowItemsToNotionPages }; 