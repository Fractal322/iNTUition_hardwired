let lastSummaryText = "";
let focusOn = false;

async function getTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function formatServerSummary(data) {
  const tldr = data?.tldr || "";
  const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
  const actions = Array.isArray(data?.key_actions) ? data.key_actions : [];

  let out = "";
  out += `TL;DR: ${tldr}\n\n`;
  if (bullets.length) {
    out += "Key Points:\n";
    for (const b of bullets) out += `• ${b}\n`;
    out += "\n";
  }
  if (actions.length) {
    out += `Key actions: ${actions.join(", ")}\n`;
  }
  return out.trim();
}

// ===== Buttons you already had =====

// TOGGLE FOCUS MODE
document.getElementById("focus").onclick = async () => {
  const tab = await getTab();
  await ensureContentInjected(tab.id);

  focusOn = !focusOn;
  chrome.tabs.sendMessage(tab.id, { type: focusOn ? "FOCUS_ON" : "FOCUS_OFF" });
};

// EXTRACT TEXT
document.getElementById("extract").onclick = async () => {
  const tab = await getTab();
  await ensureContentInjected(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
  document.getElementById("output").textContent = (response.text || "").slice(0, 3000);
};

// SUMMARISE (server)
document.getElementById("summarise").onclick = async () => {
  await runSummarise();
};

// READ ALOUD
document.getElementById("speak").onclick = () => {
  if (!lastSummaryText) return;
  const u = new SpeechSynthesisUtterance(lastSummaryText);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
};

// SCROLL
document.getElementById("scrollDown").onclick = async () => {
  const tab = await getTab();
  await ensureContentInjected(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_DOWN" });
};

document.getElementById("scrollUp").onclick = async () => {
  const tab = await getTab();
  await ensureContentInjected(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_UP" });
};

// ===== New: run request via /interpret =====

async function interpretRequest(userText) {
  const res = await chrome.runtime.sendMessage({ type: "INTERPRET", request: userText });
  if (!res?.ok) throw new Error(res?.error || "Interpret failed");
  return (res.data?.command || "").trim();
}

async function runSummarise() {
  const tab = await getTab();
  await ensureContentInjected(tab.id);

  const extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
  const text = extracted?.text || "";

  const res = await chrome.runtime.sendMessage({ type: "SUMMARISE", text });
  if (!res?.ok) {
    document.getElementById("output").textContent =
      `Summarise failed.\n\n${res?.error || ""}\n\nIs your server running on http://localhost:3000 ?`;
    return;
  }

  const formatted = formatServerSummary(res.data);
  lastSummaryText = formatted;
  document.getElementById("output").textContent = formatted;
}

async function runCommand(command) {
  const tab = await getTab();
  await ensureContentInjected(tab.id);

  const c = (command || "").toLowerCase();

  if (c === "summarise") {
    await runSummarise();
    return;
  }

  if (c === "read summary") {
    document.getElementById("speak").click();
    return;
  }

  if (c === "extract text") {
    document.getElementById("extract").click();
    return;
  }

  if (c === "focus mode on") {
    focusOn = true;
    await chrome.tabs.sendMessage(tab.id, { type: "FOCUS_ON" });
    return;
  }

  if (c === "focus mode off") {
    focusOn = false;
    await chrome.tabs.sendMessage(tab.id, { type: "FOCUS_OFF" });
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

  // click <target>
  if (c.startsWith("click ")) {
    const target = command.slice("click ".length).trim();
    const r = await chrome.tabs.sendMessage(tab.id, { type: "CLICK", target });
    document.getElementById("output").textContent =
      r?.ok ? `Clicked: ${r.clickedText || target}` : `Click failed: ${r?.error || "unknown error"}`;
    return;
  }

  // fallback
  document.getElementById("output").textContent =
    `Unknown command returned by server:\n${command}\n\nTry: summarise / extract text / scroll down / click <target>`;
}

async function runFromTextbox() {
  const req = document.getElementById("req").value.trim();
  if (!req) return;

  document.getElementById("output").textContent = "Interpreting request...";
  try {
    const cmd = await interpretRequest(req);
    document.getElementById("output").textContent = `Command: ${cmd}\nRunning...`;
    await runCommand(cmd);
  } catch (e) {
    document.getElementById("output").textContent =
      `Interpret failed.\n\n${String(e?.message || e)}\n\nIs your server running on http://localhost:3000 ?`;
  }
}

document.getElementById("run").onclick = runFromTextbox;
document.getElementById("req").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runFromTextbox();
});

// Optional: Voice input fills the textbox (Web Speech API)
document.getElementById("voice").onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById("output").textContent = "SpeechRecognition not supported in this browser.";
    return;
  }
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript || "";
    document.getElementById("req").value = text;
    runFromTextbox();
  };

  rec.onerror = (ev) => {
    document.getElementById("output").textContent = `Voice error: ${ev.error || "unknown"}`;
  };

  rec.start();
};
