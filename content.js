function enableFocusMode() {
  if (document.getElementById("focus-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "focus-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(0,0,0,0.8)";
  overlay.style.backdropFilter = "blur(14px)";
  overlay.style.zIndex = "999999";

  document.body.appendChild(overlay);
}

function disableFocusMode() {
  const overlay = document.getElementById("focus-overlay");
  if (overlay) overlay.remove();
}

function clickBestMatch(target) {
  if (!target) return { ok: false, error: "Missing target" };

  const needle = target.toLowerCase();
  const candidates = Array.from(document.querySelectorAll(
    "a, button, input[type='button'], input[type='submit'], [role='button']"
  ));

  let best = null;
  let bestScore = -1;

  for (const el of candidates) {
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
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

function startVoiceOnceOnPage(lang = "en-US") {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    return Promise.resolve({ ok: false, error: "SpeechRecognition not supported on this page." });
  }

  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      const text = ev.results?.[0]?.[0]?.transcript || "";
      resolve({ ok: true, text });
    };

    rec.onerror = (ev) => resolve({ ok: false, error: ev.error || "unknown" });

    rec.start();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT") {
    let text = "";
    const main = document.querySelector("article, main");
    text = (main ? main.innerText : document.body.innerText) || "";
    text = text.replace(/\s+/g, " ").trim();
    sendResponse({ text: text.slice(0, 12000) });
    return true;
  }

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

  if (msg.type === "CLICK") {
    const target = (msg.target || "").trim();
    sendResponse(clickBestMatch(target));
    return true;
  }

  // Voice recognition on the page context
  if (msg.type === "VOICE_ON_PAGE") {
    const lang = msg.lang || "en-US";
    startVoiceOnceOnPage(lang).then(sendResponse);
    return true;
  }
});
