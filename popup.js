// ============================
// State
// ============================
let lastSummaryText = "";
let focusOn = false;
let voicePref = null; // "enabled" | "disabled" | null

const VOICE_PREF_KEY = "voice_enabled_pref"; // stored as "enabled" | "disabled"

// ============================
// Storage helpers
// ============================
function getVoicePref() {
  return new Promise((resolve) => {
    chrome.storage.local.get([VOICE_PREF_KEY], (res) => resolve(res[VOICE_PREF_KEY] || null));
  });
}

function setVoicePref(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [VOICE_PREF_KEY]: value }, () => resolve());
  });
}

// ============================
// DOM helpers
// ============================
function $(id) {
  return document.getElementById(id);
}

function showVoiceModal(show) {
  const modal = $("voiceModal");
  if (modal) modal.style.display = show ? "block" : "none";
}

function setOutput(text) {
  const out = $("output");
  if (!out) return;

  out.textContent = text;

  // Auto-read when voice assistance enabled
  if (voicePref === "enabled") {
    const t = (text || "").trim();
    if (t) speak(t);
  }
}


// ============================
// Tab / injection
// ============================
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function ensureHttpTab(tab) {
  const url = tab?.url || "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Open a normal website (http/https). Extensions can’t run on chrome:// pages.");
  }
}

async function ensureContentInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

// ============================
// Summary formatting
// ============================
function formatServerSummary(data) {
  const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
  const actions = Array.isArray(data?.key_actions) ? data.key_actions : [];

  let out = "";

  if (bullets.length) {
    for (const b of bullets) out += `• ${b}\n`;
    out += "\n";
  }

  if (actions.length) {
    out += `Key actions: ${actions.join(", ")}\n`;
  }

  return out.trim();
}
// ============================
// Text-to-speech
// ============================
function speak(text) {
  text = (text || "").trim();
  if (!text) return;

  speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.rate = 1.0;
  u.pitch = 1.0;

  speechSynthesis.speak(u);
}


// ============================
// Server interactions (via background.js)
// ============================
async function interpretRequest(userText) {
  const res = await chrome.runtime.sendMessage({ type: "INTERPRET", request: userText });
  if (!res?.ok) throw new Error(res?.error || "Interpret failed");
  return (res.data?.command || "").trim();
}

async function runSummarise() {
  const tab = await getTab();
  if (!tab?.id) throw new Error("No active tab.");
  ensureHttpTab(tab);

  await ensureContentInjected(tab.id);

  const extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
  const text = extracted?.text || "";

  const res = await chrome.runtime.sendMessage({ type: "SUMMARISE", text });
  if (!res?.ok) {
    setOutput(`Summarise failed.\n\n${res?.error || ""}\n\nIs your server running on http://localhost:3000 ?`);
    return;
  }

  const formatted = formatServerSummary(res.data);
  lastSummaryText = formatted;
  setOutput(formatted);
}

async function runCommand(command) {
  const tab = await getTab();
  if (!tab?.id) throw new Error("No active tab.");
  ensureHttpTab(tab);

  await ensureContentInjected(tab.id);

  const c = (command || "").toLowerCase();

  if (c === "summarise") return runSummarise();
  if (c === "read summary") return $("speak")?.click();
  if (c === "extract text") return $("extract")?.click();

  if (c === "focus mode on") {
    focusOn = true;
    await chrome.tabs.sendMessage(tab.id, { type: "FOCUS_ON" });
    setOutput("Focus mode: ON");
    return;
  }

  if (c === "focus mode off") {
    focusOn = false;
    await chrome.tabs.sendMessage(tab.id, { type: "FOCUS_OFF" });
    setOutput("Focus mode: OFF");
    return;
  }

  if (c === "scroll down") {
    await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_DOWN" });
    return;
  }

  if (c === "scroll up") {
    await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_UP" });
    return;
  }

  if (c.startsWith("click ")) {
    const target = command.slice("click ".length).trim();
    const r = await chrome.tabs.sendMessage(tab.id, { type: "CLICK", target });
    setOutput(r?.ok ? `Clicked: ${r.clickedText || target}` : `Click failed: ${r?.error || "unknown error"}`);
    return;
  }

  setOutput(`Unknown command:\n${command}\n\nTry: summarise / extract text / scroll down / click <target>`);
}

// NEW: Ask GPT (optionally send page text too)
async function askGpt(userText) {
  const tab = await getTab();
  await ensureContentInjected(tab.id);

  // optional: include page text to help GPT answer about the current page
  let pageText = "";
  try {
    const extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
    pageText = extracted?.text || "";
  } catch (_) {}

  const res = await chrome.runtime.sendMessage({
    type: "ASK",
    input: userText,
    page_text: pageText
  });

  if (!res?.ok) throw new Error(res?.error || "Ask failed");
  return (res.data?.answer || "").trim();
}

// Run request button
async function runFromTextbox() {
  const req = document.getElementById("req").value.trim();
  if (!req) return;

  const mode = document.getElementById("reqMode")?.value || "ask";
  const out = document.getElementById("output");

  if (mode === "command") {
    out.textContent = "Interpreting request...";
    try {
      const cmd = await interpretRequest(req);
      out.textContent = `Command: ${cmd}\nRunning...`;
      await runCommand(cmd);
    } catch (e) {
      out.textContent =
        `Interpret failed.\n\n${String(e?.message || e)}\n\nIs your server running on http://localhost:3000 ?`;
    }
    return;
  }

  // default: ask GPT
  setOutput("Asking GPT...");
  try {
    const answer = await askGpt(req);
    setOutput(answer || "No answer returned.");
  } catch (e) {
    out.textContent =
      `Ask failed.\n\n${String(e?.message || e)}\n\nIs your server running on http://localhost:3000 ?`;
  }
}

document.getElementById("run").onclick = runFromTextbox;
document.getElementById("req").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runFromTextbox();
});

// ============================
// Voice recognition (gated by consent)
// ============================
async function startVoiceOnce() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setOutput("SpeechRecognition not supported in this browser.");
    return;
  }

  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript || "";
    if ($("req")) $("req").value = text;
    runFromTextbox();
  };

  rec.onerror = (ev) => {
    setOutput(`Voice error: ${ev.error || "unknown"}`);
  };

  rec.start();
}

// ============================
// Wire up UI
// ============================
function wireHandlers() {
  // Focus
  $("focus")?.addEventListener("click", async () => {
    try {
      const tab = await getTab();
      if (!tab?.id) throw new Error("No active tab.");
      ensureHttpTab(tab);
      await ensureContentInjected(tab.id);

      focusOn = !focusOn;
      await chrome.tabs.sendMessage(tab.id, { type: focusOn ? "FOCUS_ON" : "FOCUS_OFF" });
      setOutput(focusOn ? "Focus mode: ON" : "Focus mode: OFF");
    } catch (e) {
      setOutput("Focus error: " + (e?.message || e));
    }
  });

  // Extract
  $("extract")?.addEventListener("click", async () => {
    try {
      const tab = await getTab();
      if (!tab?.id) throw new Error("No active tab.");
      ensureHttpTab(tab);
      await ensureContentInjected(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
      setOutput((response?.text || "").slice(0, 3000));
    } catch (e) {
      setOutput("Extract error: " + (e?.message || e));
    }
  });

  // Summarise
  $("summarise")?.addEventListener("click", async () => {
    try {
      await runSummarise();
    } catch (e) {
      setOutput("Summarise error: " + (e?.message || e));
    }
  });

  // Read aloud (reads whatever is currently shown in the output)
  $("speak")?.addEventListener("click", () => {
    const text = ($("output")?.textContent || "").trim();
    speak(text);
  });

  // Scroll
  $("scrollDown")?.addEventListener("click", async () => {
    try {
      const tab = await getTab();
      if (!tab?.id) throw new Error("No active tab.");
      ensureHttpTab(tab);
      await ensureContentInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_DOWN" });
    } catch (e) {
      setOutput("Scroll error: " + (e?.message || e));
    }
  });

  $("scrollUp")?.addEventListener("click", async () => {
    try {
      const tab = await getTab();
      if (!tab?.id) throw new Error("No active tab.");
      ensureHttpTab(tab);
      await ensureContentInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_UP" });
    } catch (e) {
      setOutput("Scroll error: " + (e?.message || e));
    }
  });

  // Run request
  $("run")?.addEventListener("click", runFromTextbox);
  $("req")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runFromTextbox();
  });

  // Voice button (gated)
  $("voice")?.addEventListener("click", async () => {
    // If disabled → show modal and do nothing
    if (voicePref === "disabled") {
      setOutput("Voice assistance is disabled. Choose Enable voice to use it.");
      showVoiceModal(true);
      return;
    }

    // If never chosen → show modal
    if (!voicePref) {
      showVoiceModal(true);
      return;
    }

    // Enabled → start voice on the PAGE (content script), not inside popup
  setOutput("Listening… (speak now)");

  const tab = await getTab();
  if (!tab?.id) throw new Error("No active tab.");
  ensureHttpTab(tab);

  await ensureContentInjected(tab.id);

  const r = await chrome.tabs.sendMessage(tab.id, { type: "VOICE_ON_PAGE" });

  if (!r?.ok) {
    setOutput("Voice error: " + (r?.error || "unknown"));
    return;
  }

  $("req").value = r.text || "";
  runFromTextbox();
  });

  // Modal buttons
  $("enableVoiceBtn")?.addEventListener("click", async () => {
    speak("Voice assistance enabled.");
    const remember = !!$("rememberVoiceChoice")?.checked;

    voicePref = "enabled";
    if (remember) await setVoicePref("enabled");

    showVoiceModal(false);

    // Start voice immediately after user click (permission safe)
    $("voice")?.click();
  });

  $("notNowVoiceBtn")?.addEventListener("click", async () => {
    speak("Voice assistance disabled.");
    const remember = !!$("rememberVoiceChoice")?.checked;

    voicePref = "disabled";
    if (remember) await setVoicePref("disabled");

    showVoiceModal(false);
    setOutput("Voice assistance: OFF");
  });
}

// ============================
// Init: ask once on popup open
// ============================
(async function init() {
  wireHandlers();

  voicePref = await getVoicePref(); // null if never set
  showVoiceModal(!voicePref);       // ask once if no pref

  // Optional: if previously enabled, you can show a hint
  // if (voicePref === "enabled") setOutput("Voice assistance: enabled (press Voice to use).");
})();
