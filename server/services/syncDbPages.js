// server/services/syncNotionPages.js
import pLimit from 'p-limit';
import { getCollectionItems } from './fetch-webflow.js';
import { convertHtmlToNotionBlocks } from '../utils/htmlToNotion.js';
import { NotionInit } from './syncDbProp.js';
import { updateNotionPageWithWebflowId, ensureNotionWebflowIdProperty } from './establishLink.js';

/**
 * Maps Webflow item field data to Notion page properties format.
 * Handles basic type conversions.
 * NOTE: Does not currently handle Relation linking during initial page creation.
 * @param {object} webflowItemFieldData - The fieldData object from a Webflow item.
 * @param {object} notionDbPropertiesSchema - The properties schema of the target Notion database.
 * @param {Array<object>} webflowFieldsSchema - The fields schema for the Webflow collection.
 * @returns {object} - Notion properties object for page creation/update.
 */
function mapWebflowItemToNotionProperties(webflowItemFieldData, notionDbPropertiesSchema, webflowFieldsSchema) {
    const notionProperties = {};

    // Find the field designated as 'Name' in Webflow (usually 'name' slug or explicitly named 'Name')
    const webflowNameField = webflowFieldsSchema.find(f => f.slug === 'name' || f.displayName === 'Name');
    const nameDataKey = 'name'; // Use the literal string 'name' based on item data logs

    // Use the found field object to confirm we SHOULD map a name,
    // but use the hardcoded 'name' key to get the VALUE from item data.
    if (webflowNameField && webflowItemFieldData[nameDataKey]) {
        notionProperties['Name'] = {
            title: [{ text: { content: webflowItemFieldData[nameDataKey] || '' } }]
        };
    }

    // Debug log full item data to help diagnose
    // console.log(`DEBUG: Processing WebFlow item with fields:`, Object.keys(webflowItemFieldData));

    // Iterate through the Notion DB properties schema
    for (const [notionPropName, notionPropConfig] of Object.entries(notionDbPropertiesSchema)) {
        // Skip the 'Name' property as it's handled above
        if (notionPropName === 'Name') continue;

        // Find the corresponding Webflow field by display name
        const webflowField = webflowFieldsSchema.find(wfField => wfField.displayName === notionPropName);
        if (!webflowField) {
            continue;
        }

        const webflowFieldSlug = webflowField.slug;
        let webflowValue = webflowItemFieldData[webflowFieldSlug];

        // *** ADDED: Skip RichText, Reference, MultiReference types here ***
        if (['RichText', 'Reference', 'MultiReference'].includes(webflowField.type)) {
            // console.log(`DEBUG: Skipping property mapping for field '${notionPropName}' (Webflow Type: ${webflowField.type})`);
            continue;
        }
        // *** END ADDED ***

        // Debug log for each field mapping
        // console.log(`DEBUG: Mapping field '${notionPropName}' (type: ${notionPropConfig.type}, slug: ${webflowFieldSlug}) value:`, webflowValue);

        // Skip if Webflow value is null or undefined
        if (webflowValue === null || typeof webflowValue === 'undefined') {
            // console.log(`DEBUG: Skipping field '${notionPropName}' as value is null/undefined`);
            continue;
        }

        let notionValue = null;

        try { // Add try-catch for individual property mapping
            switch (notionPropConfig.type) {
                case 'rich_text':
                    // Handle PlainText, Color (store as text), or placeholders for Reference/MultiReference
                    if (typeof webflowValue === 'string') {
                        notionValue = { rich_text: [{ text: { content: webflowValue } }] };
                    } else if (webflowValue && typeof webflowValue === 'object' && !Array.isArray(webflowValue)) {
                        // Handle case where webflowValue is an object with a text or content property
                        const textValue = webflowValue.text || webflowValue.content || JSON.stringify(webflowValue);
                        notionValue = { rich_text: [{ text: { content: textValue } }] };
                    } else if (Array.isArray(webflowValue)) {
                        // Handle array values by joining them or extracting text
                        const stringValue = webflowValue
                            .map(item => typeof item === 'string' ? item : (item.text || item.content || JSON.stringify(item)))
                            .join(', ');
                        notionValue = { rich_text: [{ text: { content: stringValue } }] };
                    }
                    // Note: Webflow RichText fields are handled separately for page content
                    break;
                case 'number':
                    // Make sure we convert any numeric strings to numbers
                    let number = null;
                    if (typeof webflowValue === 'number') {
                        number = webflowValue;
                    } else if (typeof webflowValue === 'string') {
                        number = parseFloat(webflowValue);
                    } else if (webflowValue?.value && !isNaN(parseFloat(webflowValue.value))) {
                        // Sometimes WebFlow wraps numbers in objects
                        number = parseFloat(webflowValue.value);
                    }
                    
                    if (number !== null && !isNaN(number)) {
                        notionValue = { number: number };
                    }
                    break;
                case 'date':
                    // Ensure valid date format for Notion (ISO 8601)
                    try {
                        let dateValue = webflowValue;
                        // Check if value is wrapped in an object
                        if (webflowValue && typeof webflowValue === 'object' && webflowValue.value) {
                            dateValue = webflowValue.value;
                        }
                        
                        const date = new Date(dateValue);
                        if (!isNaN(date.getTime())) {
                            notionValue = { date: { start: date.toISOString() } };
                        }
                    } catch (dateError) {
                        // console.warn(`Invalid date format for field '${notionPropName}': ${webflowValue}`);
                    }
                    break;
                case 'checkbox':
                    // Webflow 'Switch' maps to boolean
                    // Handle various boolean representations
                    let boolValue = false;
                    if (typeof webflowValue === 'boolean') {
                        boolValue = webflowValue;
                    } else if (typeof webflowValue === 'string') {
                        boolValue = webflowValue.toLowerCase() === 'true' || webflowValue === '1';
                    } else if (typeof webflowValue === 'number') {
                        boolValue = webflowValue !== 0;
                    } else if (webflowValue && typeof webflowValue === 'object') {
                        // Handle objects with value property
                        if ('value' in webflowValue) {
                            const val = webflowValue.value;
                            boolValue = val === true || val === 1 || val === '1' || val === 'true';
                        } else {
                            // Any non-empty object is true
                            boolValue = Object.keys(webflowValue).length > 0;
                        }
                    }
                    notionValue = { checkbox: boolValue };
                    break;
                case 'select':
                    // Webflow 'Option' value is the option name/id string
                    if (typeof webflowValue === 'string' && webflowValue.trim()) {
                        // Find the corresponding option name in the Notion schema (case-insensitive compare)
                        const matchingOption = notionPropConfig.select.options.find(opt => opt.name.toLowerCase() === webflowValue.toLowerCase());
                        if (matchingOption) {
                             notionValue = { select: { name: matchingOption.name } };
                        } else {
                            // Option might not exist in Notion schema yet, log a warning
                            // console.warn(`Select option '${webflowValue}' for field '${notionPropName}' not found in Notion schema.`);
                            // Optionally, create the option here if permissions allow (requires separate DB update)
                        }
                    } else if (webflowValue && typeof webflowValue === 'object') {
                        // Try to extract a value from an object
                        let optionValue = null;
                        if (webflowValue.value) {
                            optionValue = webflowValue.value;
                        } else if (webflowValue.name) {
                            optionValue = webflowValue.name;
                        } else if (webflowValue.id) {
                            optionValue = webflowValue.id;
                        } else {
                            // As a last resort, stringify the object
                            optionValue = JSON.stringify(webflowValue);
                        }
                        
                        if (optionValue) {
                            const matchingOption = notionPropConfig.select.options.find(
                                opt => opt.name.toLowerCase() === String(optionValue).toLowerCase()
                            );
                            
                            if (matchingOption) {
                                notionValue = { select: { name: matchingOption.name } };
                            } else {
                                // console.warn(`Select option '${optionValue}' for field '${notionPropName}' not found in Notion schema.`);
                            }
                        }
                    }
                    break;
                case 'multi_select':
                    // Handle different types of WebFlow multi-select values
                    let multiSelectValues = [];
                    
                    // Case 1: Array of strings or values
                    if (Array.isArray(webflowValue)) {
                        multiSelectValues = webflowValue.map(item => {
                            if (typeof item === 'string') return item;
                            if (item && typeof item === 'object') {
                                // Extract from object - try common properties
                                return item.value || item.name || item.id || JSON.stringify(item);
                            }
                            return String(item); // Fallback for numbers, etc.
                        });
                    } 
                    // Case 2: Comma-separated string
                    else if (typeof webflowValue === 'string' && webflowValue.includes(',')) {
                        multiSelectValues = webflowValue.split(',').map(v => v.trim()).filter(Boolean);
                    } 
                    // Case 3: Object with array property
                    else if (webflowValue && typeof webflowValue === 'object' && !Array.isArray(webflowValue)) {
                        // Try to find an array property
                        const arrayProp = Object.values(webflowValue).find(val => Array.isArray(val));
                        if (arrayProp) {
                            multiSelectValues = arrayProp.map(item => {
                                if (typeof item === 'string') return item;
                                return item?.value || item?.name || item?.id || String(item);
                            });
                        } else {
                            // Single object - treat as one value
                            multiSelectValues = [webflowValue.value || webflowValue.name || webflowValue.id || JSON.stringify(webflowValue)];
                        }
                    }
                    // Case 4: Single value that's not an array or object with array
                    else if (webflowValue) {
                        multiSelectValues = [String(webflowValue)];
                    }
                    
                    if (multiSelectValues.length > 0) {
                        const validOptions = multiSelectValues
                            .map(wfOpt => {
                                const optStr = String(wfOpt).trim();
                                const matchingOption = notionPropConfig.multi_select.options.find(
                                    nOpt => nOpt.name.toLowerCase() === optStr.toLowerCase()
                                );
                                return matchingOption ? { name: matchingOption.name } : null;
                            })
                            .filter(Boolean); // Filter out nulls (options not found in Notion)

                        if (multiSelectValues.length > validOptions.length) {
                           // console.warn(`Some multi-select options for field '${notionPropName}' were not found in the Notion schema.`);
                            // Log the options that weren't found
                            const foundOptions = validOptions.map(o => o.name.toLowerCase());
                            const missingOptions = multiSelectValues
                                .filter(o => !foundOptions.includes(String(o).toLowerCase()))
                                .join(', ');
                            // console.warn(`  Missing options: ${missingOptions}`);
                        }
                        
                        if (validOptions.length > 0) {
                           notionValue = { multi_select: validOptions };
                        }
                    }
                    break;
                case 'url':
                case 'email':
                case 'phone_number': // Notion type is 'phone_number'
                    if (typeof webflowValue === 'string' && webflowValue.trim()) {
                         // Use the correct Notion property type key
                        notionValue = { [notionPropConfig.type]: webflowValue };
                    } else if (webflowValue && typeof webflowValue === 'object') {
                        // Try to extract URL from object
                        const urlValue = webflowValue.url || webflowValue.value || webflowValue.href || null;
                        if (urlValue && typeof urlValue === 'string' && urlValue.trim()) {
                            notionValue = { [notionPropConfig.type]: urlValue };
                        }
                    }
                    break;
                case 'files':
                    // Webflow 'Image', 'MultiImage', 'FileRef' need URL mapping
                    let fileUrls = [];
                    
                    // Case 1: Simple string URL
                    if (typeof webflowValue === 'string' && webflowValue.trim()) {
                         fileUrls = [webflowValue];
                    } 
                    // Case 2: Array of strings or objects with url property
                    else if (Array.isArray(webflowValue)) {
                        fileUrls = webflowValue
                            .map(file => {
                                if (typeof file === 'string') return file;
                                return file?.url || file?.src || file?.href || file?.value || null;
                            })
                            .filter(Boolean);
                    }
                    // Case 3: Single object with url property
                    else if (webflowValue && typeof webflowValue === 'object') {
                        const url = webflowValue.url || webflowValue.src || webflowValue.href || webflowValue.value;
                        if (url && typeof url === 'string') {
                            fileUrls = [url];
                        } 
                        // Case 4: Object with array of files
                        else {
                            // Look for an array property that might contain files
                            const arrayProp = Object.values(webflowValue).find(val => Array.isArray(val));
                            if (arrayProp) {
                                fileUrls = arrayProp
                                    .map(file => {
                                        if (typeof file === 'string') return file;
                                        return file?.url || file?.src || file?.href || file?.value || null;
                                    })
                                    .filter(Boolean);
                            }
                        }
                    }

                    // Debug log file URLs that were found
                    if (fileUrls.length > 0) {
                        // console.log(`DEBUG: Found ${fileUrls.length} file URLs for field '${notionPropName}':`, fileUrls);
                        
                        notionValue = { 
                            files: fileUrls.map(url => ({ 
                                // Truncate name if > 100 chars
                                name: (url.split('/').pop() || 'file').substring(0, 100), 
                                type: 'external', 
                                external: { url: url } 
                            })) 
                        };
                    }
                    break;

                case 'relation':
                    // Relations are handled *after* initial page creation by linkNotionRelations
                    // console.log(`Skipping relation property '${notionPropName}' during initial page creation.`);
                    break;

                default:
                    // console.warn(`Unsupported Notion property type '${notionPropConfig.type}' encountered during mapping for field '${notionPropName}'.`);
            }
        } catch (mapError) {
             // console.error(`Error mapping property '${notionPropName}' (Webflow Slug: ${webflowFieldSlug}, Type: ${notionPropConfig.type}):`, mapError.message);
             // console.error(`  Webflow Value:`, webflowValue);
             notionValue = null; // Ensure property is not set if mapping fails
        }


        if (notionValue !== null) {
            notionProperties[notionPropName] = notionValue;
        }
    }

    return notionProperties;
}

/**
 * Finds Rich Text fields in Webflow data, converts HTML to Notion blocks.
 * @param {object} webflowItemFieldData - The fieldData object from a Webflow item.
 * @param {Array<object>} webflowFieldsSchema - The fields schema for the Webflow collection.
 * @returns {Array<object>} - Array of Notion block objects, or empty array if no Rich Text found/converted.
 */
function extractAndConvertRichTextToBlocks(webflowItemFieldData, webflowFieldsSchema) {
    let notionBlocks = [];
    // Find all rich text fields in the schema
    const richTextFields = webflowFieldsSchema.filter(f => f.type === 'RichText');

    // console.log(`DEBUG: Found ${richTextFields.length} RichText fields in schema:`, 
    //     richTextFields.map(f => `${f.displayName} (${f.slug})`));

    // Additionally, look for potential rich text that might be in other field types
    const potentialRichTextFields = webflowFieldsSchema.filter(f => 
        f.type !== 'RichText' && 
        ['PlainText', 'String', 'Text', 'TextArea'].includes(f.type)
    );

    // Process defined Rich Text fields first
    for (const field of richTextFields) {
        const htmlContent = webflowItemFieldData[field.slug];
        // console.log(`DEBUG: Processing RichText field '${field.displayName}' (${field.slug}), value type:`, 
        //     htmlContent ? (typeof htmlContent) : 'null/undefined');
        
        // Handle different types of content
        let contentToProcess = null;
        
        if (htmlContent && typeof htmlContent === 'string') {
            contentToProcess = htmlContent;
        } else if (htmlContent && typeof htmlContent === 'object') {
            // Try to extract HTML from object
            contentToProcess = htmlContent.html || htmlContent.value || htmlContent.content || null;
            
            if (!contentToProcess && htmlContent.blocks) {
                // Convert blocks to HTML if possible
                try {
                    contentToProcess = `<div>${htmlContent.blocks.map(block => {
                        if (block.text) return `<p>${block.text}</p>`;
                        if (block.html) return block.html;
                        if (block.content) return `<p>${block.content}</p>`;
                        return '';
                    }).join('')}</div>`;
                } catch (e) {
                    // console.error(`Failed to process blocks in rich text field '${field.displayName}':`, e);
                }
            }
        }
        
        if (contentToProcess && typeof contentToProcess === 'string') {
             try {
                 console.log(`   Converting RichText content from field '${field.displayName}' (Slug: ${field.slug})`);
                // Add some debug info about the content
                // console.log(`   Content length: ${contentToProcess.length} chars, starts with: ${contentToProcess.substring(0, 50)}...`);
                
                const blocks = convertHtmlToNotionBlocks(contentToProcess);
                // console.log(`   Converted to ${blocks ? blocks.length : 0} Notion blocks`);
                
                 if (blocks && blocks.length > 0) {
                    // Add a heading block indicating the source field (optional)
                     notionBlocks.push({
                        object: 'block',
                        type: 'heading_3', // Use h3 for field names
                        heading_3: {
                            rich_text: [{ text: { content: field.displayName } }]
                        }
                    });
                     notionBlocks = notionBlocks.concat(blocks);
                     // Add a divider after each rich text field's content (optional)
                    notionBlocks.push({ object: 'block', type: 'divider', divider: {} });
                 }
             } catch (conversionError) {
                 // console.error(`Error converting RichText HTML for field '${field.displayName}' (Slug: ${field.slug}):`, conversionError);
                 // Optionally add a paragraph indicating the error
                 notionBlocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                         rich_text: [{ text: { content: `Error converting content for ${field.displayName}.` } }]
                    }
                });
             }
        } else {
            // console.log(`   No valid content found for RichText field '${field.displayName}' (${field.slug})`);
        }
    }
    
    // Check potential rich text fields that might contain HTML
    for (const field of potentialRichTextFields) {
        const content = webflowItemFieldData[field.slug];
        
        // Only process if it looks like HTML and wasn't already processed
        if (content && typeof content === 'string' && 
            (content.includes('<') && content.includes('>') && !richTextFields.some(f => f.slug === field.slug))) {
            
            // console.log(`DEBUG: Found potential HTML content in non-RichText field '${field.displayName}' (${field.slug})`);
            
            try {
                const blocks = convertHtmlToNotionBlocks(content);
                if (blocks && blocks.length > 0) {
                    console.log(`   Converting potential HTML content from field '${field.displayName}'`);
                    // Add a heading block indicating the source field
                    notionBlocks.push({
                        object: 'block',
                        type: 'heading_3',
                        heading_3: {
                            rich_text: [{ text: { content: `${field.displayName} (Potential HTML)` } }]
                        }
                    });
                    notionBlocks = notionBlocks.concat(blocks);
                    notionBlocks.push({ object: 'block', type: 'divider', divider: {} });
                }
            } catch (e) {
                // If conversion fails, it's likely not HTML content - silently ignore
                // console.log(`   Content in '${field.displayName}' looks like HTML but couldn't be converted`);
            }
        }
    }
    
    // Remove the last divider if it exists
    if (notionBlocks.length > 0 && notionBlocks[notionBlocks.length - 1].type === 'divider') {
        notionBlocks.pop();
    }

    // console.log(`DEBUG: Generated ${notionBlocks.length} total Notion blocks from rich text fields`);
    return notionBlocks;
}

/**
 * Synchronizes items from Webflow collections to corresponding Notion database pages.
 * Creates or updates Notion pages based on Webflow item data.
 * @param {Array<object>} createdDatabasesInfo - Array containing info about linked Notion DBs and Webflow Collections.
 * @returns {Promise<{success: boolean, created: number, updated: number, skipped: number, failed: number}>}
 */
export async function syncWebflowItemsToNotionPages(createdDatabasesInfo) {
    console.log("Starting Webflow -> Notion page synchronization...");
    let stats = { success: true, created: 0, updated: 0, skipped: 0, failed: 0 };

    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.log("No linked databases provided. Skipping page sync.");
        return { ...stats, success: false, message: "No linked databases provided." };
    }

    const { notion } = await NotionInit();
    const limit = pLimit(2); // Notion API recommends lower concurrency (e.g., 3 req/sec)

    // Ensure the Webflow Item ID property exists in all target databases first
    // This runs concurrently but is limited by notionLimit inside establishLink.js
    const propertyCheckPromises = createdDatabasesInfo.map(dbInfo =>
        ensureNotionWebflowIdProperty(dbInfo.notionDbId)
    );
    await Promise.all(propertyCheckPromises);
    console.log("Finished ensuring Webflow Item ID properties exist in target Notion databases.");


    // Fetch all Webflow items for the relevant collections *once*
    let allWebflowItemsByCollection = {};
    try {
        // Assuming getCollectionItems fetches items for ALL collections by default
        // If not, you might need to pass specific collection IDs based on createdDatabasesInfo
        const fetchedItemsData = await getCollectionItems();
        fetchedItemsData.forEach(colData => {
            allWebflowItemsByCollection[colData.collectionId] = colData.items || [];
        });
    } catch (error) {
        console.error("Fatal error fetching Webflow items:", error);
        return { ...stats, success: false, message: "Failed to fetch Webflow items.", error: error };
    }

    const syncPromises = createdDatabasesInfo.flatMap(dbInfo => {
        const { notionDbId, webflowCollectionId, webflowFields, notionDbProperties } = dbInfo;
        const webflowItems = allWebflowItemsByCollection[webflowCollectionId];

        if (!webflowItems) {
            console.warn(`No Webflow items found or fetched for Collection ID: ${webflowCollectionId}`);
            return []; // Skip this database if no items
        }
        if (!notionDbId) {
            console.warn(`Skipping sync for Webflow Collection ${webflowCollectionId} due to missing Notion DB ID.`);
            stats.skipped += webflowItems.length;
            return [];
        }

        console.log(`Processing ${webflowItems.length} items for Notion DB ${notionDbId} (from Webflow Collection ${webflowCollectionId})...`);

        return webflowItems.map(item => limit(async () => {
            const webflowItemId = item._id; // Webflow item's unique ID
            const webflowItemFieldData = item.fieldData || item; // Adjust based on actual structure
            let notionPageId = null;

            try {
                // 1. Prepare Notion Properties (excluding Webflow Item ID initially)
                const notionPageProperties = mapWebflowItemToNotionProperties(
                    webflowItemFieldData,
                    notionDbProperties,
                    webflowFields
                );

                // 2. Prepare Notion Content Blocks (if applicable)
                const notionContentBlocks = await extractAndConvertRichTextToBlocks(
                    webflowItemFieldData,
                    webflowFields
                );

                // 3. Check if Notion page already exists (Query by Webflow Item ID)
                let existingPage = null;
                try {
                    const queryResponse = await notion.databases.query({
                        database_id: notionDbId,
                        filter: {
                            property: 'Webflow Item ID', // Use the constant name
                            rich_text: {
                                equals: webflowItemId,
                            },
                        },
                        page_size: 1 // We only expect one match
                    });
                    if (queryResponse.results.length > 0) {
                        existingPage = queryResponse.results[0];
                        notionPageId = existingPage.id;
                    }
                } catch (queryError) {
                    // Handle cases where the property might not exist yet or query fails
                    if (queryError.code === 'validation_error') { // Property might not exist
                         console.warn(`[Sync Warning] Query for Webflow Item ID failed for DB ${notionDbId}. Property might be missing or type mismatch. Will attempt creation.`);
                    } else {
                        console.error(`[Sync Error] Failed to query Notion for existing page (Webflow ID: ${webflowItemId}) in DB ${notionDbId}:`, queryError.body || queryError.message);
                        // Decide if we should continue or fail this item
                    }
                    // Continue, attempt creation if query fails
                }

                // 4. Create or Update Notion Page
                if (existingPage) {
                    // --- Update Existing Page ---
                    console.log(`Updating Notion page ${existingPage.id} for Webflow item ${webflowItemId}...`);
                    try {
                        // Update properties
                        await notion.pages.update({
                            page_id: existingPage.id,
                            properties: notionPageProperties,
                            // Note: Archiving/Unarchiving can be handled here if needed
                            // archived: false,
                        });

                        // TODO: Update Content Blocks - More complex
                        // Need to delete existing blocks then add new ones.
                        // Be cautious with this to avoid accidental data loss.
                        // Consider a block diffing strategy for partial updates if necessary.

                        console.log(` -> Updated properties for Notion page ${existingPage.id}`);
                        stats.updated++;
                    } catch (updateError) {
                         console.error(`❌ Failed to update Notion page ${existingPage.id}:`, updateError.body || updateError.message);
                         stats.failed++;
                         return; // Skip linking if update failed
                    }

                } else {
                    // --- Create New Page ---
                    console.log(`Creating new Notion page for Webflow item ${webflowItemId} in DB ${notionDbId}...`);
                    try {
                    const newPage = await notion.pages.create({
                        parent: { database_id: notionDbId },
                        properties: notionPageProperties,
                            children: notionContentBlocks.length > 0 ? notionContentBlocks : undefined,
                        });
                        notionPageId = newPage.id;
                        console.log(` -> Created Notion page ${newPage.id}`);
                        stats.created++;
                    } catch (createError) {
                        console.error(`❌ Failed to create Notion page for Webflow item ${webflowItemId}:`, createError.body || createError.message);
                        console.error("   Properties attempted:", JSON.stringify(notionPageProperties, null, 2));
                        console.error("   Content blocks attempted:", JSON.stringify(notionContentBlocks, null, 2));
                        stats.failed++;
                        return; // Skip linking if creation failed
                    }
                }

                // 5. Establish Link (Update Notion Page with Webflow ID) - AFTER successful create/update
                if (notionPageId && webflowItemId) {
                    const linkSuccess = await updateNotionPageWithWebflowId(notionPageId, webflowItemId);
                    if (!linkSuccess) {
                        console.warn(`[Sync Warning] Failed to update Notion page ${notionPageId} with Webflow Item ID ${webflowItemId} after creation/update.`);
                        // Decide if this should increment 'failed' stat or just be a warning
                    }
                } else {
                     console.warn(`[Sync Warning] Skipping link update for Webflow item ${webflowItemId} due to missing Notion Page ID.`);
                }

            } catch (error) {
                console.error(`❌ Unexpected error processing Webflow item ${webflowItemId}:`, error);
                stats.failed++;
            }
        })); // End limit wrapper
    }); // End flatMap

    try {
        await Promise.all(syncPromises);
        console.log("Webflow -> Notion page synchronization process finished.");
        console.log("Sync Stats:", stats);
    } catch (error) {
        console.error("Error during Promise.all for sync tasks:", error);
        stats.success = false;
        stats.message = "Error occurred during sync operations execution.";
        stats.error = error;
    }

    return stats;
}

// --- Potentially keep or remove the old syncNotionPages if it's redundant ---
// async function syncNotionPages(createdDatabasesInfo) { ... } 