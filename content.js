chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // EXTRACT main text
  if (msg.type === "EXTRACT") {
    let text = "";
    const main = document.querySelector("article, main");
    text = (main ? main.innerText : document.body.innerText) || "";
    text = text.replace(/\s+/g, " ").trim();
    sendResponse({ text: text.slice(0, 12000) });
    return true;
  }

  // FOCUS MODE
  if (msg.type === "FOCUS_ON") {
    enableFocusMode();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "FOCUS_OFF") {
    disableFocusMode();
    sendResponse({ ok: true });
    return true;
  }

  // SCROLL
  if (msg.type === "SCROLL_DOWN") {
    window.scrollBy({ top: msg.amount ?? Math.round(window.innerHeight * 0.8), left: 0, behavior: "smooth" });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "SCROLL_UP") {
    window.scrollBy({ top: -(msg.amount ?? Math.round(window.innerHeight * 0.8)), left: 0, behavior: "smooth" });
    sendResponse({ ok: true });
    return true;
  }

  // CLICK <target>
  if (msg.type === "CLICK") {
    const target = (msg.target || "").trim();
    const res = clickBestMatch(target);
    sendResponse(res);
    return true;
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
//  NEW: Floating panel pinned to corner
function ensureAccessAssistPanel() {
  if (document.getElementById("access-assist-panel")) return;

  const panel = document.createElement("div");
  panel.id = "access-assist-panel";

  // Minimal UI (you can replace innerHTML with your actual UI later)
  panel.innerHTML = `<div style="padding:10px;font-weight:bold;">Access Assist</div>`;

  //  Corner positioning
 panel.style.position = "fixed";
  panel.style.top = "20px";
  panel.style.right = "60px";     // 🔹 RIGHT side
  panel.style.width = "420px";
  panel.style.height = "600px";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #ccc";
  panel.style.borderRadius = "10px";
  panel.style.zIndex = "999999";
  panel.style.boxShadow = "0 8px 20px rgba(0,0,0,0.25)";
  panel.style.overflow = "auto";

  document.body.appendChild(panel);
}

// Call once so it appears on the page
ensureAccessAssistPanel();

// Try to click a link/button whose visible text best matches "target"
function clickBestMatch(target) {
  if (!target) return { ok: false, error: "Missing target" };

  const needle = target.toLowerCase();

  // candidates: links, buttons, inputs of type button/submit, and elements with role=button
  const candidates = Array.from(document.querySelectorAll(
    "a, button, input[type='button'], input[type='submit'], [role='button']"
  ));

  // prefer exact-ish text matches
  let best = null;
  let bestScore = -1;

  for (const el of candidates) {
    const text =
      (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();

    if (!text) continue;
    const hay = text.toLowerCase();

    let score = 0;
    if (hay === needle) score = 100;
    else if (hay.includes(needle)) score = 50 + Math.min(30, needle.length);
    else if (needle.includes(hay)) score = 20;

    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best || bestScore < 30) {
    return { ok: false, error: `No good match for "${target}"` };
  }

  best.scrollIntoView({ behavior: "smooth", block: "center" });
  best.click();
  return { ok: true, clickedText: (best.innerText || best.value || "").trim() };
}



