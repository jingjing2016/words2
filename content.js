// Word Memory Assistant - Content Script

let savedWords = []; // Changed from Set to Array
let lastMouseEvent = null;
let mutationObserver = null; // Declare the observer variable

// Load saved words from storage
chrome.storage.local.get(['savedWords'], function(result) {
  if (result.savedWords && Array.isArray(result.savedWords)) {
    if (result.savedWords.length > 0 && typeof result.savedWords[0] === 'string') {
      // Old format, migrate
      savedWords = result.savedWords.map(wordStr => ({ word: wordStr, style: 'style-highlight' }));
    } else if (result.savedWords.length > 0 && typeof result.savedWords[0] === 'object') {
      // Assume new format, filter for valid items
      savedWords = result.savedWords.filter(item => item && typeof item.word === 'string' && typeof item.style === 'string');
    } else {
      savedWords = []; // Empty or unrecognized format
    }
  } else {
    savedWords = [];
  }

  function onDomReady() {
    if (savedWords.length > 0) { // Changed from size to length
      highlightSavedWords(); // Initial highlight for static content
    }
    initMutationObserver(); // Start observing for dynamic content
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }
});

// Track mouse position
document.addEventListener('mousemove', function(e) {
  lastMouseEvent = e;
});

// Track Ctrl key state
document.addEventListener('keydown', function(e) {
  if (['2', '3', '4', '5'].includes(e.key)) {
    if (!lastMouseEvent) return; // Ensure we have a mouse event

    const word = getWordUnderCursor(lastMouseEvent);
    if (!word || word.length <= 2) return;

    let styleKey = '';
    const wordIndex = savedWords.findIndex(item => item.word === word);

    if (e.key === '2' || e.key === '3' || e.key === '4') {
      if (e.key === '2') styleKey = 'style-highlight';
      else if (e.key === '3') styleKey = 'style-green';
      else if (e.key === '4') styleKey = 'style-underline';

      if (wordIndex === -1) { // Word not found, add it
        savedWords.push({ word: word, style: styleKey });
        showMessage(`"${word}" added with ${styleKey}!`, 'success');
      } else { // Word found, update its style
        // If current style is same as new style, consider it a "remove" action for that style, then re-add if different
        // For simplicity now, just update or re-apply.
        savedWords[wordIndex].style = styleKey;
        showMessage(`"${word}" style changed to ${styleKey}!`, 'success');
      }
      applyStyleToWordInPage(word, styleKey);
      saveWordsToStorage();
    } else if (e.key === '5') {
      if (wordIndex !== -1) {
        savedWords.splice(wordIndex, 1);
        removeStyleFromWordInPage(word); // Visually remove from page
        saveWordsToStorage();
        showMessage(`"${word}" removed!`, 'info');
      } else {
        showMessage(`"${word}" not found in your list.`, 'warning');
      }
    }
  }
});

// Extract word under cursor
function getWordUnderCursor(e) {
  const element = e.target;
  let word = null; 

  // Priority 1: Check if the cursor is directly over a highlight span
  if (element.classList.contains('word-memory-highlight')) {
    const textFromHighlight = element.textContent.toLowerCase().trim();
    // Validate the extracted text: length > 2 and only letters
    if (textFromHighlight.length > 2 && /^[a-zA-Z]+$/.test(textFromHighlight)) {
      return textFromHighlight; // Return this word directly
    } else {
      // Content of highlight span isn't a valid word (e.g., too short, manipulated, or was never valid)
      return null; // Don't try other methods if the direct target was an invalid/short highlight
    }
  }
  
  // Priority 2: Skip script, style, or our own message elements if not a highlight
  if (element.tagName === 'SCRIPT' || 
      element.tagName === 'STYLE' ||
      element.closest('.word-memory-message')) {
    return null;
  }
  
  // Priority 3: Try multiple methods to get the word under cursor if not a highlight or skipped tag
  // Method 1: Use caretRangeFromPoint (most accurate for text nodes)
  // Re-initialize word to null here as it's used by subsequent methods
  // word = null; // This line is actually not needed due to `let word = null` at the start and no reassignment before this block if highlight path not taken.

  const range = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    const offset = range.startOffset;
    const textContent = textNode.textContent;
    
    // Find word boundaries around the cursor position
    let start = offset;
    let end = offset;
    
    // Move start backward to find word start
    while (start > 0 && /[a-zA-Z]/.test(textContent[start - 1])) {
      start--;
    }
    
    // Move end forward to find word end
    while (end < textContent.length && /[a-zA-Z]/.test(textContent[end])) {
      end++;
    }
    
    if (start < end) {
      word = textContent.substring(start, end).toLowerCase();
    }
  }
  
  // Method 2: Fallback - extract from element text content
  if (!word || !word.match(/^[a-zA-Z]+$/)) {
    const text = element.textContent || element.innerText || '';
    if (text) {
      // Get element bounds
      const rect = element.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      
      // Simple word extraction based on mouse position
      const words = text.match(/\b[a-zA-Z]+\b/g);
      if (words && words.length > 0) {
        // For simple cases, just return the first valid word
        // This is a fallback when precise positioning fails
        const elementText = text.toLowerCase();
        for (let testWord of words) {
          if (testWord.length > 2 && /^[a-zA-Z]+$/.test(testWord)) {
            word = testWord.toLowerCase();
            break;
          }
        }
      }
    }
  }
  
  // Method 3: Enhanced selection-based approach
  if (!word || !word.match(/^[a-zA-Z]+$/)) {
    try {
      // Create a temporary selection to find word boundaries
      const selection = window.getSelection();
      const originalRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
      
      // Clear selection and create new range at mouse position
      selection.removeAllRanges();
      const newRange = document.caretRangeFromPoint(e.clientX, e.clientY);
      
      if (newRange) {
        // Expand range to word boundaries
        newRange.expand('word');
        const selectedText = newRange.toString().trim();
        
        if (selectedText && /^[a-zA-Z]+$/.test(selectedText)) {
          word = selectedText.toLowerCase();
        }
        
        // Restore original selection
        selection.removeAllRanges();
        if (originalRange) {
          selection.addRange(originalRange);
        }
      }
    } catch (err) {
      // Ignore errors from range operations
    }
  }
  
  // Return valid word or null
  const resultWord = (word && word.length > 2 && /^[a-zA-Z]+$/.test(word)) ? word : null;
  return resultWord;
}

// Save words to Chrome storage
function saveWordsToStorage() {
  chrome.storage.local.set({
    savedWords: savedWords // No longer need Array.from
  });
}

// Apply a specific style to instances of a word on the page
function applyStyleToWordInPage(wordText, styleKey, rootNode = document.body) {
  const regex = new RegExp(`\\b${wordText}\\b`, 'gi');
  const styleClasses = ['style-highlight', 'style-green', 'style-underline'];

  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (node.parentElement && 
            (node.parentElement.tagName === 'SCRIPT' || 
             node.parentElement.tagName === 'STYLE' ||
             node.parentElement.closest('.word-memory-message'))) {
          return NodeFilter.FILTER_REJECT;
        }
        // If the parent is already a styled span by us, we might need to re-evaluate or skip.
        // For now, if the text content itself matches, we'll process it.
        // This simple check avoids processing children of our own spans if they somehow get re-inserted.
        if (node.parentElement && styleClasses.some(cls => node.parentElement.classList.contains(cls)) && node.parentElement.textContent.toLowerCase() === wordText.toLowerCase()) {
            // If the parent is ALREADY a span we created for THIS word, just update its class
            if (node.parentElement.textContent.toLowerCase() === wordText.toLowerCase()) {
                 styleClasses.forEach(cls => node.parentElement.classList.remove(cls));
                 node.parentElement.classList.add(styleKey);
                 return NodeFilter.FILTER_REJECT; // Already handled
            }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const textNodesToProcess = [];
  let currentNode;
  while (currentNode = walker.nextNode()) {
    if (rootNode.contains(currentNode) && regex.test(currentNode.textContent)) {
      regex.lastIndex = 0; // Reset regex
      textNodesToProcess.push(currentNode);
    }
  }

  textNodesToProcess.forEach(textNode => {
    if (!textNode.parentElement || !rootNode.contains(textNode)) return;

    // If the direct parent is already a span we manage for this word, update it and skip further processing for this node.
    if (textNode.parentElement.classList && styleClasses.some(cls => textNode.parentElement.classList.contains(cls)) && textNode.parentElement.textContent.toLowerCase() === wordText.toLowerCase()) {
        styleClasses.forEach(cls => textNode.parentElement.classList.remove(cls));
        textNode.parentElement.classList.add(styleKey);
        return; // Skip to next textNode
    }
    
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0; 

    while ((match = regex.exec(textNode.textContent)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      // Remove any pre-existing managed styles (though on a new span, this is for robustness)
      styleClasses.forEach(cls => span.classList.remove(cls));
      span.className = styleKey; // Set the new style
      span.textContent = match[0];
      fragment.appendChild(span);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < textNode.textContent.length) {
      fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex)));
    }

    if (fragment.childNodes.length > 0) {
      textNode.parentElement.replaceChild(fragment, textNode);
    }
  });
}

// Highlight all saved words across the entire document
function highlightSavedWords() {
  savedWords.forEach(item => {
    applyStyleToWordInPage(item.word, item.style, document.body);
  });
}

// Remove all styles from instances of a word on the page
function removeStyleFromWordInPage(wordText, rootNode = document.body) {
  const styleClasses = ['style-highlight', 'style-green', 'style-underline'];
  // Query all elements that might have one of our styles
  const highlights = rootNode.querySelectorAll(styleClasses.map(cls => `.${cls}`).join(','));

  highlights.forEach(highlight => {
    if (highlight.textContent.toLowerCase() === wordText.toLowerCase()) {
      const parent = highlight.parentElement;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize(); // Merges adjacent text nodes
      }
    }
  });
}

// Show success/info messages
function showMessage(text, type) {
  const message = document.createElement('div');
  message.className = `word-memory-message ${type}`;
  message.textContent = text;
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    message.classList.remove('show');
    setTimeout(() => {
      if (message.parentElement) {
        message.parentElement.removeChild(message);
      }
    }, 300);
  }, 2000);
}

// MutationObserver callback and initialization
function mutationCallback(mutationsList, observer) {
  if (savedWords.length === 0) {
    return;
  }

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach(addedNode => {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          // Skip if the added node itself is one of our styled spans or messages
          if (addedNode.classList && (addedNode.classList.contains('style-highlight') ||
              addedNode.classList.contains('style-green') ||
              addedNode.classList.contains('style-underline') ||
              addedNode.closest('.word-memory-message') ||
              addedNode.tagName === 'SCRIPT' || 
              addedNode.tagName === 'STYLE')) {
            return; 
          }
          // Process saved words for this new node
          savedWords.forEach(item => {
            applyStyleToWordInPage(item.word, item.style, addedNode);
          });
        } else if (addedNode.nodeType === Node.TEXT_NODE && addedNode.parentElement) {
          const parentElement = addedNode.parentElement;
          // Skip if the parent is part of our UI or utility tags
          if (parentElement.classList.contains('style-highlight') ||
              parentElement.classList.contains('style-green') ||
              parentElement.classList.contains('style-underline') ||
              parentElement.closest('.word-memory-message') ||
              parentElement.tagName === 'SCRIPT' ||
              parentElement.tagName === 'STYLE') {
            return;
          }
          // Process saved words for the parent of this new text node
          savedWords.forEach(item => {
            applyStyleToWordInPage(item.word, item.style, parentElement);
          });
        }
      });
    }
  }
}

function initMutationObserver() {
  if (mutationObserver) {
    return; 
  }
  const observerOptions = {
    childList: true, 
    subtree: true    
  };
  mutationObserver = new MutationObserver(mutationCallback);
  mutationObserver.observe(document.body, observerOptions);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getWords') {
    sendResponse({words: savedWords}); 
  } else if (request.action === 'removeWord') {
    // This message might be deprecated if popup directly manipulates its list and calls save.
    // For now, assume it's still used by popup for direct removal.
    const wordToRemove = request.word;
    const wordIndex = savedWords.findIndex(item => item.word === wordToRemove);
    if (wordIndex !== -1) {
      savedWords.splice(wordIndex, 1);
      removeStyleFromWordInPage(wordToRemove);
      saveWordsToStorage();
      sendResponse({success: true});
    } else {
      sendResponse({success: false, message: "Word not found"});
    }
  } else if (request.action === 'clearAllWords') {
    savedWords.forEach(item => removeStyleFromWordInPage(item.word)); // Remove all styles from page
    savedWords = []; 
    saveWordsToStorage();
    sendResponse({success: true});
  } else if (request.action === 'refreshHighlights') {
    // This is a new action that can be called, for example, after importing words.
    // It re-applies all highlights based on the current savedWords list.
    // First, it might be good to clear existing highlights to avoid duplicates if words were removed/styles changed
    // This depends on how robust applyStyleToWordInPage is. Assuming it handles already styled words correctly.
    highlightSavedWords(); // Re-apply all highlights
    sendResponse({success: true, message: "Highlights refreshed"});
  }
});