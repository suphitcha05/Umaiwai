"""
Mock U bot API
==============
เลียนแบบ "หน้าตา" ของ API U bot เพื่อให้ทีมบ้านรอด AI สร้างและเดโมได้
โดยไม่ต้องใช้ API จริง  เมื่อได้สิทธิ์ของจริงแล้ว ค่อยชี้ UBotClient ไปที่
base URL ของจริง (ดู ubot_client.py) — โค้ดส่วนอื่นไม่ต้องแก้

วิธีรัน:
    pip install fastapi uvicorn
    uvicorn mock_server:app --port 8001 --reload

หมายเหตุ: นี่คือข้อมูลปลอมล้วนๆ สำหรับเดโม ไม่มีการต่อระบบจริงใดๆ
"""
import secrets
import time
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_parser import parse_utterance, chat_answer  # ใช้ KKU IntelSphere (หรือ fallback)

app = FastAPI(title="Mock U bot API", version="0.1.0")
# ให้หน้าเว็บของเพื่อน (คนละ origin/port) เรียก API นี้ได้ — เดโมเท่านั้น อย่าเปิดกว้างแบบนี้บน production
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
# --- บัญชีเดโม + ที่เก็บ token ในหน่วยความจำ ---
DEMO_USER = "demo"
DEMO_PASS = "demo1234"
TOKEN_TTL = 300  # วินาที — ตั้งสั้นๆ ตั้งใจให้ได้ทดสอบการ refresh
_tokens: dict[str, float] = {}  # token -> เวลา (epoch) ที่หมดอายุ


# =========================================================
# ข้อมูลตัวอย่าง (ไทย: รายได้ไม่สม่ำเสมอ + หนี้บัตรเครดิต)
# =========================================================
ACCOUNTS = [
    {
        "account_id": "acc_001",
        "name": "บัญชีออมทรัพย์หลัก",
        "type": "savings",
        "currency": "THB",
        "balance": 18450.75,
    }
]

TRANSACTIONS = {
    "acc_001": [
        {"id": "t1", "date": "2026-10-02", "desc": "รับงานฟรีแลนซ์ - ออกแบบโลโก้", "amount": 8500.00, "type": "income"},
        {"id": "t2", "date": "2026-10-03", "desc": "ค่าเช่าห้อง", "amount": -5500.00, "type": "expense"},
        {"id": "t3", "date": "2026-10-05", "desc": "ร้านสะดวกซื้อ", "amount": -238.00, "type": "expense"},
        {"id": "t4", "date": "2026-10-09", "desc": "ชำระขั้นต่ำบัตร A", "amount": -1200.00, "type": "expense"},
        {"id": "t5", "date": "2026-10-14", "desc": "รับงานฟรีแลนซ์ - ตัดต่อวิดีโอ", "amount": 6200.00, "type": "income"},
        {"id": "t6", "date": "2026-10-15", "desc": "ค่าอินเทอร์เน็ต", "amount": -599.00, "type": "expense"},
    ]
}

CREDIT_CARDS = [
    {
        "card_id": "cc_A",
        "name": "บัตร A",
        "outstanding_balance": 42300.00,   # ยอดคงค้าง
        "min_payment": 2115.00,            # ขั้นต่ำ (~5%)
        "due_date": "2026-10-25",
        "interest_rate_apr": 0.16,         # ดอกเบี้ยต่อปี 16%
        "credit_limit": 50000.00,
    },
    {
        "card_id": "cc_B",
        "name": "บัตร B",
        "outstanding_balance": 11800.00,
        "min_payment": 590.00,
        "due_date": "2026-10-28",
        "interest_rate_apr": 0.18,
        "credit_limit": 30000.00,
    },
]


# =========================================================
# Auth
# =========================================================
class LoginBody(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def login(body: LoginBody):
    """เลียนแบบล็อกอินแล้วออก access token (ของจริงมักตอบรูปแบบคล้ายๆ กันนี้)"""
    if body.username != DEMO_USER or body.password != DEMO_PASS:
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = secrets.token_hex(16)
    _tokens[token] = time.time() + TOKEN_TTL
    return {"access_token": token, "token_type": "Bearer", "expires_in": TOKEN_TTL}


def require_token(authorization: str | None = Header(default=None)) -> str:
    """ตรวจ Bearer token — ไม่มี/หมดอายุ => 401 (client จะ login ใหม่เอง)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    exp = _tokens.get(token)
    if exp is None:
        raise HTTPException(status_code=401, detail="unknown token")
    if time.time() >= exp:
        _tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="token expired")
    return token


# =========================================================
# Data endpoints
# =========================================================
@app.get("/accounts")
def get_accounts(authorization: str | None = Header(default=None)):
    require_token(authorization)
    return {"accounts": ACCOUNTS}


@app.get("/accounts/{account_id}/transactions")
def get_transactions(account_id: str, authorization: str | None = Header(default=None)):
    require_token(authorization)
    if account_id not in TRANSACTIONS:
        raise HTTPException(status_code=404, detail="account not found")
    return {"account_id": account_id, "transactions": TRANSACTIONS[account_id]}


@app.get("/credit-cards")
def get_credit_cards(authorization: str | None = Header(default=None)):
    require_token(authorization)
    return {"credit_cards": CREDIT_CARDS}


# =========================================================
# Chat (ถ้า U bot เป็นแชทบอท) — เดโมตอบแบบง่ายๆ
# ตรงนี้คือจุดที่ "สร้างความสามารถเอง" ได้: ต่อ Claude API แทนได้เลย
# =========================================================
class ChatBody(BaseModel):
    message: str


@app.post("/chat")
def chat(body: ChatBody, authorization: str | None = Header(default=None)):
    require_token(authorization)
    context = {"accounts": ACCOUNTS, "transactions": TRANSACTIONS["acc_001"], "credit_cards": CREDIT_CARDS}
    return chat_answer(body.message, context)


# =========================================================
# แปลงข้อความเสียง -> รายการ (ข้อ 8) ใช้ llm_parser (IntelSphere/fallback)
# =========================================================
@app.post("/chat/parse")
def chat_parse(body: ChatBody, authorization: str | None = Header(default=None)):
    require_token(authorization)
    return parse_utterance(body.message)
