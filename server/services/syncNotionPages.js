// server/services/syncNotionPages.js
import pLimit from 'p-limit';
import { getCollectionItems } from './fetch-webflow.js';
import { convertHtmlToNotionBlocks } from '../utils/htmlToNotion.js';
import { NotionInit } from './sync2notion.js';

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
 * Fetches Webflow items and creates corresponding pages in Notion databases.
 * Uses helper functions to map properties and convert Rich Text to page content.
 * @param {Array<{webflowCollectionId: string, webflowFields: Array<object>, notionDbId: string, notionDbProperties: object}>} createdDatabasesInfo
 *        - Information about the created Notion databases and their corresponding Webflow collections/fields.
 */
export async function syncWebflowItemsToNotionPages(createdDatabasesInfo) {
    if (!createdDatabasesInfo || createdDatabasesInfo.length === 0) {
        console.log("No database information provided for page sync. Skipping item sync.");
        return;
    }

    let notion;
    try {
        ({ notion } = await NotionInit());
    } catch (error) {
        console.error("Cannot sync items due to Notion client initialization failure:", error);
        return;
    }

    console.log("\nStarting sync of Webflow items to Notion database pages...");

    // 1. Fetch all Webflow items across all relevant collections
    let allWebflowItemsByCollection;
    try {
        // *** Crucial Assumption: getCollectionItems fetches items for ALL collections
        // and returns [{ collectionId: '...', collectionName: '...', items: [...] }, ...] ***
        const fetchedItemsArray = await getCollectionItems();
        if (!fetchedItemsArray || fetchedItemsArray.length === 0) {
             console.log("No items found in Webflow collections.");
             return;
        }
         // Transform into a map for easier lookup by Webflow Collection ID
         const webflowItemsMap = fetchedItemsArray.reduce((map, colItems) => {
             // Ensure the structure from getCollectionItems includes collectionId
             if (colItems.collectionId && colItems.items) {
                 map[colItems.collectionId] = colItems.items;
             } else {
                 console.warn(`Item data for collection '${colItems.collectionName || 'Unknown'}' is missing collectionId or items array. Skipping.`);
             }
             return map;
         }, {});
         allWebflowItemsByCollection = webflowItemsMap; // Replace array with map

    } catch (error) {
        console.error("Failed to fetch Webflow collection items:", error);
        return;
    }

    const limitSync = pLimit(1); // Limit concurrent page creations (Reduced from 3 to 1)
    let totalItemsProcessed = 0;
    let totalItemsSynced = 0;
    let totalItemsFailed = 0;

    // 2. Iterate through the created Notion databases info
    const syncPromises = createdDatabasesInfo.map(async (dbInfo) => {
        const { webflowCollectionId, notionDbId, notionDbProperties, webflowFields } = dbInfo;

        // Ensure required info is present
        if (!webflowCollectionId || !notionDbId || !notionDbProperties || !webflowFields) {
            console.warn(`Skipping sync for a database due to missing info (WfID: ${webflowCollectionId}, NtID: ${notionDbId}).`);
            return [];
        }

        const webflowItems = allWebflowItemsByCollection[webflowCollectionId];

        if (!webflowItems || webflowItems.length === 0) {
            console.log(`- No Webflow items found for Collection ID ${webflowCollectionId} (Notion DB: ${notionDbId}). Skipping.`);
            return []; // No items to process for this DB
        }

        console.log(`- Processing ${webflowItems.length} items for Notion DB ${notionDbId} (from Webflow Collection ${webflowCollectionId})...`);
        const itemSyncResults = [];

        // 3. For each item in the corresponding Webflow collection...
        for (const item of webflowItems) {
            totalItemsProcessed++;
            // *** Adjust based on actual Webflow item structure ***
            const webflowItemId = item.id; // Assuming Webflow item object has an 'id'
            const webflowItemData = item.fieldData; // Assuming field data is nested under 'fieldData'
            const webflowItemName = webflowItemData?.name || webflowItemId; // Use name field or ID for logging

            if (!webflowItemId || !webflowItemData) {
                console.warn(`  Skipping item due to missing ID or fieldData in Webflow Collection ${webflowCollectionId}. Item:`, item);
                totalItemsFailed++;
                continue;
            }

            await limitSync(async () => {
                try {
                    // 4. Map Webflow fields to Notion properties
                    const notionPageProperties = mapWebflowItemToNotionProperties(webflowItemData, notionDbProperties, webflowFields);

                    // 5. Extract Rich Text fields and convert to Notion blocks for page content
                    const notionPageContentBlocks = extractAndConvertRichTextToBlocks(webflowItemData, webflowFields);

                    // Basic check: Ensure 'Name' property exists before creating page
                    if (!notionPageProperties['Name']?.title?.[0]?.text?.content) {
                        console.warn(`  Skipping item ID ${webflowItemId} ('${webflowItemName}') because 'Name' property could not be mapped.`);
                         totalItemsFailed++;
                        return; // Skip creation if Name is missing
                    }

                    // 6. Create the Notion page (WITHOUT children initially)
                    console.log(`  Creating Notion page for Webflow item: '${webflowItemName}' (ID: ${webflowItemId}) in DB ${notionDbId}`);
                    const newPage = await notion.pages.create({
                        parent: { database_id: notionDbId },
                        properties: notionPageProperties,
                        // Children will be appended in batches after page creation
                        // ...(notionPageContentBlocks.length > 0 && { children: notionPageContentBlocks })
                    });
                    console.log(`    ✅ Successfully created Notion page ${newPage.id} for Webflow item ${webflowItemId}`);
                    totalItemsSynced++;

                    // 7. Append children blocks if they exist
                    if (notionPageContentBlocks.length > 0) {
                        console.log(`    Appending ${notionPageContentBlocks.length} content blocks to page ${newPage.id}...`);
                        console.log(`    DEBUG: Blocks to be appended:`, JSON.stringify(notionPageContentBlocks, null, 2));

                        // Append blocks in batches of 100 (Notion API limit)
                        const BATCH_SIZE = 100;
                        for (let i = 0; i < notionPageContentBlocks.length; i += BATCH_SIZE) {
                            const batch = notionPageContentBlocks.slice(i, i + BATCH_SIZE);
                            try {
                                console.log(`Appending batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} blocks)...`);
                                await notion.blocks.children.append({
                                    block_id: newPage.id,
                                    children: batch,
                                });
                                // Add a small delay between batch appends to avoid rate limits
                                await new Promise(resolve => setTimeout(resolve, 350)); // ~3 requests/sec
                            } catch (appendError) {
                                console.error(`    ❌ FAILED TO APPEND BLOCK BATCH ${Math.floor(i / BATCH_SIZE) + 1} to page ${newPage.id}.`);
                                console.error(`    Append Error Code: ${appendError.code || 'N/A'}`);
                                console.error(`    Append Error Message: ${appendError.message}`);
                                if (appendError.body) {
                                    console.error(`    Append Error Body:`, JSON.stringify(appendError.body, null, 2));
                                }
                                // Optional: Decide if failure to append blocks should mark the whole item as failed
                                // throw appendError; // Re-throw to mark item as failed? Or just log and continue?
                            }
                        }
                        console.log(`    ✅ Finished appending blocks to page ${newPage.id}`);
                    }

                    itemSyncResults.push({ webflowItemId, notionPageId: newPage.id, status: 'success' });

                } catch (error) {
                    console.error(`  ❌ Failed to create Notion page for Webflow item '${webflowItemName}' (ID: ${webflowItemId}) in DB ${notionDbId}:`, error.body ? JSON.stringify(error.body) : error.message);
                     // Log the properties/content that might have caused the error
                     try {
                        const propertiesForLog = mapWebflowItemToNotionProperties(webflowItemData, notionDbProperties, webflowFields);
                        const contentForLog = extractAndConvertRichTextToBlocks(webflowItemData, webflowFields);
                        console.error("    --- Properties Payload causing error: ---");
                        console.error(JSON.stringify(propertiesForLog, null, 2));
                        console.error("    --- Content Blocks Payload causing error: ---");
                        console.error(JSON.stringify(contentForLog, null, 2));
                        console.error("    --- End Payloads ---");
                     } catch (logError) { /* Ignore errors during logging */ }

                    totalItemsFailed++;
                    itemSyncResults.push({ webflowItemId, status: 'error', error: error.body ? JSON.stringify(error.body) : error.message });
                }
                 // Small delay to help avoid rate limits
                 await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay to 500ms
            });
        }
        return itemSyncResults;
    });

    // Wait for all database item syncs to complete
    const allResults = (await Promise.all(syncPromises)).flat();

    console.log(`\nPage Sync Complete. Processed: ${totalItemsProcessed}, Synced: ${totalItemsSynced}, Failed: ${totalItemsFailed}`);

    // Optional: Return detailed results
    // return allResults;
} 