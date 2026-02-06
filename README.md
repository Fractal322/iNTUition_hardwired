# iNTUition_hardwired
Team "Hardwired" Github repository for IEEE NTU Hackathon 2026.
# iNTUition_hardwired
Team "Hardwired" Github repository for IEEE NTU Hackathon 2026.

# Access Assist (Chrome Extension + Python Service)

This project contains two parts:
1) **Chrome Extension** (frontend)
2) **Python Service (Flask)** (backend API)

The extension connects to the local backend at **http://127.0.0.1:3000**.

## STEP 1: Download / Prepare Files

Download or clone the project and make sure you have **two folders**:

- `chrome_extension/`  (contains `manifest.json`, `popup.html`, `popup.js`, `background.js`, `content.js`)
- `python_service/`    (contains `server.py`, `.venv` (optional), `run_server.bat`)


## STEP 2: Run Python Service (Flask)
1) Set OpenAI API Key (first time only)
  Open PowerShell and run:

  setx OPENAI_API_KEY "sk-yourkey"

2) Create virtual environment & install dependencies (first time only)

  cd D:\IEEE_Hackeson\python_service
  
  python -m venv .venv
  
  .\.venv\Scripts\python.exe -m pip install --upgrade pip
  
  .\.venv\Scripts\python.exe -m pip install flask flask-cors requests

3) Start the server

  .\.venv\Scripts\python.exe server.py

  
After the API and Virtual envitonment settting, We offer One-click start:Double-click `run_server.bat` in python_service folder.

## STEP 3: Load and Use the Chrome Extension

1) Open Google Chrome and go to: chrome://extensions.
2) Turn on Developer mode (top-right corner).
3) lick Load unpacked, then select: the chrome_extension/ folder (the folder that contains manifest.json).
4) Open any normal webpage, click the extension icon, and start using the features.

## Notes / Troubleshooting
1) Make sure the Python server is running before using the extension.
2) If the extension shows server errors, check the Python terminal output for details.
3) If the server cannot access the key, re-open PowerShell after setx and restart the server.



