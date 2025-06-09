// server/services/syncNotionPages.js
import pLimit from 'p-limit';
import { convertHtmlToNotionBlocks } from '../utils/htmlToNotion.js';
import { NotionInit } from './syncDbProp.js';
import { 
    updateNotionPageWithWebflowId, 
    CreateNotionIdProperty, 
    ensureWebflowNotionIdField,
    updateWebflowItemWithNotionId
} from './establishLink.js';

/**
 * Maps Webflow item field data to Notion page properties format.
 * Handles basic type conversions.
 * NOTE: Does not currently handle Relation linking during initial page creation.
 * @param {object} webflowItemFieldData - The fieldData object from a Webflow item.
 * @param {object} notionDbPropertiesSchema - The properties schema of the target Notion database.
 * @param {Array<object>} webflowFieldsSchema - The fields schema for the Webflow collection.
 * @param {object} webflowItem - The full Webflow item object (including top-level metadata like isDraft, lastPublished).
 * @returns {object} - Notion properties object for page creation/update.
 */
function mapWebflowItemToNotionProperties(webflowItemFieldData, notionDbPropertiesSchema, webflowFieldsSchema, webflowItem) {
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

        // Skip the 'Status' and 'Scheduled Publish Time' properties as they are handled after this loop
        if (notionPropName === 'Status' || notionPropName === 'Scheduled Publish Time') continue;

        // Find the corresponding Webflow field by display name
        const webflowField = webflowFieldsSchema.find(wfField => wfField.displayName === notionPropName);
        if (!webflowField) {
            // Skip if Notion property doesn't have a matching Webflow field name
            continue;
        }

        const webflowFieldSlug = webflowField.slug;
        let webflowValue = webflowItemFieldData[webflowFieldSlug];

        // Skip specific types handled later or not at all in this function
        if (['RichText', 'Reference', 'MultiReference', 'Option', 'Set'].includes(webflowField.type)) {
            // console.log(`DEBUG: Skipping property mapping for field '${notionPropName}' (Webflow Type: ${webflowField.type}) - Handled elsewhere or N/A here.`);
            continue;
        }

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
                    // AND relation *values* are handled by syncReferenceAndOptionValues
                    // console.log(`Skipping relation property '${notionPropName}' during initial property mapping.`);
                    break;

                default:
                    // console.warn(`Unsupported Notion property type '${notionPropConfig.type}' encountered during mapping for field '${notionPropName}'.`);
            }
        } catch (mapError) {
             console.error(`Error mapping property '${notionPropName}' (Webflow Slug: ${webflowFieldSlug}, Type: ${notionPropConfig.type}):`, mapError.message);
             // console.error(`  Webflow Value:`, webflowValue);
             notionValue = null; // Ensure property is not set if mapping fails
        }


        if (notionValue !== null) {
            notionProperties[notionPropName] = notionValue;
        }
    }

    // --- Status Mapping Logic --- 
    const isDraft = webflowItem?.isDraft;
    const publishedOn = webflowItem?.lastPublished;
    const updatedOn = webflowItem?.lastUpdated;
    let notionStatus; // REPLACEMENT: Determine explicitly below, remove default

    // Use webflowItem.id for logging
    const wfItemIdForLog = webflowItem?.id || 'unknown'; 
    console.log(`[Debug Status Start] WF Item ID: ${wfItemIdForLog}, isDraft: ${isDraft}, lastPublished: ${publishedOn}, lastUpdated: ${updatedOn}`); // REPLACEMENT: Added Start log

    // REPLACEMENT BLOCK START: Explicit if/else structure
    if (isDraft === true) {
        if (publishedOn == null) {
            notionStatus = "Draft"; // Case 1: Pure Draft
        } else {
            notionStatus = "Draft Changes"; // Case 2a: Draft, but was published before
        }
    } else { // isDraft is false
        if (publishedOn === null) {
            // Unusual state: Not a draft, but never published. Treat as Published.
            notionStatus = "Published"; 
        } else { // isDraft: false, publishedOn: not null
            // Check if updated since publishing
            if (updatedOn && new Date(updatedOn) > new Date(publishedOn)) {
                // PREVIOUSLY: notionStatus = "Draft Changes"; // Case 2b: Published, but updated since
                // UPDATED: Map Queued to Publish / Updated since published to "Published"
                notionStatus = "Queued to Publish"; 
            } else {
                // PREVIOUSLY: notionStatus = "Published"; // Case 3: Published, and no newer updates
                // UPDATED: Map Queued to Publish / Updated since published to "Published"
                notionStatus = "Published"; 
            }
        }
    }
    // REPLACEMENT BLOCK END
    
    // REPLACEMENT: Add final check before assignment
    console.log(`[Debug Status FINAL] WF Item ID: ${wfItemIdForLog}, Final Determined Status Before Assignment: ${notionStatus}`);

    // Map to Notion "Status" property
    if (notionDbPropertiesSchema["Status"]?.type === 'select') {
        // Ensure the determined status is a valid option
        const validStatusOptions = notionDbPropertiesSchema["Status"].select.options.map(opt => opt.name);
        if (validStatusOptions.includes(notionStatus)) {
             notionProperties["Status"] = { select: { name: notionStatus } };
        } else {
             console.warn(`[Status Mapping] Determined status "${notionStatus}" is not a valid option for the Notion 'Status' property. Defaulting to 'Draft' or check Notion config.`);
             // Default to 'Draft' or another safe default if the calculated status isn't a valid option
             notionProperties["Status"] = { select: { name: "Draft" } }; 
        }
    } else {
         console.warn(`[Status Mapping] Notion property "Status" is missing or not a Select type for DB related to WF item ${wfItemIdForLog}.`);
    }

    // --- END: Status Mapping Logic ---

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
                 // console.log(`   Converting RichText content from field '${field.displayName}' (Slug: ${field.slug})`);
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
                    // console.log(`   Converting potential HTML content from field '${field.displayName}'`);
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
 * Syncs Webflow items to Notion pages, creates pages, sets basic properties, 
 * converts rich text, and establishes links between items and pages.
 * 
 * @param {string} userId - The ID of the authenticated Supabase user.
 * @param {Array<object>} createdDatabasesInfo - Info about linked Notion DBs/Webflow Collections.
 * @param {Array<{collectionId: string, collectionName: string, fields: Array<object>, items: Array<object>}>} allWebflowData - The comprehensive data fetched from Webflow.
 * @returns {Promise<{webflowItemToNotionPageMap: Map<string, string>, stats: object}>}
 */
export async function syncWebflowItemsToNotionPages(userId, createdDatabasesInfo, allWebflowData) {
    if (!userId) throw new Error("User ID required for syncWebflowItemsToNotionPages");
    const { notion } = await NotionInit(userId); // Initialize Notion client once with userId
    // Remove internal fetch of items
    // const allItemsData = await getCollectionItems(); 

    // Create a map from collectionId to its full data for easier lookup
    const webflowDataMap = new Map(allWebflowData.map(data => [data.collectionId, data]));

    const limit = pLimit(2); // Notion API concurrency limit
    const webflowItemToNotionPageMap = new Map();
    let stats = { created: 0, updatedLinks: 0, failedCreation: 0, failedLinkUpdate: 0 };

    // Ensure linking fields exist (do this once per collection before processing items)
    const linkingFieldsSetupPromises = createdDatabasesInfo.map(dbInfo => limit(async () => {
        const webflowCollectionData = webflowDataMap.get(dbInfo.webflowCollectionId);
        if (!webflowCollectionData) return; // Should not happen if data is consistent

        // Ensure Notion property exists - Pass userId
                     await CreateNotionIdProperty(userId, dbInfo.notionDbId);
        // Ensure Webflow field exists - Pass userId
        await ensureWebflowNotionIdField(userId, dbInfo.webflowCollectionId);
    }));
    await Promise.all(linkingFieldsSetupPromises);

    // --- Main Logic Loop: Iterate through Notion DBs --- 
    const allSyncPromises = createdDatabasesInfo.flatMap(dbInfo => {
        const { notionDbId, webflowCollectionId, notionDbProperties } = dbInfo;
        const webflowCollectionData = webflowDataMap.get(webflowCollectionId);

        if (!webflowCollectionData || !webflowCollectionData.items || webflowCollectionData.items.length === 0) {
            // console.log(`No items found in fetched data for Webflow Collection ID: ${webflowCollectionId}`);
            return []; // No items to process for this DB
        }

        const webflowFieldsSchema = webflowCollectionData.fields;
        const itemsToSync = webflowCollectionData.items;

        // --- Process Items within the Collection --- 
        return itemsToSync.map(item => limit(async () => {
            const webflowItemId = item.id;

            // ADDED: Skip archived items
            if (item.isArchived) {
                // console.log(`[Sync Skip] Skipping archived Webflow item ${webflowItemId}`); <-- REMOVE
                return; // Don't process this item further
            }

            const webflowItemFieldData = item.fieldData || {};
            // Check if page already exists (e.g., from a previous partial run)
            // This requires fetching/querying Notion - potentially complex
            // For now, assumes we always create.

            try {
                // 1. Map Properties & Convert Content
                const notionPageProperties = mapWebflowItemToNotionProperties(
                    webflowItemFieldData, 
                    notionDbProperties,
                    webflowFieldsSchema,
                    item
                );
                const notionPageBlocks = extractAndConvertRichTextToBlocks(
                    webflowItemFieldData,
                    webflowFieldsSchema
                );

               

                // 2. Create Notion Page
                        const newPage = await notion.pages.create({
                            parent: { database_id: notionDbId },
                            properties: notionPageProperties,       
                            children: notionPageBlocks.length > 0 ? notionPageBlocks : undefined,
                        });
                const notionPageId = newPage.id;
                webflowItemToNotionPageMap.set(webflowItemId, notionPageId);
                        stats.created++;

                // 3. Update Links (pass userId, schema to avoid extra WF call)
                const notionLinkSuccess = await updateNotionPageWithWebflowId(userId, notionPageId, webflowItemId);
                const webflowLinkSuccess = await updateWebflowItemWithNotionId(
                    userId,
                    webflowCollectionId,
                    webflowItemId,
                    notionPageId
                );

                if (notionLinkSuccess && webflowLinkSuccess) {
                    stats.updatedLinks++;
                } else {
                    stats.failedLinkUpdate++;
                    // Log which link failed if needed
                }

            } catch (error) {
                stats.failedCreation++;
                console.error(`Failed to create Notion page for Webflow item ${webflowItemId} in DB ${notionDbId}:`, error.body ? JSON.stringify(error.body) : error.message);
                // Optionally: Log failing properties/blocks
                // console.error(`  Properties: ${JSON.stringify(notionPageProperties)}`);
                // console.error(`  Blocks: ${JSON.stringify(notionPageBlocks)}`);
            }
        })); // End limit wrapper for item
    }); // End flatMap for databases    

    // --- Wait for all updates --- 
    try {
        await Promise.all(allSyncPromises);
    } catch (error) {
        // This catch might be less likely to hit if individual errors are caught
        console.error("Error occurred during final Promise.all for page sync updates:", error);
    }

    return { webflowItemToNotionPageMap, stats };
}

// --- Potentially keep or remove the old syncNotionPages if it's redundant ---
// async function syncNotionPages(createdDatabasesInfo) { ... } 