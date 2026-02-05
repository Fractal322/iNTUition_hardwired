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
