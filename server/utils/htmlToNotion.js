import * as cheerio from 'cheerio';

/**
 * Converts an HTML string into an array of Notion block objects.
 * @param {string} htmlString - The HTML string to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
// This top-level function seems unused now? The exported one is convertHtmlToNotionBlocksInternal
// function convertHtmlToNotionBlocks(htmlString) { 
//   if (typeof htmlString !== 'string') {
//     console.error("Invalid input: Expected an HTML string.");
//     return [];
//   }

//   try {
//     const $ = cheerio.load(htmlString);
//     const blocks = [];
//     const rootElements = $.root().children();

//     rootElements.each((index, element) => {
//       blocks.push(...convertElementToNotionBlock($, element));
//     });

//     // This function is not defined in the current code.
//     // return groupListItems(blocks); 
//     return blocks; // Returning blocks directly as groupListItems is missing
//   } catch (error) {
//     console.error("Error parsing HTML:", error);
//     return [];
//   }
// }

/**
 * Recursively converts a Cheerio element and its children into Notion block objects.
 * @param {cheerio.CheerioAPI} $ - The Cheerio API instance.
 * @param {cheerio.Element} element - The Cheerio element to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
function convertElementToNotionBlock($, element) {
  const tagName = element.tagName?.toLowerCase();
  let blocks = [];

  switch (tagName) {
    case 'p':
      const pRichText = convertNodeToRichText($, element);
      // Avoid creating empty blocks (whitespace or ZWJ)
      const pTextContent = pRichText.map(rt => rt.text?.content || '').join('');
      if (pTextContent.trim() && pTextContent !== '\u200D') {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: pRichText,
            },
          });
      }
      break;

    case 'h1':
    case 'h2':
    case 'h3':
      // Note: h4, h5, h6 are not standard Notion block types, converting them would require mapping to paragraph/bold or similar.
      const headingLevel = parseInt(tagName.substring(1), 10);
      const headingRichText = convertNodeToRichText($, element);
       if (headingRichText.length > 0) {
         blocks.push({
           object: 'block',
           type: `heading_${headingLevel}`,
           [`heading_${headingLevel}`]: {
             rich_text: headingRichText,
           },
         });
       }
      break;
    
    // Added h4, h5, h6 handling - convert to bold paragraphs
    case 'h4':
    case 'h5':
    case 'h6':
        const fauxHeadingRichText = convertNodeToRichText($, element);
        if (fauxHeadingRichText.length > 0) {
            // Apply bold annotation to all text segments
            const boldedRichText = fauxHeadingRichText.map(rt => ({
                ...rt,
                annotations: { ...(rt.annotations || {}), bold: true }
            }));
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: boldedRichText,
           },
         });
       }
      break;

    case 'li':
      console.log(`[Debug LI] Found <li> element.`); // Log entry
      // Determine parent list type
      const parentListTag = $(element).parent().get(0)?.tagName?.toLowerCase();
      const itemType = parentListTag === 'ol' ? 'numbered_list_item' : 'bulleted_list_item';
      console.log(`[Debug LI] Determined item type: ${itemType}`); // Log type

      // Separate direct children text/inline elements from nested list elements
      const liContentNodes = $(element).contents().filter((_, node) => 
          !(node.type === 'tag' && (node.tagName === 'ul' || node.tagName === 'ol'))
      );
      const nestedListElements = $(element).children('ul, ol');

      // Create a temporary wrapper for direct content to pass to convertNodeToRichText
      // This ensures proper handling of mixed inline content directly within the <li>
      const $tempWrapper = $('<div></div>');
      liContentNodes.each((_, node) => $tempWrapper.append($(node).clone()));
      const liRichText = convertNodeToRichText($, $tempWrapper.get(0));
      console.log(`[Debug LI] Generated liRichText:`, JSON.stringify(liRichText)); // Log rich text

      // Process nested list elements recursively to get child blocks
      let nestedChildrenBlocks = [];
      nestedListElements.each((_, nestedList) => {
          $(nestedList).children('li').each((__, nestedLi) => {
              nestedChildrenBlocks.push(...convertElementToNotionBlock($, nestedLi));
          });
      });
      console.log(`[Debug LI] Generated nestedChildrenBlocks count: ${nestedChildrenBlocks.length}`); // Log nested blocks

      // Only create list item if it has text content or nested children
      const liTextContent = liRichText.map(rt => rt.text?.content || '').join('');
      const shouldCreateBlock = liTextContent.trim() || nestedChildrenBlocks.length > 0;
      console.log(`[Debug LI] Should create block? ${shouldCreateBlock} (Text content: "${liTextContent}", Nested count: ${nestedChildrenBlocks.length})`); // Log condition check

      if(shouldCreateBlock) {
          blocks.push({
              object: 'block',
              type: itemType,
              [itemType]: {
                  rich_text: liRichText.length > 0 ? liRichText : [{type: 'text', text: {content: ''}}], // Notion requires rich_text
                      // Notion API expects nested list items as 'children' of their parent list item block
                  children: nestedChildrenBlocks.length > 0 ? nestedChildrenBlocks : undefined 
              },
          });
      }
      break;

    case 'img':
      const src = $(element).attr('src');
      const alt = $(element).attr('alt') || ''; // Use alt text
      // Find caption associated with this image (likely inside a parent figure)
      const figcaption = $(element).closest('figure').find('figcaption').first();
      const captionText = figcaption.length ? convertNodeToRichText($, figcaption.get(0)) : [];

      if (src) {
        blocks.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'external', // Assuming external URLs
            external: {
              url: src,
            },
             caption: captionText.length > 0 ? captionText : undefined,
          },
        });
      }
      break;
      
    case 'figure': // Handle figure containing img, video, or embed
        // 1. Check if it's a Webflow video/embed figure
        if ($(element).hasClass('w-richtext-figure-type-video')) {
            const pageUrl = $(element).attr('data-page-url');
            const iframe = $(element).find('iframe').first();
            const iframeSrc = iframe.length ? iframe.attr('src') : null;
            
            let embedUrl = pageUrl;
            // Extract original URL from embedly iframe if possible
            if (!embedUrl && iframeSrc && iframeSrc.includes('cdn.embedly.com')) {
                 try {
                    const embedlyUrl = new URL(iframeSrc);
                    const originalUrl = embedlyUrl.searchParams.get('url');
                    if (originalUrl) embedUrl = originalUrl;
                 } catch (e) { /* Ignore URL parsing errors */ }
            }
            if (!embedUrl) embedUrl = iframeSrc; // Fallback to raw iframe src

            if (embedUrl) {
                // Map to Notion video or embed block

                // 1. Check for YouTube/Vimeo video URLs
                if (embedUrl.includes('youtube.com') || embedUrl.includes('vimeo.com') ||  embedUrl.includes('youtu.be')) {
                    // Create Notion Video block
                    blocks.push({
                        object: 'block', type: 'video',
                        video: { type: 'external', external: { url: embedUrl } }
                    });
                }
                 // 2. Fallback to generic Embed block for everything else (Spotify, SoundCloud, Maps, Figma, etc.)
                else {
                     blocks.push({
                         object: 'block', type: 'embed',
                         embed: { url: embedUrl }
                     });
                }
            }
            // Return early to prevent processing this figure as an image/paragraph
            return blocks; 
        }
        // 2. If not a video/embed figure, check for an image (handle img tag directly)
        else if ($(element).find('img').length > 0) {
            // Process the nested img tag instead of the figure itself
            blocks.push(...convertElementToNotionBlock($, $(element).find('img').get(0)));
        } 
        // 3. If figure contains neither video/embed class nor img, treat as paragraph (e.g., for block captions or other content)
        else {
            const figureRichText = convertNodeToRichText($, element);
             if (figureRichText.length > 0 && figureRichText.some(rt => rt.text?.content?.trim())) {
                blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: figureRichText,
                    },
                });
            }
        }
        // Ensure we return blocks processed so far for figure, unless handled above
        return blocks; 
        // break; // Now redundant due to returns

    case 'blockquote':
       const quoteRichText = convertNodeToRichText($, element);
       if (quoteRichText.length > 0 && quoteRichText.some(rt => rt.text?.content?.trim())) {
           blocks.push({
             object: 'block',
             type: 'quote',
             quote: {
               rich_text: quoteRichText,
             },
           });
       }
      break;

    case 'pre':
        const codeElement = $(element).find('code').first();
        const codeContentElement = codeElement.length ? codeElement : $(element);
        const codeText = codeContentElement.text(); 
        const languageClass = codeElement.attr('class') || '';
        const languageMatch = languageClass.match(/language-(\S+)/);
        const language = languageMatch ? languageMatch[1] : 'plain text'; 

        const MAX_CODE_LENGTH = 2000; // Notion API limit for code blocks
        let truncatedCodeText = codeText;
        if (codeText.length > MAX_CODE_LENGTH) {
            console.warn(`[HTML->Notion] WARN: Code block content exceeds ${MAX_CODE_LENGTH} chars (${codeText.length}). Truncating.`);
            truncatedCodeText = codeText.substring(0, MAX_CODE_LENGTH - 3) + '...';
        }

        if (truncatedCodeText.trim()) {
             blocks.push({
                 object: 'block',
                 type: 'code',
                 code: {
                     rich_text: [{ 
                         type: 'text',
                         text: { content: truncatedCodeText },
                         plain_text: truncatedCodeText, 
                     }],
                     language: language,
                 },
             });
        }
        break;

    case 'hr':
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {},
      });
      break;

    case 'details': // Map to Toggle block
        const summaryElement = $(element).children('summary').first();
        const summaryRichText = summaryElement.length ? convertNodeToRichText($, summaryElement.get(0)) : [{ type: 'text', text: { content: 'Toggle' } }]; 
        const detailsChildren = [];
        // Process nodes other than the summary to become children of the toggle
        $(element).contents().each((_, node) => {
            if (node.type === 'tag' && node.tagName.toLowerCase() !== 'summary') {
                detailsChildren.push(...convertElementToNotionBlock($, node));
            } else if (node.type === 'text' && node.data.trim()) {
                 // Wrap stray text nodes in paragraphs
                 detailsChildren.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: node.data.trim() } }] }
                });
            }
        });

        if (summaryRichText.length > 0 || detailsChildren.length > 0) {
             blocks.push({
                object: 'block',
                type: 'toggle',
                toggle: {
                    rich_text: summaryRichText,
                    children: detailsChildren.length > 0 ? detailsChildren : undefined, 
                }
            });
        }
        // Return early as children are handled
        return blocks; 

    // Generic container tags - process their children recursively
    case 'div':
    case 'article':
    case 'section':
    case 'main':
    case 'aside':
    case 'header':
    case 'footer':
    case 'nav':
        // Handle specific classes like Webflow's callout
        if ($(element).hasClass('callout')) {
            // Simplified callout handling assuming text and optional emoji span
             const calloutRichText = convertNodeToRichText($, element); // Convert whole div content
             const emojiSpan = $(element).children('span[style*="margin-right"]').first(); // Heuristic for emoji
             const emoji = emojiSpan.length ? emojiSpan.text().trim() : undefined;

             if (calloutRichText.length > 0 && calloutRichText.some(rt => rt.text?.content?.trim())) {
                 blocks.push({
                    object: 'block',
                    type: 'callout',
                    callout: {
                        rich_text: calloutRichText,
                        icon: emoji ? { type: 'emoji', emoji: emoji } : undefined,
                    }
                 });
                 // Return early for handled callout
                 return blocks; 
             }
        }
         // If not a handled special div, just process children via the default handler logic below
         // Fall through intended
        

    // Ignore elements that don't map directly or are handled by parents/children
    case 'br':          // Handled by rich text conversion
    case 'span':        // Handled by rich text conversion
    case 'code':        // Handled by 'pre' or rich text conversion
    case 'summary':     // Handled by 'details'
    case 'figcaption':  // Handled by 'figure'/'img' logic
    case 'ul':          // Children 'li' are processed
    case 'ol':          // Children 'li' are processed
    case 'body':        // Root element, children processed by caller
    case 'html':        // Root element, children processed by caller
    case 'head':        // Ignored
        break; // Do nothing for these tags

    // Handle standalone <video> tags (if not inside a figure)
    case 'video':
      const videoSrc = $(element).attr('src') || $(element).find('source').first().attr('src');
      if (videoSrc) {
        blocks.push({
          object: 'block',
          type: 'video',
          video: {
            type: 'external', // Assuming external URL
            external: { url: videoSrc }
            // Captions not supported by Notion API
          }
        });
      }
      break;

    // Handle standalone <iframe> tags (if not inside a figure)
    case 'iframe':
      const iframeSrcRaw = $(element).attr('src');
      if (!$(element).closest('figure.w-richtext-figure-type-video').length && iframeSrcRaw) {
          let potentialEmbedUrl = iframeSrcRaw;
          // Extract original URL if it's an embedly iframe
          if (iframeSrcRaw.includes('cdn.embedly.com')) {
               try {
                  const embedlyUrl = new URL(iframeSrcRaw);
                  const originalUrl = embedlyUrl.searchParams.get('url');
                  if (originalUrl) potentialEmbedUrl = originalUrl;
               } catch (e) { /* Ignore URL parsing errors */ }
          }

          // Map to Notion video or embed block

          // 1. Check for YouTube/Vimeo video URLs
          if (potentialEmbedUrl.includes('youtube.com') || potentialEmbedUrl.includes('vimeo.com') || potentialEmbedUrl.includes('youtu.be')) {
              blocks.push({
                  object: 'block', type: 'video',
                  video: { type: 'external', external: { url: potentialEmbedUrl } }
              });
          } 
          // 2. Fallback to generic Embed block for everything else
          else {
              blocks.push({
                  object: 'block', type: 'embed',
                  embed: { url: potentialEmbedUrl }
              });
          }
      }
      break;

    // Default handler for any other tag: Process children recursively.
    // Also handles fallthrough from container tags like 'div' if not handled specifically (e.g., callout)
    default:
       $(element).contents().each((_, childNode) => {
           if (childNode.type === 'tag') {
               blocks.push(...convertElementToNotionBlock($, childNode));
           } else if (childNode.type === 'text') {
               // Wrap significant text nodes found directly within unhandled tags into paragraphs
               const textContent = childNode.data;
               if (textContent && textContent.trim()) {
                 blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                           rich_text: convertNodeToRichText($, childNode)
                       }
                   });
               }
           }
       });
      break;
  }

  return blocks;
}

/**
 * Converts a Cheerio node (element or text) and its inline children into Notion rich_text array.
 * @param {cheerio.CheerioAPI} $ - The Cheerio API instance.
 * @param {cheerio.Node} node - The Cheerio node to convert.
 * @returns {Array<object>} - An array of Notion rich text objects.
 */
function convertNodeToRichText($, node) {
  const richText = [];

  // Recursive helper to process nodes and apply annotations/links
  const processNodeRecursive = (currentNode, currentAnnotations = {}, currentLink = null) => {
    if (currentNode.type === 'text') {
      let content = currentNode.data;
      content = content.replace(/&nbsp;/g, ' '); // Handle non-breaking space
      
      // Add text segment if it contains content or is a deliberate newline
      if (content && content.trim().length > 0 || content === ' ' || content === '\n') {
        richText.push({
          type: 'text',
          text: { content: content, link: currentLink },
          annotations: {
            bold: !!currentAnnotations.bold,
            italic: !!currentAnnotations.italic,
            strikethrough: !!currentAnnotations.strikethrough,
            underline: !!currentAnnotations.underline,
            code: !!currentAnnotations.code,
            color: currentAnnotations.color || 'default',
          },
          plain_text: content,
          href: currentLink ? currentLink.url : null,
        });
      }
    } else if (currentNode.type === 'tag') {
      const tagName = currentNode.tagName.toLowerCase();
      let newAnnotations = { ...currentAnnotations }; 
      let newLink = currentLink;

      // Apply annotations based on inline tags
      switch (tagName) {
        case 'strong': case 'b': newAnnotations.bold = true; break;
        case 'em': case 'i': newAnnotations.italic = true; break;
        case 'u': newAnnotations.underline = true; break;
        case 's': case 'strike': case 'del': newAnnotations.strikethrough = true; break;
        case 'code':
          // Apply code annotation only if not inside a <pre> block
          if (!$(currentNode).closest('pre').length) {
            newAnnotations.code = true;
          } else {
             // If inside <pre>, treat content as plain text within the code block
              $(currentNode).contents().each((_, childNode) => {
                  processNodeRecursive(childNode, currentAnnotations, currentLink); // Use original annotations
              });
              return; // Stop processing this code tag's children here
          }
          break;
        case 'a':
          const href = $(currentNode).attr('href');
          if (href) newLink = { url: href };
          break;
        case 'br':
           // Insert newline character, will be handled by consolidation
           richText.push({ type: 'text', text: { content: '\n', link: null }, annotations: { ...currentAnnotations, color: currentAnnotations.color || 'default'}, plain_text: '\n', href: null });
          return; // No children for <br>
        case 'span': // Check for inline style colors
          const style = $(currentNode).attr('style');
          if (style) {
             // Basic color mapping from inline styles (can be expanded)
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            const bgColorMatch = style.match(/background-color:\s*([^;]+)/i);
            if (colorMatch) {
              const colorValue = colorMatch[1].trim().toLowerCase();
                 if (colorValue.includes('red')) newAnnotations.color = 'red';
                 else if (colorValue.includes('blue')) newAnnotations.color = 'blue';
                 else if (colorValue.includes('green')) newAnnotations.color = 'green';
                 else if (colorValue.includes('yellow')) newAnnotations.color = 'yellow';
                 else if (colorValue.includes('orange')) newAnnotations.color = 'orange';
                 else if (colorValue.includes('pink')) newAnnotations.color = 'pink';
                 else if (colorValue.includes('purple')) newAnnotations.color = 'purple';
                 else if (colorValue.includes('gray') || colorValue.includes('grey')) newAnnotations.color = 'gray';
                 else if (colorValue.includes('brown')) newAnnotations.color = 'brown';
                 else newAnnotations.color = 'default';
            } else if (bgColorMatch) {
              const bgColorValue = bgColorMatch[1].trim().toLowerCase();
                 if (bgColorValue.includes('red')) newAnnotations.color = 'red_background';
                 else if (bgColorValue.includes('blue')) newAnnotations.color = 'blue_background';
                 else if (bgColorValue.includes('green')) newAnnotations.color = 'green_background';
                 else if (bgColorValue.includes('yellow')) newAnnotations.color = 'yellow_background';
                 else if (bgColorValue.includes('orange')) newAnnotations.color = 'orange_background';
                 else if (bgColorValue.includes('pink')) newAnnotations.color = 'pink_background';
                 else if (bgColorValue.includes('purple')) newAnnotations.color = 'purple_background';
                 else if (bgColorValue.includes('gray') || bgColorValue.includes('grey')) newAnnotations.color = 'gray_background';
                 else if (bgColorValue.includes('brown')) newAnnotations.color = 'brown_background';
                 else newAnnotations.color = 'default';
            }
          }
          break;

        // Skip block-level elements when creating rich text for another block
        case 'p': case 'div': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        case 'blockquote': case 'pre': case 'hr': case 'ul': case 'ol': case 'li':
        case 'figure': case 'img': case 'table': case 'tr': case 'td': case 'th': case 'video': case 'iframe':
          return; // Don't process children of block elements in rich text context

        default: // Process children of other unrecognized inline tags
          break;
      }

      // Recursively process children with updated annotations/link
      $(currentNode).contents().each((_, childNode) => {
        processNodeRecursive(childNode, newAnnotations, newLink);
      });
    }
  };

  // Start processing based on the type of the initial node
   if (node.type === 'tag'){
        $(node).contents().each((_, childNode) => {
            processNodeRecursive(childNode, {}, null); // Start with default annotations/link
        });
   } else if (node.type === 'text') {
        // Handle case where the root node passed is already a text node
        processNodeRecursive(node, {}, null);
   }

   // Consolidate adjacent rich text segments with same formatting
   return consolidateRichText(richText);
}

/**
 * Consolidates adjacent rich text segments with identical formatting.
 * @param {Array<object>} richTextArr - The input array of rich text objects.
 * @returns {Array<object>} - The consolidated array.
 */
function consolidateRichText(richTextArr) {
    if (!richTextArr || richTextArr.length === 0) return [];

    const consolidated = [];
    let currentSegment = null;

    for (const segment of richTextArr) {
        // Skip empty text segments
        if (segment.type === 'text' && !segment.text.content) continue;

        // Check if current segment can be merged with the previous one
        if (currentSegment &&
            currentSegment.type === 'text' &&
            segment.type === 'text' &&
            segment.text.content !== '\n' && // Don't merge across explicit newlines
            currentSegment.text.content !== '\n' &&
            JSON.stringify(currentSegment.annotations) === JSON.stringify(segment.annotations) &&
            JSON.stringify(currentSegment.text.link) === JSON.stringify(segment.text.link))
        {
            // Merge content
            currentSegment.text.content += segment.text.content;
        } else {
            // Push previous segment and start a new one
            if (currentSegment) consolidated.push(currentSegment);
            // Deep copy to avoid modifying original objects
            currentSegment = JSON.parse(JSON.stringify(segment));
        }
    }
    // Push the last segment
    if (currentSegment) consolidated.push(currentSegment);

    // Recalculate plain_text and trim whitespace carefully
    const finalConsolidated = [];
    consolidated.forEach(seg => {
        if(seg.type === 'text') {
            seg.plain_text = seg.text.content; // Update plain_text after merging
            finalConsolidated.push(seg);
        } else {
            finalConsolidated.push(seg); // Keep non-text segments
        }
    });

    // Trim leading space from first text segment (unless it's just a newline)
    if (finalConsolidated.length > 0 && finalConsolidated[0].type === 'text' && finalConsolidated[0].text.content !== '\n') {
        const originalContent = finalConsolidated[0].text.content;
        finalConsolidated[0].text.content = originalContent.trimStart();
        if (finalConsolidated[0].text.content !== originalContent) {
             finalConsolidated[0].plain_text = finalConsolidated[0].text.content;
        }
        // Remove segment if trimming made it completely empty
        if (!finalConsolidated[0].text.content && originalContent !== '\n') {
            finalConsolidated.shift();
        }
    }

     // Trim trailing space from last text segment (unless it's just a newline)
     if (finalConsolidated.length > 0) {
        const lastIndex = finalConsolidated.length - 1;
        if (finalConsolidated[lastIndex].type === 'text' && finalConsolidated[lastIndex].text.content !== '\n') {
             const originalContent = finalConsolidated[lastIndex].text.content;
             finalConsolidated[lastIndex].text.content = originalContent.trimEnd();
            if (finalConsolidated[lastIndex].text.content !== originalContent) {
                finalConsolidated[lastIndex].plain_text = finalConsolidated[lastIndex].text.content;
            }
            // Remove segment if trimming made it completely empty
             if (!finalConsolidated[lastIndex].text.content && originalContent !== '\n') {
                finalConsolidated.pop();
            }
        }
     }

    // Final filter for any potentially empty segments remaining (should be rare)
    return finalConsolidated.filter(segment => segment.type !== 'text' || segment.text.content.length > 0 || segment.plain_text === '\n');
}

/**
 * Main internal conversion function. Parses HTML and converts root nodes.
 * @param {string} htmlString - The HTML string to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
function convertHtmlToNotionBlocksInternal(htmlString) {
 if (typeof htmlString !== 'string' || !htmlString.trim()) {
    console.error("[HTML->Notion] Invalid or empty input HTML string.");
    return [];
  }

  try {
    // Use decodeEntities to handle HTML entities like &amp;
    const $ = cheerio.load(htmlString, { decodeEntities: true }); 
    let blocks = [];
    // Process all direct children (including text nodes) of the effective body
    const rootNodes = $('body').contents(); 

    rootNodes.each((index, node) => {
      if (node.type === 'tag') {
          blocks.push(...convertElementToNotionBlock($, node));
      } else if (node.type === 'text') {
          // Wrap significant root-level text nodes in paragraphs
          const textContent = node.data;
          if (textContent && textContent.trim()) {
               blocks.push({
                   object: 'block', type: 'paragraph',
                   paragraph: { rich_text: convertNodeToRichText($, node) }
               });
          }
      }
    });

    // Final cleanup: Remove paragraph blocks that are effectively empty (only whitespace or ZWJ)
    blocks = blocks.filter(block => {
        if (block.type === 'paragraph') {
            const textContent = block.paragraph.rich_text
                .map(rt => rt.text?.content || '')
                .join('');
            const isEmptyOrWhitespace = !textContent.trim();
            const isOnlyZwj = textContent === '\u200D'; // Zero Width Joiner

            if (isEmptyOrWhitespace || isOnlyZwj) {
                 return false; // Filter out
            }
        }
        return true; // Keep non-paragraph blocks and valid paragraphs
    });


    return blocks;
  } catch (error) {
    // Provide more context in error logging if possible
    console.error("[HTML->Notion] Error parsing HTML:", error.message); 
    // console.error("Input HTML (first 500 chars):", htmlString?.substring(0, 500)); // Keep commented
    return []; // Return empty array on error
  }
}

// Export the main internal function
export { convertHtmlToNotionBlocksInternal as convertHtmlToNotionBlocks }; 