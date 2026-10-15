"""
llm_parser.py — แปลงข้อความ (จากเสียงที่ถอดแล้ว) เป็นรายการเงินสด
================================================================
ใช้ได้กับ KKU IntelSphere (ถ้าเป็นแบบ OpenAI-compatible) หรือ gateway ไหนก็ได้ที่ใช้ key เดียวเรียกหลายโมเดล

ตั้งค่าด้วย environment variable (ไม่ต้องแก้โค้ด):
    LLM_BASE_URL   เช่น https://xxxx/v1        (ดูจากหน้า IntelSphere)
    LLM_API_KEY    key ของคุณ
    LLM_MODEL      ชื่อโมเดลตามที่ gateway ระบุ

PowerShell:
    $env:LLM_BASE_URL="https://xxxx/v1"; $env:LLM_API_KEY="..."; $env:LLM_MODEL="..."

หลักการ: LLM แค่แปลงข้อความเป็น JSON  ตัวเลข/กติกาตัดสินด้วยโค้ด (validate) และมี fallback
ถ้า API ล่มหรือตอบผิดรูปแบบ เพื่อให้เดโมไม่พัง

ต้องมี: pip install requests
"""
import json
import os
import re
import requests

try:  # อ่านค่า LLM_* จากไฟล์ .env ในโฟลเดอร์นี้ (ถ้ามี) — ไม่ต้องตั้ง $env ทุกครั้ง
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

CATEGORIES = ["อาหาร", "เดินทาง", "ที่พัก", "ของใช้", "บิล/สาธารณูปโภค", "สุขภาพ", "บันเทิง", "อื่นๆ"]

SYSTEM_PROMPT = f"""คุณคือตัวแปลงข้อความภาษาไทยเป็นรายการรายจ่าย/รายรับเงินสด
ตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น รูปแบบ:
{{"items":[{{"type":"expense|income","amount":ตัวเลข,"merchant":"ชื่อร้านหรือเรื่อง","category":"หนึ่งใน {CATEGORIES}"}}]}}
กฎ: amount เป็นบาท ตัวเลขล้วน ถ้าไม่แน่ใจในจำนวนเงินให้ใส่ null ห้ามเดา"""


def _call_llm(text: str, system: str | None = None) -> str:
    base = os.getenv("LLM_BASE_URL")
    key = os.getenv("LLM_API_KEY")
    model = os.getenv("LLM_MODEL")
    if not (base and key and model):
        raise RuntimeError("LLM env not set")
    r = requests.post(
        f"{base.rstrip('/')}/chat/completions",  # รูปแบบ OpenAI-compatible; ถ้า IntelSphere ต่างจากนี้ แก้ตรงนี้ที่เดียว
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system or SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _extract_json(raw: str) -> dict:
    m = re.search(r"\{.*\}", raw, re.S)  # กันโมเดลใส่ ```json ครอบมา
    if not m:
        raise ValueError("no json")
    return json.loads(m.group(0))


# เกณฑ์ตีธง "ต้องตรวจ" (ปรับได้ใน .env)
REVIEW_ABOVE = float(os.getenv("REVIEW_ABOVE", "10000"))  # ยอดสูงผิดปกติ
REVIEW_BELOW = float(os.getenv("REVIEW_BELOW", "5"))      # ยอดต่ำผิดปกติ (อาจฟังผิด)


def validate(data: dict) -> list[dict]:
    """โค้ดตรวจ: คัดเฉพาะรายการที่ถูกต้อง; amount ว่าง/ติดลบ/สูงหรือต่ำผิดปกติจะถูกตีธงให้ผู้ใช้แก้ในหน้าตรวจ"""
    out = []
    for it in data.get("items", []):
        amt = it.get("amount")
        ok = isinstance(amt, (int, float)) and 0 < amt <= 1_000_000
        reason = None
        if not ok:
            reason = "ไม่พบจำนวนเงินที่ถูกต้อง"
        elif amt > REVIEW_ABOVE:
            reason = f"ยอดสูงกว่า {REVIEW_ABOVE:,.0f} บาท"
        elif amt < REVIEW_BELOW:
            reason = f"ยอดต่ำกว่า {REVIEW_BELOW:,.0f} บาท อาจฟังผิด"
        out.append({
            "type": it.get("type") if it.get("type") in ("expense", "income") else "expense",
            "amount": float(amt) if ok else None,
            "merchant": str(it.get("merchant") or "").strip(),
            "category": it.get("category") if it.get("category") in CATEGORIES else "อื่นๆ",
            "needs_review": reason is not None,
            "review_reason": reason,
        })
    return out


def _fallback(text: str) -> list[dict]:
    """regex แบบง่าย: เจอ 'ข้อความ ตัวเลข บาท' ก็ได้รายการ ใช้ตอน API ล่ม"""
    items = []
    income_words = ("ได้รับ", "รับเงิน", "ค่าจ้าง", "รายได้")
    for part in re.split(r"(?<!\d),|,(?!\d)|\n| และ ", text):
        m = re.search(r"(\d[\d,]*(?:\.\d+)?)", part)
        if not m:
            continue
        amt = float(m.group(1).replace(",", ""))
        label = re.sub(r"\d[\d,.]*|บาท|จ่าย|ซื้อ", "", part).strip() or "ไม่ระบุ"
        items.append({
            "type": "income" if any(w in part for w in income_words) else "expense",
            "amount": amt, "merchant": label, "category": "อื่นๆ", "needs_review": True,
            "review_reason": "แปลงด้วยโหมดสำรอง (ไม่ได้ใช้ AI)",
        })
    return items


def parse_utterance(text: str) -> dict:
    """คืน {"items": [...], "source": "llm"|"fallback"}  — ใช้ตัวนี้ตัวเดียวจากฝั่งแอป"""
    try:
        return {"items": validate(_extract_json(_call_llm(text))), "source": "llm"}
    except Exception as e:
        return {"items": _fallback(text), "source": "fallback", "error": str(e)}


CHAT_SYSTEM = """คุณคือผู้ช่วยการเงินของแอปบ้านรอด AI ตอบภาษาไทย สั้น กระชับ ไม่เกิน 4 ประโยค
ใช้เฉพาะข้อมูลที่ให้ไว้ด้านล่างเท่านั้น ห้ามเดาตัวเลขใหม่ ถ้าข้อมูลไม่พอให้บอกตรงๆ
หลักคิดเรื่องหนี้: จ่ายขั้นต่ำทุกใบให้ครบก่อน แล้วโปะใบที่ดอกเบี้ยสูงสุด
ข้อมูลผู้ใช้ (JSON):
"""


def chat_answer(question: str, context: dict) -> dict:
    """ตอบคำถามด้วย LLM โดยป้อนข้อมูลบัญชี/หนี้เป็น context; API ล่มจะคืนข้อความสำรอง"""
    try:
        system = CHAT_SYSTEM + json.dumps(context, ensure_ascii=False)
        return {"reply": _call_llm(question, system).strip(), "source": "llm"}
    except Exception as e:
        cards = sorted(context.get("credit_cards", []), key=lambda c: -c["interest_rate_apr"])
        tip = (f"จ่ายขั้นต่ำทุกใบก่อน แล้วโปะ{cards[0]['name']} (ดอกเบี้ยสูงสุด {cards[0]['interest_rate_apr']*100:.0f}%/ปี)"
               if cards else "ยังไม่มีข้อมูลบัตร")
        return {"reply": f"(สำรอง) {tip}", "source": "fallback", "error": str(e)}


if __name__ == "__main__":
    for s in ["กินข้าวร้านป้าแมว 60 บาท, ค่าวินมอเตอร์ไซค์ 30", "ได้รับค่าจ้างตัดต่อ 3,500 บาท"]:
        print(s, "\n ->", parse_utterance(s))
