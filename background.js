chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "SUMMARISE") {

    let text = msg.text;

    let sentences = text.split(/[.!?]/).slice(0, 3).join(". ");

    let summary =
      "TL;DR:\n" +
      sentences +
      "\n\nKey Points:\n• " +
      text.split("\n").slice(0,5).join("\n• ");

    sendResponse(summary);
  }

  return true;
});
