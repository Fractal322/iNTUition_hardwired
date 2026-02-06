import os
import re
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # local dev OK

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()


# -------------------------
# Helpers
# -------------------------
def clamp_text(text: str, max_chars: int = 12000) -> str:
    text = (text or "").strip()
    if len(text) > max_chars:
        text = text[:max_chars]
    return text


def extract_output_text_from_responses_api(j: dict) -> str:
    """
    Extract plain text from OpenAI Responses API JSON.
    """
    out_text = ""
    for item in j.get("output", []):
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    out_text += c.get("text", "")
    return (out_text or "").strip()


def parse_summary(text: str):
    """
    Parse the model's formatted output.
    Expect format:
      TL;DR: ...
      • ...
      Key actions: a, b, c
    """
    tldr = ""
    bullets = []
    key_actions = []

    m = re.search(r"TL;DR:\s*(.*)", text)
    if m:
        tldr = m.group(1).strip()

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("•"):
            bullets.append(line.lstrip("•").strip())

    m = re.search(r"Key actions:\s*(.*)", text, re.IGNORECASE)
    if m:
        key_actions = [x.strip() for x in m.group(1).split(",") if x.strip()]

    return tldr, bullets[:5], key_actions


def call_openai_responses(model: str, messages, temperature: float = 0.2, timeout: int = 45):
    """
    Call OpenAI Responses API via requests.
    messages: list of {role, content}
    """
    if not OPENAI_API_KEY:
        return None, ("OPENAI_API_KEY not set on server", 500)

    r = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": messages,
            "temperature": temperature,
        },
        timeout=timeout,
    )

    if r.status_code != 200:
        return None, ({"error": "OpenAI error", "status_code": r.status_code, "detail": r.text}, 500)

    try:
        j = r.json()
    except Exception:
        return None, ({"error": "OpenAI returned non-JSON", "raw_text": r.text}, 500)

    return j, None


# -------------------------
# Routes
# -------------------------
@app.get("/health")
def health():
    return jsonify({"ok": True, "openai_key_loaded": bool(OPENAI_API_KEY)})


@app.post("/summarise")
def summarise():
    """
    Input: { "text": "<page text>" }
    Output: { tldr, bullets, key_actions, raw }
    """
    try:
        data = request.get_json(force=True) or {}
        text = clamp_text(data.get("text", ""))

        if not text:
            return jsonify({"error": "Missing text"}), 400

        system_prompt = (
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
        )

        j, err = call_openai_responses(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            timeout=45,
        )
        if err:
            body, code = err
            return jsonify(body), code

        out_text = extract_output_text_from_responses_api(j)
        if not out_text:
            return jsonify({
                "error": "No output_text found in OpenAI response",
                "openai_response_preview": str(j)[:1500]
            }), 500

        tldr, bullets, key_actions = parse_summary(out_text)

        return jsonify({
            "tldr": tldr,
            "bullets": bullets,
            "key_actions": key_actions,
            "raw": out_text
        })

    except Exception as e:
        import traceback
        return jsonify({
            "error": "Internal exception in /summarise",
            "message": str(e),
            "traceback": traceback.format_exc()[:4000]
        }), 500


@app.post("/interpret")
def interpret():
    """
    Input: { "request": "<user request>" }
    Output: { "command": "<one command>" }
    """
    try:
        data = request.get_json(force=True) or {}
        user_req = (data.get("request") or "").strip()
        if not user_req:
            return jsonify({"error": "Missing request"}), 400

        system_prompt = (
            "You normalise shaky/typo user commands for an accessibility browser extension. "
            "Return ONLY one command from this list:\n"
            "- summarise\n- read summary\n- extract text\n- focus mode on\n- focus mode off\n"
            "- scroll down\n- scroll up\n- click <target>\n\n"
            "If user intent is unclear, return: summarise"
        )

        j, err = call_openai_responses(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_req},
            ],
            temperature=0.1,
            timeout=45,
        )
        if err:
            body, code = err
            return jsonify(body), code

        out_text = extract_output_text_from_responses_api(j)
        cmd = (out_text.splitlines() or ["summarise"])[0].strip() if out_text else "summarise"
        return jsonify({"command": cmd})

    except Exception as e:
        import traceback
        return jsonify({
            "error": "Internal exception in /interpret",
            "message": str(e),
            "traceback": traceback.format_exc()[:4000]
        }), 500


@app.post("/ask")
def ask():
    """
    ✅ Type request -> GPT -> Answer
    Input: { "input": "<user text>", "page_text": "<optional page text>" }
    Output: { "answer": "<assistant response>" }
    """
    try:
        data = request.get_json(force=True) or {}
        user_input = (data.get("input") or "").strip()
        page_text = clamp_text(data.get("page_text", ""), max_chars=12000)

        if not user_input:
            return jsonify({"error": "Missing input"}), 400

        system_prompt = (
            "You are an assistant inside a browser accessibility extension.\n"
            "Answer the user's request clearly.\n"
            "If the request refers to the current webpage, use the provided PAGE_TEXT when relevant.\n"
            "If PAGE_TEXT is empty but needed, tell the user to click 'Extract Text' or 'Summarise'.\n"
            "Keep answers concise unless the user asks for detail.\n"
        )

        user_content = user_input
        if page_text:
            user_content += "\n\nPAGE_TEXT:\n" + page_text

        j, err = call_openai_responses(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.4,
            timeout=45,
        )
        if err:
            body, code = err
            return jsonify(body), code

        out_text = extract_output_text_from_responses_api(j)
        if not out_text:
            return jsonify({
                "error": "No output_text found in OpenAI response",
                "openai_response_preview": str(j)[:1500]
            }), 500

        return jsonify({"answer": out_text.strip()})

    except Exception as e:
        import traceback
        return jsonify({
            "error": "Internal exception in /ask",
            "message": str(e),
            "traceback": traceback.format_exc()[:4000]
        }), 500


# -------------------------
# Run (WSGI) -方案A
# -------------------------
if __name__ == "__main__":
    # ✅ IMPORTANT: run Flask directly (do NOT use uvicorn for Flask)
    app.run(host="127.0.0.1", port=3000, debug=True)
