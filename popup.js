let lastSummary = "";

async function getTab() {
  let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}

// EXTRACT TEXT
document.getElementById("extract").onclick = async () => {
  let tab = await getTab();

  await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    files: ["content.js"]
  });

  let response = await chrome.tabs.sendMessage(tab.id, {type: "EXTRACT"});

  document.getElementById("output").textContent =
    response.text.slice(0, 2000);
};

// SUMMARISE
document.getElementById("summarise").onclick = async () => {
  let tab = await getTab();

  let response = await chrome.tabs.sendMessage(tab.id, {type: "EXTRACT"});

  let summary = await chrome.runtime.sendMessage({
    type: "SUMMARISE",
    text: response.text
  });

  lastSummary = summary;
  document.getElementById("output").textContent = summary;
};

// TEXT TO SPEECH
document.getElementById("speak").onclick = () => {
  let u = new SpeechSynthesisUtterance(lastSummary);
  speechSynthesis.speak(u);
};
