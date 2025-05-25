// Word Memory Assistant - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const wordCountEl = document.getElementById('wordCount');
  const wordContainer = document.getElementById('wordContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // Load and display words when popup opens
  loadWords();

  // Event listeners
  refreshBtn.addEventListener('click', loadWords);
  clearAllBtn.addEventListener('click', clearAllWords);

  function loadWords() {
    // Get current active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Send message to content script to get words
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getWords'}, function(response) {
        if (chrome.runtime.lastError) {
          // Fallback to storage if content script not available
          loadWordsFromStorage();
        } else if (response && response.words) {
          displayWords(response.words);
        } else {
          loadWordsFromStorage();
        }
      });
    });
  }

  function loadWordsFromStorage() {
    chrome.storage.sync.get(['savedWords'], function(result) {
      const words = result.savedWords || [];
      displayWords(words);
    });
  }

  function displayWords(words) {
    wordCountEl.textContent = words.length;
    
    if (words.length === 0) {
      wordContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div>No words saved yet</div>
          <div style="font-size: 11px; margin-top: 4px;">Start collecting words by using Ctrl+Hover on any webpage!</div>
        </div>
      `;
      return;
    }

    // Sort words alphabetically
    words.sort();

    const wordsHTML = words.map(word => `
      <div class="word-item">
        <span class="word-text">${word}</span>
        <button class="remove-btn" data-word="${word}">Remove</button>
      </div>
    `).join('');

    wordContainer.innerHTML = wordsHTML;

    // Add event listeners to remove buttons
    const removeButtons = wordContainer.querySelectorAll('.remove-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const word = this.getAttribute('data-word');
        removeWord(word);
      });
    });

    // Add scrollbar class
    wordContainer.classList.add('scrollbar');
  }

  function removeWord(word) {
    // Get current active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Send message to content script to remove word
      chrome.tabs.sendMessage(tabs[0].id, {action: 'removeWord', word: word}, function(response) {
        if (chrome.runtime.lastError) {
          // Fallback to storage if content script not available
          removeWordFromStorage(word);
        } else {
          // Reload the word list
          loadWords();
        }
      });
    });
  }

  function removeWordFromStorage(word) {
    chrome.storage.sync.get(['savedWords'], function(result) {
      const words = result.savedWords || [];
      const updatedWords = words.filter(w => w !== word);
      chrome.storage.sync.set({savedWords: updatedWords}, function() {
        loadWords();
      });
    });
  }

  function clearAllWords() {
    if (confirm('Are you sure you want to remove all words from your list? This action cannot be undone.')) {
      // Get current active tab
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        // Send message to content script to clear all words
        chrome.tabs.sendMessage(tabs[0].id, {action: 'clearAllWords'}, function(response) {
          if (chrome.runtime.lastError) {
            // Fallback to storage if content script not available
            clearWordsFromStorage();
          } else {
            // Reload the word list
            loadWords();
          }
        });
      });
    }
  }

  function clearWordsFromStorage() {
    chrome.storage.sync.set({savedWords: []}, function() {
      loadWords();
    });
  }
});