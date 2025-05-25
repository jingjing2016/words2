// Word Memory Assistant - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const wordCountEl = document.getElementById('wordCount');
  const wordContainer = document.getElementById('wordContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportWordsBtn = document.getElementById('exportWordsBtn');
  const importWordsBtn = document.getElementById('importWordsBtn');
  const importFile = document.getElementById('importFile');

  // Load and display words when popup opens
  loadWords();

  // Event listeners
  refreshBtn.addEventListener('click', loadWords);
  clearAllBtn.addEventListener('click', clearAllWords);
  exportWordsBtn.addEventListener('click', exportWords);
  importWordsBtn.addEventListener('click', function() {
    importFile.click();
  });
  importFile.addEventListener('change', importWords);

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
    chrome.storage.local.get(['savedWords'], function(result) {
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
          <div style="font-size: 11px; margin-top: 4px;">Start collecting words by using 2+Hover on any webpage!</div>
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
    chrome.storage.local.get(['savedWords'], function(result) {
      const words = result.savedWords || [];
      const updatedWords = words.filter(w => w !== word);
      chrome.storage.local.set({savedWords: updatedWords}, function() {
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
    chrome.storage.local.set({savedWords: []}, function() {
      loadWords();
    });
  }

  function exportWords() {
    chrome.storage.local.get(['savedWords'], function(result) {
      const words = result.savedWords || [];
      if (words.length === 0) {
        alert('No words to export.');
        return;
      }
      const jsonString = JSON.stringify(words, null, 2);
      const blob = new Blob([jsonString], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'wordlist.json',
        saveAs: true
      }, function() {
        // Revoke the object URL after the download has started or completed
        URL.revokeObjectURL(url);
      });
    });
  }

  function importWords(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const fileContent = e.target.result;
        const importedWords = JSON.parse(fileContent);

        if (!Array.isArray(importedWords) || !importedWords.every(word => typeof word === 'string')) {
          alert('Invalid file format. Please select a JSON file containing an array of words.');
          return;
        }

        chrome.storage.local.set({savedWords: importedWords}, function() {
          loadWords();
          alert('Words imported successfully!');
        });
      } catch (error) {
        alert('Error parsing JSON file: ' + error.message);
      }
    };

    reader.onerror = function() {
      alert('Error reading file.');
    };

    reader.readAsText(file);
    importFile.value = null; // Reset file input
  }
});