// server/utils/notionToHtml.js

/**
 * Converts an array of Notion block objects to an HTML string.
 * @param {Array<object>} blocks - Array of Notion block objects.
 * @param {number} [nestingLevel=0] - Current nesting level for recursive calls.
 * @returns {string} - The generated HTML string.
 */
async function convertNotionBlocksToHtml(blocks, nestingLevel = 0) {
  if (!Array.isArray(blocks)) {
    console.error("Invalid input: Expected an array of blocks.");
    return "";
  }

  let html = "";
  let listBuffer = { type: null, items: [] }; // To group consecutive list items

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const nextBlock = blocks[i + 1]; // Look ahead for list grouping

    // Process list items: buffer them first
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
        const listType = block.type === 'bulleted_list_item' ? 'ul' : 'ol';
        // Start a new list or add to the existing one
        if (!listBuffer.type) {
            listBuffer.type = listType;
        }
        // If type changes, flush buffer and start new list
        else if (listBuffer.type !== listType) {
            html += flushListBuffer(listBuffer, nestingLevel);
            listBuffer.type = listType;
        }
        listBuffer.items.push(block);

        // If it's the last block or the next block is not a list item of the same type, flush buffer
        if (!nextBlock || (nextBlock.type !== 'bulleted_list_item' && nextBlock.type !== 'numbered_list_item')) {
            html += flushListBuffer(listBuffer, nestingLevel);
        }
        continue; // Continue to next block after handling list item
    }

    // If we encounter a non-list item and the buffer has items, flush it
    if (listBuffer.items.length > 0) {
        html += flushListBuffer(listBuffer, nestingLevel);
    }

    // Process non-list blocks
    html += await convertSingleBlockToHtml(block, nestingLevel);
  }

  // Final flush in case the last blocks were list items
  if (listBuffer.items.length > 0) {
      html += flushListBuffer(listBuffer, nestingLevel);
  }


  return html;
}

/**
 * Flushes the list item buffer into an HTML list string.
 * @param {object} listBuffer - The buffer containing list type and items.
 * @param {number} nestingLevel - Current nesting level.
 * @returns {string} - The generated HTML list string.
 */
function flushListBuffer(listBuffer, nestingLevel) {
    if (!listBuffer.type || listBuffer.items.length === 0) {
        return "";
    }
    let listHtml = `<${listBuffer.type}>
`;
    for (const itemBlock of listBuffer.items) {
        listHtml += convertSingleBlockToHtml(itemBlock, nestingLevel); // Process item content
    }
    listHtml += `</${listBuffer.type}>
`;

    // Clear the buffer
    listBuffer.type = null;
    listBuffer.items = [];

    return listHtml;
}


/**
 * Converts a single Notion block object to its HTML representation.
 * Handles recursion for child blocks.
 * @param {object} block - A single Notion block object.
 * @param {number} nestingLevel - Current nesting level.
 * @returns {Promise<string>} - The generated HTML string for the block.
 */
async function convertSingleBlockToHtml(block, nestingLevel) {
  if (!block || !block.type) {
    console.warn("Skipping invalid block:", block);
    return "";
  }

  const blockType = block.type;
  const elementData = block[blockType]; // e.g., block.paragraph, block.heading_1

  if (!elementData) {
    // Handle blocks that might not have the nested type structure (e.g., unsupported types)
    console.warn(`Skipping block with missing data for type: ${blockType}`);
    return "";
  }

  let childrenHtml = "";
  // Recursively convert children if the block has them and supports nesting
  if (block.has_children) {
    // NOTE: This requires an async call to the Notion API to fetch children
    // For now, we'll assume children are passed in or fetched elsewhere
    // and potentially added to the block object as a 'children' array.
    // If block.children exists, convert them:
     if (Array.isArray(elementData.children)) {
       // Handle blocks where children are part of the element data (e.g., toggle)
       childrenHtml = await convertNotionBlocksToHtml(elementData.children, nestingLevel + 1);
     } else if (Array.isArray(block.children)) {
       // Handle blocks where children are fetched separately and attached
        childrenHtml = await convertNotionBlocksToHtml(block.children, nestingLevel + 1);
     }
     // Placeholder for actual child fetching logic if needed:
     // else {
     //   console.warn(`Block ${block.id} has children but they were not provided.`);
     //   // childrenHtml = await fetchAndConvertChildren(block.id, nestingLevel + 1);
     // }
  }


  let contentHtml = "";
  if (elementData.rich_text) {
    contentHtml = convertRichTextToHtml(elementData.rich_text);
  }

  switch (blockType) {
    case "paragraph":
      return `<p>${contentHtml || "&nbsp;"}</p>\n`; // Use &nbsp; for empty paragraphs
    case "heading_1":
      return `<h1>${contentHtml}</h1>\n`;
    case "heading_2":
      return `<h2>${contentHtml}</h2>\n`;
    case "heading_3":
      return `<h3>${contentHtml}</h3>\n`;
    case "bulleted_list_item":
    case "numbered_list_item":
      // List items are handled within the main loop's buffering logic,
      // but we still need to convert their content here.
      // Nested lists are handled by the recursive call for block children.
      return `<li>${contentHtml}${childrenHtml}</li>\n`; // Append children HTML inside the li
    case "image":
      const src = elementData.type === 'external' ? elementData.external.url : elementData.file.url;
      const caption = elementData.caption ? convertRichTextToHtml(elementData.caption) : '';
      // Use caption as alt text if available, otherwise provide a generic alt
      const alt = caption || "Notion image";
      return `<figure><img src="${src}" alt="${alt}"><figcaption>${caption}</figcaption></figure>\n`;
    case "divider":
        return "<hr />\n";
    case "quote":
        return `<blockquote>${contentHtml}${childrenHtml}</blockquote>\n`;
    case "code":
        // Basic code block - assumes plain text content within rich_text
        // Notion API provides 'language' - could be used for syntax highlighting classes
        const language = elementData.language || 'plaintext';
        return `<pre><code class="language-${language}">${contentHtml}</code></pre>\n`;
    case "callout":
        const emoji = elementData.icon?.type === 'emoji' ? elementData.icon.emoji : '';
        // Basic callout structure
        // Note: Using string concatenation here as template literals across multiple lines with + can be less readable.
        return '<div class="callout" style="border:1px solid #eee; padding: 10px; margin: 10px 0; border-radius: 4px;">' +
               (emoji ? `<span style="margin-right: 8px;">${emoji}</span>` : '') +
               `<span>${contentHtml}</span>` +
               childrenHtml +
               '</div>\n';
    case "toggle":
        // Requires interaction for the toggle, basic representation here
        return `<details><summary>${contentHtml}</summary>${childrenHtml}</details>\n`;
    case "child_page":
        return `<div class="child-page">Child Page: ${elementData.title}</div>\n`; // Simple representation
    case "bookmark":
         // Corrected: Comment moved to the end of the line or next line
         return `<a href="${elementData.url}" target="_blank" rel="noopener noreferrer" class="bookmark">${elementData.url}</a>\n`; // Basic bookmark link
     // Add cases for other block types as needed (e.g., 'video', 'file', 'table', 'equation', 'synced_block', 'template', 'link_to_page' etc.)
    default:
      console.warn(`Unsupported block type: ${blockType}. Block data:`, block);
      // Optionally render the raw JSON for debugging
      // return `<pre>Unsupported Block: ${blockType}\n${JSON.stringify(block, null, 2)}</pre>\n`;
      return ""; // Skip unsupported blocks
  }
}

/**
 * Converts a Notion rich_text array into an HTML string.
 * @param {Array<object>} richTextArr - Array of Notion rich text objects.
 * @returns {string} - The generated HTML string.
 */
function convertRichTextToHtml(richTextArr) {
  if (!Array.isArray(richTextArr)) {
    return "";
  }

  let html = "";
  richTextArr.forEach((textSegment) => {
    if (textSegment.type === 'text') {
      let content = textSegment.text.content || "";
      // Escape HTML special characters
      content = content.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;')
                       .replace(/'/g, '&#039;');
       // Replace newline characters with <br> tags
      content = content.replace(/\n/g, '<br>');


      if (textSegment.annotations) {
        const annotations = textSegment.annotations;
        if (annotations.bold) content = `<strong>${content}</strong>`;
        if (annotations.italic) content = `<em>${content}</em>`;
        if (annotations.underline) content = `<u>${content}</u>`;
        if (annotations.strikethrough) content = `<s>${content}</s>`;
        if (annotations.code) content = `<code>${content}</code>`;
        // Handle color - could apply inline style or classes
        if (annotations.color && annotations.color !== 'default') {
           // Example: style="color: red;" or style="background-color: red_background;"
           // Notion colors like 'gray', 'brown', 'orange', etc. need mapping to CSS colors
           // Background colors end with '_background'
           const style = annotations.color.endsWith('_background')
             ? `background-color: ${annotations.color.replace('_background', '')}`
             : `color: ${annotations.color}`;
           content = `<span style="${style}">${content}</span>`;
        }
      }

      if (textSegment.text.link) {
        const url = textSegment.text.link.url;
        // Basic link - Notion might have internal links too (page/db refs)
        html += `<a href="${url}" target="_blank" rel="noopener noreferrer">${content}</a>`;
      } else {
        html += content;
      }
    } else if (textSegment.type === 'mention') {
        // Handle mentions (user, page, database, date, link_preview)
        // This requires specific logic based on the mention type
        // Example for a simple date mention:
        if (textSegment.mention.type === 'date') {
            const dateInfo = textSegment.mention.date;
            html += `<time datetime="${dateInfo.start}">${textSegment.plain_text}</time>`;
        } else {
            html += `<span>${textSegment.plain_text}</span>`; // Default fallback
        }
    } else if (textSegment.type === 'equation') {
        // Requires a library like KaTeX or MathJax on the client-side
        // Outputting the expression within a specific tag/class
        html += `<span class="equation" data-equation="${textSegment.equation.expression}">${textSegment.plain_text}</span>`;
    } else {
       // Fallback for unknown rich text types
       html += textSegment.plain_text || "";
    }
  });

  return html;
}

export default {
  convertNotionBlocksToHtml,
}; 