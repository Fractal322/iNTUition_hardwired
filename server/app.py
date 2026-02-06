import os
import re
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # ok for local hackathon; tighten later if deploying

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

def clamp_text(text: str, max_chars: int = 12000) -> str:
    text = (text or "").strip()
    if len(text) > max_chars:
        text = text[:max_chars]
    return text

def parse_summary(text: str):
    """
    Very simple parser for the model’s formatted output.
    Expect format:
      TL;DR: ...
      • ...
      • ...
      Key actions: a, b, c
    """
    tldr = ""
    bullets = []
    key_actions = []

    # TL;DR
    m = re.search(r"TL;DR:\s*(.*)", text)
    if m:
        tldr = m.group(1).strip()

    # Bullets
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("•"):
            bullets.append(line.lstrip("•").strip())

    # Key actions
    m = re.search(r"Key actions:\s*(.*)", text, re.IGNORECASE)
    if m:
        key_actions = [x.strip() for x in m.group(1).split(",") if x.strip()]

    return tldr, bullets[:5], key_actions

@app.post("/summarise")
def summarise():
    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not set on server"}), 500

    data = request.get_json(force=True) or {}
    text = clamp_text(data.get("text", ""))

    if not text:
        return jsonify({"error": "Missing text"}), 400

    # Call OpenAI (Responses API)
    r = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1-mini",
            "input": [
                {
                    "role": "system",
                    "content": (
                        "You summarise webpages for accessibility.\n"
                        "Summarise ONLY the main content.\n"
                        "Ignore navigation, cookie banners, ads, footer, and repeated UI text.\n"
                        "Output exactly in this format:\n"
                        "TL;DR: <1-2 lines>\n"
                        "• <bullet 1>\n"
                        "• <bullet 2>\n"
                        "• <bullet 3>\n"
                        "• <bullet 4>\n"
                        "• <bullet 5>\n"
                        "Key actions: <comma-separated actions like login, search, checkout>\n"
                    ),
                },
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        },
        timeout=45,
    )

    if r.status_code != 200:
        return jsonify({"error": "OpenAI error", "detail": r.text}), 500

    j = r.json()

    # Extract the assistant text from Responses API payload
    # (This is a common way; if your response shape differs, we can adjust quickly.)
    out_text = ""
    for item in j.get("output", []):
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    out_text += c.get("text", "")

    out_text = out_text.strip() or str(j)

    tldr, bullets, key_actions = parse_summary(out_text)

    return jsonify({
        "tldr": tldr,
        "bullets": bullets,
        "key_actions": key_actions,
        "raw": out_text  # keep for debugging; you can remove later
    }) 

@app.post("/interpret")
def interpret():
    if not OPENAI_API_KEY:
        return jsonify({"error": "OPENAI_API_KEY not set on server"}), 500

    data = request.get_json(force=True) or {}
    user_req = (data.get("request") or "").strip()
    if not user_req:
        return jsonify({"error": "Missing request"}), 400

    r = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1-mini",
            "input": [
                {
                    "role": "system",
                    "content": (
                        "You normalise shaky/typo user commands for an accessibility browser extension. "
                        "Return ONLY one command from this list:\n"
                        "- summarise\n- read summary\n- extract text\n- focus mode on\n- focus mode off\n"
                        "- scroll down\n- scroll up\n- click <target>\n\n"
                        "If user intent is unclear, return: summarise"
                    ),
                },
                {"role": "user", "content": user_req},
            ],
            "temperature": 0.1,
        },
        timeout=45,
    )

    if r.status_code != 200:
        return jsonify({"error": "OpenAI error", "detail": r.text}), 500

    j = r.json()
    out_text = ""
    for item in j.get("output", []):
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    out_text += c.get("text", "")

    return jsonify({"command": out_text.strip()})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)

