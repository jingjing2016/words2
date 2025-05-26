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

    // Sort words alphabetically by the 'word' property
    words.sort((a, b) => a.word.localeCompare(b.word));

    wordContainer.innerHTML = ''; // Clear previous content

    words.forEach(wordObj => {
      const wordItemDiv = document.createElement('div');
      wordItemDiv.className = 'word-item';

      const wordTextSpan = document.createElement('span');
      wordTextSpan.className = 'word-text';
      wordTextSpan.textContent = wordObj.word;
      if (wordObj.style) {
        wordTextSpan.classList.add(wordObj.style);
      }

      wordItemDiv.appendChild(wordTextSpan);
      wordContainer.appendChild(wordItemDiv);
    });

    // Add scrollbar class if needed
    if (words.length > 0) {
      wordContainer.classList.add('scrollbar');
    } else {
      wordContainer.classList.remove('scrollbar');
    }
  }

  // removeWord and removeWordFromStorage are no longer needed as individual removal is via hotkey 5.
  // "Clear All" button handles bulk removal.
  // The 'removeWord' message listener in content.js will handle requests if any other part sends it.

  function clearAllWords() {
    if (confirm('Are you sure you want to remove all words from your list? This action cannot be undone.')) {
      // Get current active tab
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length === 0) { // No active tab, fallback to storage
          clearWordsFromStorage();
          return;
        }
        // Send message to content script to clear all words
        chrome.tabs.sendMessage(tabs[0].id, {action: 'clearAllWords'}, function(response) {
          if (chrome.runtime.lastError) {
            // Fallback to storage if content script not available or error in sending
            console.warn("Error sending clearAllWords to content script:", chrome.runtime.lastError.message, "Falling back to storage.");
            clearWordsFromStorage();
          } else if (response && response.success) {
            loadWords(); // Reload to update the popup
          } else {
            // If content script reports failure or no response
            console.warn("Content script clearAllWords was not successful. Falling back to storage.");
            clearWordsFromStorage();
          }
        });
      });
    }
  }

  // function clearAllWords() { // This is the duplicated, simpler version. Removing it.
  //   if (confirm('Are you sure you want to remove all words from your list? This action cannot be undone.')) {
  //     // Get current active tab
  //     chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  //       // Send message to content script to clear all words
  //       chrome.tabs.sendMessage(tabs[0].id, {action: 'clearAllWords'}, function(response) {
  //         if (chrome.runtime.lastError) {
  //           // Fallback to storage if content script not available
  //           clearWordsFromStorage();
  //         } else {
  //           // Reload the word list
  //           loadWords();
  //         }
  //       });
  //     });
  //   }
  // }

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
        let importedData = JSON.parse(fileContent);

        // Validate and transform if necessary (e.g., old string array format)
        if (!Array.isArray(importedData)) {
          alert('Invalid file format. Expected a JSON array.');
          return;
        }

        let wordsToStore = [];
        if (importedData.length > 0 && typeof importedData[0] === 'string') {
          // Old format: array of strings. Convert to new format.
          wordsToStore = importedData.map(wordStr => ({ word: wordStr, style: 'style-highlight' }));
          alert('Old format detected and migrated. Words imported successfully!');
        } else if (importedData.every(item => item && typeof item.word === 'string' && typeof item.style === 'string')) {
          // New format: array of objects. Use as is.
          wordsToStore = importedData;
          alert('Words imported successfully!');
        } else {
          alert('Invalid file format. Please select a JSON file containing an array of words (strings) or word objects ({word, style}).');
          return;
        }
        
        chrome.storage.local.set({savedWords: wordsToStore}, function() {
          if (chrome.runtime.lastError) {
            alert('Error saving imported words: ' + chrome.runtime.lastError.message);
          } else {
            loadWords(); // Refresh the list in the popup
            // Also, try to inform content script to refresh its highlights
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'refreshHighlights'}, function(response) {
                  if (chrome.runtime.lastError) {
                    console.log("Could not send refreshHighlights message to content script after import.");
                  }
                });
              }
            });
          }
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