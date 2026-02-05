function apply(enabled) {
  document.documentElement.setAttribute("data-accessible", enabled ? "true" : "false");
}



// Apply saved setting on page load
chrome.storage.sync.get(["enabled"], (res) => {
  apply(!!res.enabled);
});

// Listen for popup toggle messages
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SET_ACCESSIBLE") apply(!!msg.enabled);
});
