const SERVER_BASE = "http://localhost:3000";

async function postJson(path, payload) {
  const r = await fetch(`${SERVER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Server error ${r.status}: ${t}`);
  }
  return await r.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "SUMMARISE") {
        const text = msg.text || "";
        const data = await postJson("/summarise", { text });
        // data: { tldr, bullets, key_actions, raw }
        sendResponse({ ok: true, data });
        return;
      }

      if (msg.type === "INTERPRET") {
        const request = msg.request || "";
        const data = await postJson("/interpret", { request });
        // data: { command }
        sendResponse({ ok: true, data });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true; // keep the message channel open for async reply
});
