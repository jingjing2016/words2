// Word Memory Assistant - Content Script

let isHotkeyPressed = false;
let hotkeyPressTimer = null; // Added to store the timer ID
let savedWords = new Set();
let lastMouseEvent = null;
let mutationObserver = null; // Declare the observer variable

// Load saved words from storage
chrome.storage.local.get(['savedWords'], function(result) {
  if (result.savedWords && Array.isArray(result.savedWords)) {
    savedWords = new Set(result.savedWords);
  } else {
    savedWords = new Set(); // Ensure savedWords is always a Set
  }

  function onDomReady() {
    if (savedWords.size > 0) {
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
  if (e.key === '2' && !isHotkeyPressed) {
    isHotkeyPressed = true;
    clearTimeout(hotkeyPressTimer); // Clear any existing timer

    hotkeyPressTimer = setTimeout(() => {
      if (isHotkeyPressed && lastMouseEvent) { // Check if Ctrl is still pressed
        const word = getWordUnderCursor(lastMouseEvent);
        if (word && word.length > 2) {
          if (savedWords.has(word)) {
            removeWord(word);
          } else {
            addWord(word);
          }
        }
      }
    }, 500); // 0.5-second delay
  }
});

document.addEventListener('keyup', function(e) {
  if (e.key === '2') {
    isHotkeyPressed = false;
    clearTimeout(hotkeyPressTimer); // Clear the timer on key up
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

// Add word to saved list
function addWord(word) {
  savedWords.add(word);
  saveWordsToStorage();
  highlightWord(word);
  
  // Show success message
  showMessage(`"${word}" added to your word list!`, 'success');
}

// Remove word from saved list
function removeWord(word) {
  savedWords.delete(word);
  saveWordsToStorage();
  removeHighlight(word);
  
  // Show success message
  showMessage(`"${word}" removed from your word list!`, 'info');
}

// Save words to Chrome storage
function saveWordsToStorage() {
  chrome.storage.local.set({
    savedWords: Array.from(savedWords)
  });
}

// Highlight a specific word within a given rootNode
function highlightWord(word, rootNode = document.body) {
  const regex = new RegExp(`\\b${word}\\b`, 'gi'); // g for global, i for case-insensitive
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT,
    { // Filter function
      acceptNode: function(node) {
        // Reject nodes whose parent is a SCRIPT, STYLE, or already highlighted element
        if (node.parentElement) {
          const parentTag = node.parentElement.tagName;
          if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || 
              node.parentElement.classList.contains('word-memory-highlight') ||
              node.parentElement.closest('.word-memory-highlight')) { // Check ancestors too
            return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
  
  const textNodesToReplace = [];
  let currentNode;
  // First, collect all text nodes that match and need replacement
  while (currentNode = walker.nextNode()) {
     // Check if the node's content actually matches the regex
     // and ensure it's still part of the intended rootNode
    if (rootNode.contains(currentNode) && regex.test(currentNode.textContent)) {
      regex.lastIndex = 0; // Reset lastIndex due to regex.test potentially advancing it
      textNodesToReplace.push(currentNode);
    }
  }

  // Then, iterate over the collected nodes to perform replacements
  textNodesToReplace.forEach(textNode => {
    // Ensure the node is still in the DOM and part of the rootNode before manipulating
    if (!textNode.parentElement || !rootNode.contains(textNode)) {
      return;
    }
    // If parent itself became a highlight (e.g. by sibling node processing), skip.
    if (textNode.parentElement.classList.contains('word-memory-highlight')) {
        return;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0; // Reset regex for exec loop

    // Loop through all matches of the word in the current text node
    while ((match = regex.exec(textNode.textContent)) !== null) {
      // Add the text part before the match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex, match.index)));
      }
      // Create and add the highlight span
      const span = document.createElement('span');
      span.className = 'word-memory-highlight';
      span.textContent = match[0]; // Use match[0] for the exact matched word (maintains case)
      fragment.appendChild(span);
      lastIndex = regex.lastIndex;
    }
    
    // Add any remaining text after the last match
    if (lastIndex < textNode.textContent.length) {
      fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex)));
    }

    // Replace the original text node with the fragment containing text and spans
    if (fragment.childNodes.length > 0) { // Check if fragment has content
        textNode.parentElement.replaceChild(fragment, textNode);
    }
  });
}

// Highlight all saved words across the entire document
function highlightSavedWords() {
  savedWords.forEach(word => {
    highlightWord(word, document.body); // Explicitly pass document.body for initial full-page scan
  });
}

// Remove highlight for a specific word
function removeHighlight(word) {
  const highlights = document.querySelectorAll('.word-memory-highlight');
  highlights.forEach(highlight => {
    if (highlight.textContent.toLowerCase() === word.toLowerCase()) {
      const parent = highlight.parentElement;
      if (parent) { // Ensure parent exists before trying to manipulate
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
      } else if (document.body.contains(highlight)) { 
        // Fallback if parent is somehow null but highlight is in body (less common)
        // This case might indicate an issue elsewhere or a very unusual DOM structure
        // For simplicity, this basic fallback might not always work as expected without a valid parent.
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
  if (savedWords.size === 0) {
    return;
  }

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach(addedNode => {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          if (addedNode.classList.contains('word-memory-highlight') || 
              addedNode.closest('.word-memory-message') ||
              addedNode.tagName === 'SCRIPT' || 
              addedNode.tagName === 'STYLE') {
            return; 
          }
          savedWords.forEach(word => {
            highlightWord(word, addedNode); 
          });
        } else if (addedNode.nodeType === Node.TEXT_NODE && addedNode.parentElement) {
          const parentElement = addedNode.parentElement;
          if (parentElement.classList.contains('word-memory-highlight') ||
              parentElement.closest('.word-memory-message') ||
              parentElement.tagName === 'SCRIPT' ||
              parentElement.tagName === 'STYLE') {
            return;
          }
          savedWords.forEach(word => {
            highlightWord(word, parentElement);
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
    sendResponse({words: Array.from(savedWords)});
  } else if (request.action === 'removeWord') {
    removeWord(request.word);
    sendResponse({success: true});
  } else if (request.action === 'clearAllWords') {
    savedWords.clear();
    saveWordsToStorage();
    // Remove all highlights
    const highlights = document.querySelectorAll('.word-memory-highlight');
    highlights.forEach(highlight => {
      const parent = highlight.parentElement;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
      }
    });
    sendResponse({success: true});
  }
});