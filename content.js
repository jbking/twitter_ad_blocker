var adsHidden = 0;
var adSelector = "div[data-testid=placementTracking]";
var trendSelector = "div[data-testid=trend]";
var userSelector = "div[data-testid=UserCell]";
var articleSelector = "article[data-testid=tweet]";

// Default settings (will be overridden by stored preferences)
var switchToFollowingTab = true; 
var removePeopleToFollow = false;
var hasSuccessfullySwitchedTab = false; // Track if we've already successfully switched tabs
var userClickedForYouTab = false; // Track if user manually clicked For You tab
var lastTabSwitchTime = 0; // Track the last time we programmatically switched tabs
var shouldMonitorTabChanges = true; // Whether to keep monitoring tab changes
var tabCheckIntervalId = null; // ID for the tab checking interval

// Load user preferences from storage
chrome.storage.sync.get(
  {
    switchToFollowing: true,  // default to true
    removePeopleToFollow: false  // default to false
  },
  function(items) {
    switchToFollowingTab = items.switchToFollowing;
    removePeopleToFollow = items.removePeopleToFollow;
    console.log("Settings loaded:", items);
    console.log("Tab switching enabled:", switchToFollowingTab);
    
    // Initial actions after settings are loaded
    if (document.readyState === 'complete') {
      getAndHideAds();
      if (switchToFollowingTab) {
        // Log all tabs for debugging
        logAllTabs();
        switchToFollowing();
      }
    }
  }
);

// Helper function to log all tabs
function logAllTabs() {
  console.log("=== Current Tab Status ===");
  const tabs = document.querySelectorAll('a[role="tab"]');
  if (tabs.length === 0) {
    console.log("No tabs found on the page");
  }
  tabs.forEach(tab => {
    const selected = tab.getAttribute('aria-selected') === 'true';
    const text = tab.textContent.trim();
    console.log(`Tab: "${text}" | Selected: ${selected}`);
  });
  console.log("========================");
}

var sponsoredSvgPath = 'M20.75 2H3.25C2.007 2 1 3.007 1 4.25v15.5C1 20.993 2.007 22 3.25 22h17.5c1.243 0 2.25-1.007 2.25-2.25V4.25C23 3.007 21.993 2 20.75 2zM17.5 13.504c0 .483-.392.875-.875.875s-.875-.393-.875-.876V9.967l-7.547 7.546c-.17.17-.395.256-.62.256s-.447-.086-.618-.257c-.342-.342-.342-.896 0-1.237l7.547-7.547h-3.54c-.482 0-.874-.393-.874-.876s.392-.875.875-.875h5.65c.483 0 .875.39.875.874v5.65z';
var sponsoredBySvgPath = 'M19.498 3h-15c-1.381 0-2.5 1.12-2.5 2.5v13c0 1.38 1.119 2.5 2.5 2.5h15c1.381 0 2.5-1.12 2.5-2.5v-13c0-1.38-1.119-2.5-2.5-2.5zm-3.502 12h-2v-3.59l-5.293 5.3-1.414-1.42L12.581 10H8.996V8h7v7z';
var youMightLikeSvgPath = 'M12 1.75c-5.11 0-9.25 4.14-9.25 9.25 0 4.77 3.61 8.7 8.25 9.2v2.96l1.15-.17c1.88-.29 4.11-1.56 5.87-3.5 1.79-1.96 3.17-4.69 3.23-7.97.09-5.54-4.14-9.77-9.25-9.77zM13 14H9v-2h4v2zm2-4H9V8h6v2z';
var adsSvgPath = 'M19.498 3h-15c-1.381 0-2.5 1.12-2.5 2.5v13c0 1.38 1.119 2.5 2.5 2.5h15c1.381 0 2.5-1.12 2.5-2.5v-13c0-1.38-1.119-2.5-2.5-2.5zm-3.502 12h-2v-3.59l-5.293 5.3-1.414-1.42L12.581 10H8.996V8h7v7z';
var peopleFollowSvgPath = 'M17.863 13.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44zM12 2C9.791 2 8 3.79 8 6s1.791 4 4 4 4-1.79 4-4-1.791-4-4-4z';
var xAd = '>Ad<'; // TODO: add more languages; appears to only be used for English accounts as of 2023-08-03
const promotedTweetTextSet = new Set(['Promoted Tweet', 'プロモツイート', '広告']);

function getAds() {
  // Match SVG marker <path d="..."> elements directly. The old approach read
  // every div's innerHTML — a getter that re-serializes the whole subtree to
  // a string — and substring-scanned it 5+ times per div. On X's ~10k-div
  // timeline that dominated CPU (measured at ~24% of non-idle time).
  const pathDs = [sponsoredSvgPath, sponsoredBySvgPath, youMightLikeSvgPath, adsSvgPath];
  if (removePeopleToFollow) pathDs.push(peopleFollowSvgPath);
  const pathSelector = pathDs.map(d => `path[d="${d}"]`).join(',');

  const hits = new Set();
  document.querySelectorAll(pathSelector).forEach(el => hits.add(el));

  // Text-label markers render as <span>広告</span> / <span>Ad</span> / etc.
  // textContent doesn't trigger layout flush like innerText does.
  document.querySelectorAll('span').forEach(el => {
    const t = el.textContent.trim();
    if (promotedTweetTextSet.has(t) || t === 'Ad') hits.add(el);
  });

  return [...hits];
}

function hideAd(ad) {
  if (ad.closest(adSelector) !== null) { // Promoted tweets
    ad.closest(adSelector).remove();
    adsHidden += 1;
  } else if (ad.closest(trendSelector) !== null) {
    ad.closest(trendSelector).remove();
    adsHidden += 1;
  } else if (ad.closest(userSelector) !== null) {
    ad.closest(userSelector).remove();
    adsHidden += 1;
  } else if (ad.closest(articleSelector) !== null) {
    ad.closest(articleSelector).remove();
    adsHidden += 1;
  } else if (promotedTweetTextSet.has(ad.innerText)) {
    ad.remove();
    adsHidden += 1;
  }

  console.log('X ads hidden: ', adsHidden.toString());
}

function getAndHideAds() {
  getAds().forEach(hideAd)
}

// Function to switch to the Following tab
function switchToFollowing() {
  // Don't try to switch if the setting is off or we're no longer monitoring
  if (!switchToFollowingTab || !shouldMonitorTabChanges) {
    console.log("Tab switching disabled or monitoring stopped");
    return;
  }
  
  // Don't switch if user manually clicked For You tab recently
  if (userClickedForYouTab) {
    console.log("Not switching tabs because user manually clicked 'For You' tab");
    return;
  }
  
  // Log all tabs for debugging
  logAllTabs();
  
  // First, check if we're already on the Following tab
  // We need to check both the aria-selected attribute AND the text content
  const selectedTab = document.querySelector('a[role="tab"][aria-selected="true"]');
  if (selectedTab && selectedTab.textContent.includes('Following')) {
    console.log('Already on Following tab');
    hasSuccessfullySwitchedTab = true;
    return;
  }
  
  // Check if we're on a tab that's not "For you" (e.g., "Lists", "Messages", etc.)
  if (selectedTab && !selectedTab.textContent.includes('For you')) {
    console.log('On a tab other than "For you", not switching: ' + selectedTab.textContent.trim());
    return;
  }
  
  // If we recently switched tabs (within 2 seconds), don't try again immediately
  // This prevents rapid switching if there's a refresh cycle
  const now = Date.now();
  if (now - lastTabSwitchTime < 2000) {
    console.log('Recently switched tabs, waiting before trying again');
    return;
  }
  
  console.log('Attempting to switch to Following tab...');
  
  // Direct selector for the Following tab as an anchor element
  // Look for tab with "Following" text that isn't selected
  let followingTab = null;
  const allTabs = document.querySelectorAll('a[role="tab"]');
  for (const tab of allTabs) {
    if (tab.textContent.includes('Following') && tab.getAttribute('aria-selected') !== 'true') {
      followingTab = tab;
      break;
    }
  }
  
  if (followingTab) {
    console.log('Found Following tab with direct selector');
    // Found the tab and it's not already selected, click it
    try {
      followingTab.click();
      console.log('Switched to Following tab');
      hasSuccessfullySwitchedTab = true;
      lastTabSwitchTime = Date.now();
      return;
    } catch (e) {
      console.error('Error clicking Following tab:', e);
    }
  }
  
  // If still not found, try looking for exact match with specified HTML structure
  const followingLink = document.evaluate(
    "//a[@role='tab']//span[text()='Following']/ancestor::a[@role='tab']", 
    document, 
    null, 
    XPathResult.FIRST_ORDERED_NODE_TYPE, 
    null
  ).singleNodeValue;
  
  if (followingLink && followingLink.getAttribute('aria-selected') !== 'true') {
    try {
      console.log('Found Following tab via XPath');
      followingLink.click();
      console.log('Switched to Following tab (XPath method)');
      hasSuccessfullySwitchedTab = true;
      lastTabSwitchTime = Date.now();
      return;
    } catch (e) {
      console.error('Error clicking Following tab (XPath):', e);
    }
  }
  
  // If still not found, try the previous approach as a fallback
  const tabs = document.querySelectorAll('div[role="tablist"] div[role="presentation"]');
  
  for (const tab of tabs) {
    if (tab.textContent.includes('Following')) {
      // Check if it's not already selected
      const isSelected = tab.querySelector('div[style*="background-color: rgb(29, 155, 240)"]');
      if (!isSelected) {
        try {
          tab.click();
          console.log('Switched to Following tab (fallback method)');
          hasSuccessfullySwitchedTab = true;
          lastTabSwitchTime = Date.now();
        } catch (e) {
          console.error('Error clicking Following tab (fallback):', e);
        }
      } else {
        console.log('Already on Following tab (detected through color)');
        hasSuccessfullySwitchedTab = true;
        // Clear interval since we're already on the tab
        if (checkForFollowingTab) {
          clearInterval(checkForFollowingTab);
          checkForFollowingTab = null;
        }
      }
      break;
    }
  }
}

// hide ads on page load
document.addEventListener('load', () => {
  getAndHideAds();
  switchToFollowing();
});

// oftentimes, tweets render after onload. LCP should catch them.
new PerformanceObserver((entryList) => {
  getAndHideAds();
  switchToFollowing();
}).observe({type: 'largest-contentful-paint', buffered: true});

// Debounce function to delay execution until input stops
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// Must stay on setTimeout (deferred task) rather than removing synchronously
// inside the MutationObserver callback: synchronous .remove() races React's
// reconciliation on x.com/home and trips its "問題が発生しました" error
// boundary. 50ms is short enough that the ad flash on iframe auto-reload is
// imperceptible while still coalescing React's mutation bursts.
const debouncedHideAds = debounce(getAndHideAds, 50);

// Filter to real timeline content — skip background mutations (relative time
// label updates, notification badges, tooltips) so the full-page sweep only
// runs on actual new tweets / trends / Who-to-follow cells / promoted units.
const newContentSelector = `${articleSelector}, ${adSelector}, ${trendSelector}, ${userSelector}`;

const premiumAsideSelector = "aside[aria-label='Subscribe to Premium'], aside[aria-label='Upgrade to Premium+']";

// Coalesce premium-upsell removal so we don't schedule redundant tasks per
// mutation. Removal runs as a new task (setTimeout 0) to stay off React's
// current commit — same deferral semantics the old setInterval(500ms) had.
let premiumCheckPending = false;
function schedulePremiumAsideRemoval() {
  if (premiumCheckPending) return;
  premiumCheckPending = true;
  setTimeout(() => {
    premiumCheckPending = false;
    document.querySelectorAll(premiumAsideSelector).forEach(a => a.remove());
  }, 0);
}

const contentObserver = new MutationObserver((mutations) => {
  let sweepRelevant = false;
  let premiumSeen = false;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (!sweepRelevant && (node.matches?.(newContentSelector) || node.querySelector?.(newContentSelector))) {
        sweepRelevant = true;
      }
      if (!premiumSeen && (node.matches?.(premiumAsideSelector) || node.querySelector?.(premiumAsideSelector))) {
        premiumSeen = true;
      }
      if (sweepRelevant && premiumSeen) break;
    }
    if (sweepRelevant && premiumSeen) break;
  }
  if (sweepRelevant) debouncedHideAds();
  if (premiumSeen) schedulePremiumAsideRemoval();
});

// Start observing the document body for new content
setTimeout(() => {
  contentObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  // Catch premium asides that rendered before the observer started.
  schedulePremiumAsideRemoval();
  console.log('Observing for new content with debounced ad hiding');
}, 1000);

// Try switching tab immediately when page is interactive
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (switchToFollowingTab) {
      switchToFollowing();
    }
  }, 500); // Small delay to ensure the DOM has updated
});

// Keep checking for the "Following" tab if it doesn't load immediately
var checkForFollowingTab = setInterval(function() {
  if (switchToFollowingTab) {
    switchToFollowing();
  }
}, 1000);

// Event delegation: a single document-level capture-phase click listener
// handles every tab click, so we no longer need setInterval(2s) sweeping the
// tree to re-attach per-tab listeners (which also leaked when X remounted
// tabs with the same dataset flag cleared).
document.addEventListener('click', (e) => {
  const tab = e.target.closest?.('a[role="tab"]');
  if (!tab) return;
  const text = tab.textContent;
  if (text.includes('For you')) {
    console.log('User clicked "For You" tab');
    userClickedForYouTab = true;
    setTimeout(() => {
      userClickedForYouTab = false;
      console.log('User "For You" click timeout expired, resuming auto-switching');
    }, 7000);
  } else if (text.includes('Following')) {
    console.log('User clicked "Following" tab');
    hasSuccessfullySwitchedTab = true;
  }
}, true);

// Function to stop monitoring tab changes after some time
function stopTabMonitoring() {
  console.log('Stopping tab change monitoring');
  shouldMonitorTabChanges = false;
  
  // Clear all tab-related intervals
  if (tabCheckIntervalId) {
    clearInterval(tabCheckIntervalId);
    tabCheckIntervalId = null;
  }
  
  if (checkForFollowingTab) {
    clearInterval(checkForFollowingTab);
    checkForFollowingTab = null;
  }
  
  // Disconnect the MutationObserver
  if (tabObserver) {
    tabObserver.disconnect();
  }
}

// Function to check if we need to switch to Following tab
function checkCurrentTab() {
  // Only check if we should be switching tabs and if we're still monitoring
  if (!switchToFollowingTab || !shouldMonitorTabChanges) return;
  
  // Don't react if user manually clicked For You
  if (userClickedForYouTab) return;
  
  // Log all tabs for debugging
  logAllTabs();
  
  // Check all tabs to find the currently selected one
  const tabs = document.querySelectorAll('a[role="tab"]');
  let selectedTabContent = null;
  
  // First, find which tab is selected
  for (const tab of tabs) {
    if (tab.getAttribute('aria-selected') === 'true') {
      selectedTabContent = tab.textContent.trim();
      console.log('Selected tab is: "' + selectedTabContent + '"');
      break;
    }
  }
  
  // If no tab is selected or we can't determine which one, do nothing
  if (!selectedTabContent) {
    console.log('No tab appears to be selected');
    return;
  }
  
  // Check if we're already on "Following" tab
  if (selectedTabContent.includes('Following')) {
    console.log('Already on Following tab');
    hasSuccessfullySwitchedTab = true;
    return;
  }
  
  // Only switch if we're specifically on "For you" tab
  if (selectedTabContent.includes('For you')) {
    console.log('On "For you" tab, will attempt to switch to Following');
    hasSuccessfullySwitchedTab = false;
    setTimeout(switchToFollowing, 500);
  } else {
    // We're on some other tab like "Lists" or "Highlights", leave it alone
    console.log('On tab "' + selectedTabContent + '", not switching');
  }
}

// Run the check periodically
tabCheckIntervalId = setInterval(checkCurrentTab, 2000);

// Also set up a MutationObserver for more responsive detection
const tabObserver = new MutationObserver(function(mutations) {
  // Stop processing if we're no longer monitoring
  if (!shouldMonitorTabChanges) return;
  
  for (const mutation of mutations) {
    // If we observe a change to aria-selected attribute
    if (mutation.type === 'attributes' && 
        mutation.attributeName === 'aria-selected' && 
        mutation.target.getAttribute('aria-selected') === 'true') {
      
      // Run a check immediately when a tab becomes selected
      checkCurrentTab();
      return;
    }
  }
});

// Start observing tab changes
tabObserver.observe(document.body, { 
  subtree: true, 
  attributes: true, 
  attributeFilter: ['aria-selected'] 
});

// Try one more time after the page is fully loaded
window.addEventListener('load', function() {
  setTimeout(function() {
    if (switchToFollowingTab) {
      switchToFollowing();
      
      // Stop monitoring tab changes after 7 seconds
      setTimeout(function() {
        if (hasSuccessfullySwitchedTab) {
          stopTabMonitoring();
        }
      }, 7000);
    }
  }, 1500); // Larger delay after page is fully loaded
});

// URL-change detection: popstate covers back/forward, and a low-frequency
// location.href poll covers SPA pushState navigations (content scripts run in
// an isolated world so patching history.pushState here does not intercept the
// page world's calls). The previous implementation observed the entire
// document childList+subtree just to compare location — by far the hottest
// cross-cutting observer in the script.
let lastUrl = location.href;
function onUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  console.log('URL changed, resetting tab switch state');
  hasSuccessfullySwitchedTab = false;
  userClickedForYouTab = false;
  shouldMonitorTabChanges = true;

  if (location.pathname === '/' || location.pathname === '/home') {
    setTimeout(switchToFollowing, 1000);
    setTimeout(function() {
      if (hasSuccessfullySwitchedTab) {
        stopTabMonitoring();
      }
    }, 7000);
  }
}
window.addEventListener('popstate', onUrlChange);
setInterval(onUrlChange, 500);

// Listen for changes to the settings
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync') {
    if (changes.switchToFollowing) {
      switchToFollowingTab = changes.switchToFollowing.newValue;
      console.log('Setting updated: switchToFollowing =', switchToFollowingTab);
      
      // If the setting was turned off, clear the interval
      if (!switchToFollowingTab && checkForFollowingTab) {
        clearInterval(checkForFollowingTab);
        checkForFollowingTab = null;
      } 
      // If the setting was turned on, reset flag and try switching
      else if (switchToFollowingTab) {
        hasSuccessfullySwitchedTab = false;
        switchToFollowing();
      }
    }
    if (changes.removePeopleToFollow) {
      removePeopleToFollow = changes.removePeopleToFollow.newValue;
      console.log('Setting updated: removePeopleToFollow =', removePeopleToFollow);
      // Re-run ad hiding to apply the new setting
      getAndHideAds();
    }
  }
});