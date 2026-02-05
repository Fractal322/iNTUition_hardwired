chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "EXTRACT") {
    let text = "";

    let main = document.querySelector("article, main");

    if (main) text = main.innerText;
    else text = document.body.innerText;

    text = text.replace(/\s+/g, " ").trim();

    sendResponse({text: text.slice(0, 8000)});
  }

});

function enableFocusMode() {

  if (document.getElementById("focus-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "focus-overlay";

  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";

  overlay.style.background = "rgba(0,0,0,0.4)";
  overlay.style.backdropFilter = "blur(5px)";
  overlay.style.zIndex = "999999";

  document.body.appendChild(overlay);
}

function disableFocusMode() {
  const overlay = document.getElementById("focus-overlay");
  if (overlay) overlay.remove();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "FOCUS_ON") enableFocusMode();
  if (msg.type === "FOCUS_OFF") disableFocusMode();
});

