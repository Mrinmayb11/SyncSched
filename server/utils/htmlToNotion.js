import * as cheerio from 'cheerio';

/**
 * Converts an HTML string into an array of Notion block objects.
 * @param {string} htmlString - The HTML string to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
function convertHtmlToNotionBlocks(htmlString) {
  if (typeof htmlString !== 'string') {
    console.error("Invalid input: Expected an HTML string.");
    return [];
  }

  try {
    const $ = cheerio.load(htmlString);
    const blocks = [];
    const rootElements = $.root().children();

    rootElements.each((index, element) => {
      blocks.push(...convertElementToNotionBlock($, element));
    });

    return groupListItems(blocks);
  } catch (error) {
    console.error("Error parsing HTML:", error);
    return [];
  }
}

/**
 * Recursively converts a Cheerio element and its children into Notion block objects.
 * @param {cheerio.CheerioAPI} $ - The Cheerio API instance.
 * @param {cheerio.Element} element - The Cheerio element to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
function convertElementToNotionBlock($, element) {
  // <<< Log Entry and Element Type >>>
  console.log(`[HTML->Notion] ENTERING convertElementToNotionBlock for element: <${element?.tagName || 'unknown'}>`);
  // <<< End Log >>>

  const tagName = element.tagName?.toLowerCase();
  const blocks = [];

  switch (tagName) {
    case 'p':
      const pRichText = convertNodeToRichText($, element);
      // Avoid creating empty blocks if paragraph only contains whitespace or <br> generated newlines
      if (pRichText.length > 0 && pRichText.some(rt => rt.text?.content?.trim() || (rt.type === 'text' && rt.text?.content === '\\n'))) {
          console.log(`  [HTML->Notion] Creating Paragraph block for <${tagName}>`); // Log block creation
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
      const headingLevel = parseInt(tagName.substring(1), 10);
      const headingRichText = convertNodeToRichText($, element);
       if (headingRichText.length > 0) {
         console.log(`  [HTML->Notion] Creating Heading ${headingLevel} block for <${tagName}>`); // Log block creation
         blocks.push({
           object: 'block',
           type: `heading_${headingLevel}`,
           [`heading_${headingLevel}`]: {
             rich_text: headingRichText,
           },
         });
       }
      break;

    case 'li':
      // Determine parent list type
      const parentListTag = $(element).parent().get(0)?.tagName?.toLowerCase();
      const itemType = parentListTag === 'ol' ? 'numbered_list_item' : 'bulleted_list_item';

      // Separate direct children text/inline elements from nested list elements
      const liContentNodes = $(element).contents().filter((_, node) => 
          !(node.type === 'tag' && (node.tagName === 'ul' || node.tagName === 'ol'))
      );
      const nestedListElements = $(element).children('ul, ol');

      // Create a temporary wrapper for direct content to pass to convertNodeToRichText
      const $tempWrapper = $('<div></div>');
      liContentNodes.each((_, node) => $tempWrapper.append($(node).clone()));
      const liRichText = convertNodeToRichText($, $tempWrapper.get(0));

      // Process nested list elements recursively to get child blocks
      let nestedChildrenBlocks = [];
      nestedListElements.each((_, nestedList) => {
          // Each child of the nested list (li) needs to be processed
          $(nestedList).children('li').each((__, nestedLi) => {
              nestedChildrenBlocks.push(...convertElementToNotionBlock($, nestedLi));
          });
      });

      console.log(`  [HTML->Notion] PREP List Item (${itemType}):`);
      console.log(`    Rich Text: ${JSON.stringify(liRichText)}`);
      console.log(`    Nested Children Count: ${nestedChildrenBlocks.length}`);
      if (nestedChildrenBlocks.length > 0) {
          console.log(`    Nested Children Blocks: ${JSON.stringify(nestedChildrenBlocks)}`);
      }

      console.log(`  [HTML->Notion] Creating List Item block (${itemType})`);
      blocks.push({
          object: 'block',
          type: itemType,
          [itemType]: {
              rich_text: liRichText.length > 0 ? liRichText : [{type: 'text', text: {content: ''}}], // Notion requires rich_text
              // Directly assign recursively converted nested blocks as children
              children: nestedChildrenBlocks.length > 0 ? nestedChildrenBlocks : undefined 
          },
      });
      break;

    case 'img':
      const src = $(element).attr('src');
      const alt = $(element).attr('alt') || ''; // Use alt text
      const figcaption = $(element).closest('figure').find('figcaption').first();
      const captionText = figcaption.length ? convertNodeToRichText($, figcaption.get(0)) : [];

      if (src) {
        console.log(`  [HTML->Notion] Creating Image block for <img>`); // Log block creation
        blocks.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'external', // Assuming external URLs
            external: {
              url: src,
            },
             caption: captionText.length > 0 ? captionText : undefined, // Add caption if exists
          },
        });
      }
      break;
      
    case 'figure': // Handle figure containing img, avoid duplicate image blocks
        if ($(element).find('img').length > 0) {
             // Process the img within the figure
            blocks.push(...convertElementToNotionBlock($, $(element).find('img').get(0)));
        } else {
            // Treat figure without img as a generic container (maybe paragraph?)
            const figureRichText = convertNodeToRichText($, element);
             if (figureRichText.length > 0) {
                console.log(`  [HTML->Notion] Creating Paragraph block for <figure>`); // Log block creation
                blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: figureRichText,
                    },
                });
            }
        }
        break;

    case 'blockquote':
       const quoteRichText = convertNodeToRichText($, element);
       if (quoteRichText.length > 0) {
           console.log(`  [HTML->Notion] Creating Quote block for <blockquote>`); // Log block creation
           blocks.push({
             object: 'block',
             type: 'quote',
             quote: {
               rich_text: quoteRichText,
               // Note: Notion API doesn't directly support children in quote blocks in the same way HTML does.
               // We might need to flatten nested elements into the quote's rich_text or create subsequent blocks.
             },
           });
       }
      break;

    case 'pre':
        // Find a <code> element inside, otherwise treat pre content as plain text
        const codeElement = $(element).find('code').first();
        const codeContentElement = codeElement.length ? codeElement : $(element);
        const codeText = codeContentElement.text(); // Get raw text content
        const languageClass = codeElement.attr('class') || '';
        // Extract language from class like "language-javascript"
        const languageMatch = languageClass.match(/language-(\S+)/);
        const language = languageMatch ? languageMatch[1] : 'plain text'; // Default language
        console.log(`  [HTML->Notion] Detected language: ${language} for <pre> block`); // Log detected language

        // <<< ADD LOGGING & TRUNCATION >>>
        const MAX_CODE_LENGTH = 2000;
        let truncatedCodeText = codeText;
        if (codeText.length > MAX_CODE_LENGTH) {
            console.warn(`  [HTML->Notion] WARN: Code block content exceeds 2000 chars (${codeText.length}). Truncating.`);
            truncatedCodeText = codeText.substring(0, MAX_CODE_LENGTH - 3) + '...';
        }
        console.log(`  [HTML->Notion] Code Block Text (first 100): ${truncatedCodeText.substring(0, 100)}...`);
        // <<< END LOGGING & TRUNCATION >>>

        if (truncatedCodeText.trim()) { // Use truncated text
             console.log(`  [HTML->Notion] Creating Code block for <pre>`); // Log block creation
             blocks.push({
                 object: 'block',
                 type: 'code',
                 code: {
                     rich_text: [{ // Code blocks use a single rich text item
                         type: 'text',
                         text: {
                             content: truncatedCodeText, // Use truncated text
                         },
                         plain_text: truncatedCodeText, // Use truncated text
                     }],
                     language: language,
                 },
             });
        }
        break;

    case 'hr':
      console.log(`  [HTML->Notion] Creating Divider block for <hr>`); // Log block creation
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {},
      });
      break;

    case 'details': // Map to Toggle block
        const summaryElement = $(element).children('summary').first();
        const summaryRichText = summaryElement.length ? convertNodeToRichText($, summaryElement.get(0)) : [{ type: 'text', text: { content: 'Toggle' } }]; // Default summary
        const detailsChildren = [];
        $(element).contents().each((_, node) => {
            if (node.type === 'tag' && node.tagName.toLowerCase() !== 'summary') {
                detailsChildren.push(...convertElementToNotionBlock($, node));
            } else if (node.type === 'text' && node.data.trim()) {
                 detailsChildren.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: node.data.trim() } }] }
                });
            }
        });

        if (summaryRichText.length > 0 || detailsChildren.length > 0) {
             console.log(`  [HTML->Notion] Creating Toggle block for <details>`); // Log block creation
             blocks.push({
                object: 'block',
                type: 'toggle',
                toggle: {
                    rich_text: summaryRichText,
                    children: detailsChildren.length > 0 ? detailsChildren : undefined, // Add children if they exist
                }
            });
        }
        break;

    // Handle other potential block-level elements or divs that might contain content
    case 'div':
    case 'article':
    case 'section':
    case 'main':
    case 'aside':
    case 'header':
    case 'footer':
    case 'nav':
        // If it's a callout div, handle it specifically
        if ($(element).hasClass('callout')) {
            const calloutContent = $(element).contents().filter((_, node) => !(node.type === 'tag' && node.attribs?.style?.includes('margin-right'))).first(); // Try to get main content span
            const calloutRichText = calloutContent.length ? convertNodeToRichText($, calloutContent.get(0)) : convertNodeToRichText($, element);
            const emojiSpan = $(element).children('span[style*="margin-right"]').first();
            const emoji = emojiSpan.length ? emojiSpan.text() : undefined;

            if (calloutRichText.length > 0) {
                 console.log(`  [HTML->Notion] Creating Callout block for <div class="callout">`); // Log block creation
                 blocks.push({
                    object: 'block',
                    type: 'callout',
                    callout: {
                        rich_text: calloutRichText,
                        icon: emoji ? { type: 'emoji', emoji: emoji } : undefined,
                        // Note: Notion callouts don't nest blocks like HTML divs can.
                        // Children within the div would need to be converted to separate blocks following the callout.
                    }
                 });
            }
        }
        break;

    // Ignore elements that don't map directly or are handled by parents
    case 'br':
    case 'span': // Usually handled by rich text conversion
    case 'code': // Handled by 'pre' or rich text
    case 'summary': // Handled by 'details'
    case 'figcaption': // Handled by 'figure'/'img'
        break;

    // <<< Add Video Handling >>>
    case 'video':
      const videoSrc = $(element).attr('src') || $(element).find('source').first().attr('src');
      if (videoSrc) {
        // <<< ADD LOGGING >>>
        console.log(`  [HTML->Notion] Creating Video block for <video> with src: ${videoSrc}`);
        // <<< END LOGGING >>>
        blocks.push({
          object: 'block',
          type: 'video',
          video: {
            type: 'external', // Assuming external URL
            external: {
              url: videoSrc
            },
            // Notion doesn't currently support captions for video blocks via API
          }
        });
      } else {
        console.log(`  [HTML->Notion] Skipping <video> tag with no src found.`);
      }
      break;

    case 'iframe':
      const iframeSrc = $(element).attr('src');
      // Basic check if it looks like a video embed URL (YouTube, Vimeo, etc.)
      if (iframeSrc && (iframeSrc.includes('youtube.com') || iframeSrc.includes('vimeo.com') || iframeSrc.includes('youtu.be'))) {
         // <<< ADD LOGGING >>>
         console.log(`  [HTML->Notion] Creating Video block for <iframe> with src: ${iframeSrc}`);
         // <<< END LOGGING >>>
         blocks.push({
           object: 'block',
           type: 'video',
           video: {
             type: 'external',
             external: {
               url: iframeSrc
             }
           }
         });
      } else if (iframeSrc) {
          console.log(`  [HTML->Notion] Skipping non-video <iframe> with src: ${iframeSrc}`);
      } else {
          console.log(`  [HTML->Notion] Skipping <iframe> tag with no src found.`);
      }
      break;
    // <<< End Video Handling >>>

    default:
       // Treat unrecognized block-level elements potentially as paragraphs
        if (element.type === 'tag' && $(element).text().trim()) {
            const defaultRichText = convertNodeToRichText($, element);
            if (defaultRichText.length > 0) {
                 console.log(`  [HTML->Notion] Creating Paragraph block for default tag <${tagName}>`); // Log block creation
                 blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: defaultRichText,
                    },
                 });
            }
        } else if (element.type === 'text' && element.data.trim()) {
            console.log(`  [HTML->Notion] Creating Paragraph block for root text node`); // Log block creation
            blocks.push({
                 object: 'block',
                 type: 'paragraph',
                 paragraph: {
                     rich_text: convertNodeToRichText($, element),
                 },
             });
        }
      // console.warn(`Unhandled HTML element type: ${tagName || element.type}`);
      break;
  }

  return blocks;
}

/**
 * Converts a Cheerio node (element or text) and its inline children into Notion rich_text array.
 * Handles annotations and links recursively.
 * @param {cheerio.CheerioAPI} $ - The Cheerio API instance.
 * @param {cheerio.Node} node - The Cheerio node to convert (should be an element).
 * @returns {Array<object>} - An array of Notion rich text objects.
 */
function convertNodeToRichText($, node) {
  const richText = [];

  // Recursive helper function to process nodes and apply annotations
  const processNodeRecursive = (currentNode, currentAnnotations = {}, currentLink = null) => {
    if (currentNode.type === 'text') {
      let content = currentNode.data;
      // Preserve non-breaking spaces and better handle whitespace
      content = content.replace(/&nbsp;/g, ' ');
      
      // Don't add empty segments - skip them entirely
      if (content && content.trim().length > 0 || content === ' ' || content === '\n') {
        richText.push({
          type: 'text',
          text: {
            content: content,
            link: currentLink,
          },
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
      let newAnnotations = { ...currentAnnotations }; // Inherit annotations
      let newLink = currentLink; // Inherit link

      switch (tagName) {
        case 'strong': case 'b':
          newAnnotations.bold = true;
          break;
        case 'em': case 'i':
          newAnnotations.italic = true;
          break;
        case 'u':
          newAnnotations.underline = true;
          break;
        case 's': case 'strike': case 'del': // Add 'del' tag support
          newAnnotations.strikethrough = true;
          break;
        case 'code':
          // Ensure it's not inside a <pre> block (handled separately)
          if (!$(currentNode).closest('pre').length) {
            newAnnotations.code = true;
          } else {
             // If inside <pre>, treat as text, not code annotation
              $(currentNode).contents().each((_, childNode) => {
                  processNodeRecursive(childNode, currentAnnotations, currentLink); // Use original annotations
              });
              return; // Stop processing this code tag further
          }
          break;
        case 'a':
          const href = $(currentNode).attr('href');
          if (href) {
            newLink = { url: href };
          }
          break;
        case 'br':
          // Insert newline character, handled during consolidation
           richText.push({ type: 'text', text: { content: '\n', link: null }, annotations: { ...currentAnnotations, color: currentAnnotations.color || 'default'}, plain_text: '\n', href: null }); // Add with current annotations
          return; // Don't process children of <br>
        case 'span': // Check for inline styles (better color handling for WebFlow)
          const style = $(currentNode).attr('style');
          if (style) {
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            const bgColorMatch = style.match(/background-color:\s*([^;]+)/i);
            
            if (colorMatch) {
              const colorValue = colorMatch[1].trim().toLowerCase();
              // Map to Notion colors - simplified approach
              if (colorValue.includes('red')) {
                newAnnotations.color = 'red';
              } else if (colorValue.includes('blue')) {
                newAnnotations.color = 'blue';
              } else if (colorValue.includes('green')) {
                newAnnotations.color = 'green';
              } else if (colorValue.includes('yellow')) {
                newAnnotations.color = 'yellow';
              } else if (colorValue.includes('orange')) {
                newAnnotations.color = 'orange';
              } else if (colorValue.includes('pink')) {
                newAnnotations.color = 'pink';
              } else if (colorValue.includes('purple')) {
                newAnnotations.color = 'purple';
              } else if (colorValue.includes('gray') || colorValue.includes('grey')) {
                newAnnotations.color = 'gray';
              } else if (colorValue.includes('brown')) {
                newAnnotations.color = 'brown';
              } else {
                newAnnotations.color = 'default';
              }
            } else if (bgColorMatch) {
              const bgColorValue = bgColorMatch[1].trim().toLowerCase();
              // Map to Notion background colors
              if (bgColorValue.includes('red')) {
                newAnnotations.color = 'red_background';
              } else if (bgColorValue.includes('blue')) {
                newAnnotations.color = 'blue_background';
              } else if (bgColorValue.includes('green')) {
                newAnnotations.color = 'green_background';
              } else if (bgColorValue.includes('yellow')) {
                newAnnotations.color = 'yellow_background';
              } else if (bgColorValue.includes('orange')) {
                newAnnotations.color = 'orange_background';
              } else if (bgColorValue.includes('pink')) {
                newAnnotations.color = 'pink_background';
              } else if (bgColorValue.includes('purple')) {
                newAnnotations.color = 'purple_background';
              } else if (bgColorValue.includes('gray') || bgColorValue.includes('grey')) {
                newAnnotations.color = 'gray_background';
              } else if (bgColorValue.includes('brown')) {
                newAnnotations.color = 'brown_background';
              } else {
                newAnnotations.color = 'default';
              }
            }
          }
          break;

        // Original behavior: Skip block elements in rich text context
        case 'p': case 'div': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        case 'blockquote': case 'pre': case 'hr': case 'ul': case 'ol': case 'li':
        case 'figure': case 'img': case 'table': case 'tr': case 'td': case 'th':
          // console.warn(`Skipping block tag <${tagName}> encountered within rich text context.`);
          return; // Skip these block elements entirely in rich text context

        // Ignore tags that don't map to annotations but process children
        default:
          break;
      }

      // Recursively process children nodes with potentially updated annotations/link
      $(currentNode).contents().each((_, childNode) => {
        processNodeRecursive(childNode, newAnnotations, newLink);
      });
    }
  };

  // Start processing from the initial node's children (if it's an element)
   if (node.type === 'tag'){
        $(node).contents().each((_, childNode) => {
            // Start with default annotations and no link for top-level children
            processNodeRecursive(childNode, {}, null);
        });
   } else if (node.type === 'text') {
        // Handle case where the root node passed is a text node (e.g., from figcaption)
        processNodeRecursive(node, {}, null);
   }


   // Consolidate the generated rich text segments
   return consolidateRichText(richText);
}

/**
 * Consolidates an array of rich text objects:
 * - Merges consecutive segments with identical annotations and links.
 * - Handles newlines from <br> tags correctly.
 * - Trims leading/trailing whitespace from the final array.
 * - Ensures plain_text is accurate.
 * @param {Array<object>} richTextArr - The input array of rich text objects.
 * @returns {Array<object>} - The consolidated array.
 */
function consolidateRichText(richTextArr) {
    if (!richTextArr || richTextArr.length === 0) {
        return [];
    }

    const consolidated = [];
    let currentSegment = null;

    for (const segment of richTextArr) {
        // Skip segments that became empty after whitespace normalization in the previous step (should be rare now)
        if (segment.type === 'text' && !segment.text.content) {
            continue;
        }

        if (currentSegment &&
            currentSegment.type === 'text' &&
            segment.type === 'text' &&
            segment.text.content !== '\n' && // Don't merge across explicit newlines
            currentSegment.text.content !== '\n' &&
            JSON.stringify(currentSegment.annotations) === JSON.stringify(segment.annotations) &&
            JSON.stringify(currentSegment.text.link) === JSON.stringify(segment.text.link))
        {
            // Merge with previous segment
            currentSegment.text.content += segment.text.content;
            // plain_text is generated at the end
        } else {
            // Start a new segment
            if (currentSegment) {
                consolidated.push(currentSegment);
            }
            // Deep copy the segment to avoid modifying the original array/objects
            currentSegment = JSON.parse(JSON.stringify(segment));
        }
    }

    // Push the last processed segment
    if (currentSegment) {
        consolidated.push(currentSegment);
    }

    // Re-calculate plain_text and perform final whitespace cleanup
    const finalConsolidated = [];
    consolidated.forEach(seg => {
        if(seg.type === 'text') {
            // Update plain_text after potential merging
            seg.plain_text = seg.text.content;
            finalConsolidated.push(seg);
        } else {
            // Keep non-text segments as is (e.g., mentions, equations - future)
            finalConsolidated.push(seg);
        }
    });

    // Trim leading whitespace ONLY from the very first text segment IF it's not just a newline
    if (finalConsolidated.length > 0 && finalConsolidated[0].type === 'text' && finalConsolidated[0].text.content !== '\n') {
        const originalContent = finalConsolidated[0].text.content;
        finalConsolidated[0].text.content = originalContent.trimStart();
         // Only update plain_text if content actually changed
        if (finalConsolidated[0].text.content !== originalContent) {
             finalConsolidated[0].plain_text = finalConsolidated[0].text.content;
        }
        // Remove segment if trimming made it empty AND it wasn't just a newline
        if (!finalConsolidated[0].text.content && originalContent !== '\n') {
            finalConsolidated.shift();
        }
    }

     // Trim trailing whitespace ONLY from the very last text segment IF it's not just a newline
     if (finalConsolidated.length > 0) {
        const lastIndex = finalConsolidated.length - 1;
        if (finalConsolidated[lastIndex].type === 'text' && finalConsolidated[lastIndex].text.content !== '\n') {
             const originalContent = finalConsolidated[lastIndex].text.content;
             finalConsolidated[lastIndex].text.content = originalContent.trimEnd();
             // Only update plain_text if content actually changed
            if (finalConsolidated[lastIndex].text.content !== originalContent) {
                finalConsolidated[lastIndex].plain_text = finalConsolidated[lastIndex].text.content;
            }
             // Remove segment if trimming made it empty AND it wasn't just a newline
             if (!finalConsolidated[lastIndex].text.content && originalContent !== '\n') {
                finalConsolidated.pop();
            }
        }
     }


    // Remove empty text segments that might have resulted from trimming, unless it's an intentional newline
    return finalConsolidated.filter(segment => segment.type !== 'text' || segment.text.content.length > 0 || segment.plain_text === '\n');
}

/**
 * Main function wrapper to process root elements and finalize list grouping.
 * @param {string} htmlString - The HTML string to convert.
 * @returns {Array<object>} - An array of Notion block objects.
 */
function convertHtmlToNotionBlocksInternal(htmlString) {
  // <<< Log Entry and Input >>>
  console.log(`[HTML->Notion] ENTERING convertHtmlToNotionBlocksInternal. Input HTML (first 100 chars):`, htmlString?.substring(0, 100));
  // <<< End Log >>>

 if (typeof htmlString !== 'string' || !htmlString.trim()) { // Added check for empty/whitespace string
    console.error("[HTML->Notion] Invalid or empty input HTML string.");
    return [];
  }

  try {
    const $ = cheerio.load(htmlString, { decodeEntities: true }); // Decode entities
    let blocks = [];
    // Select children of the BODY element instead of the root
    const rootElements = $('body').children(); 
    // console.log(`DEBUG: Found ${rootElements.length} root elements in HTML string.`); // Log root elements

    rootElements.each((index, element) => {
      // console.log(`DEBUG: Processing root element ${index}: ${element.tagName}`); // Log each root element being processed
      const convertedBlocks = convertElementToNotionBlock($, element);
      // console.log(`DEBUG: Element ${index} (${element.tagName}) converted to ${convertedBlocks.length} blocks.`); // Log block count
      blocks.push(...convertedBlocks);
    });

    // A final cleanup: Remove potentially empty paragraphs that might result
    // from constructs like <div><br></div> after processing.
    blocks = blocks.filter(block => {
        if (block.type === 'paragraph') {
            // Keep if rich_text has content or an intentional newline
            return block.paragraph.rich_text.length > 0 &&
                   block.paragraph.rich_text.some(rt => rt.text?.content?.trim() || rt.text?.content === '\n');
        }
        return true; // Keep non-paragraph blocks
    });


    return blocks;
  } catch (error) {
    console.error("Error parsing HTML:", error);
    return [];
  }
}

// Updated export to use the internal wrapper name
export { convertHtmlToNotionBlocksInternal as convertHtmlToNotionBlocks }; 