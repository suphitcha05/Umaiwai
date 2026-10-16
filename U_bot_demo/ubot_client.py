"""
UBotClient — client เดียวใช้ได้ทั้ง mock และของจริง
===================================================
การ "สลับไปของจริง" ทำได้ด้วยการเปลี่ยนค่าเดียว:

    ใช้ mock (ดีฟอลต์):   base_url = http://localhost:8001
    ใช้ของจริง:           ตั้ง env  UBOT_BASE_URL=https://api-ของจริง...
                          แล้วใส่ username/password จริง

การ refresh token ทำแบบถูกวิธี: ขอใหม่เฉพาะตอน token หมดอายุหรือโดนปฏิเสธ (401)
ไม่ใช่ยิงล็อกอินวนรัวๆ (ซึ่งผิด ToS และโดน fraud detection จับ)

ต้องมี:
    pip install requests
"""
import os
import time
import requests


class UBotClient:
    def __init__(self, base_url: str | None = None, username: str = "demo", password: str = "demo1234"):
        # ---- SWAP POINT 1: base URL (mock vs จริง) ----
        self.base_url = base_url or os.getenv("UBOT_BASE_URL", "http://localhost:8001")
        self.username = username
        self.password = password
        self._token: str | None = None
        self._token_exp: float = 0.0

    # ---------- auth ----------
    def _login(self) -> str:
        """
        ---- SWAP POINT 2: ถ้า API จริงมี path หรือชื่อฟิลด์ต่างออกไป แก้แค่เมธอดนี้ ----
        """
        r = requests.post(
            f"{self.base_url}/auth/login",
            json={"username": self.username, "password": self.password},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        self._token = data["access_token"]
        # refresh ล่วงหน้า 10 วิ กันกรณีหมดอายุพอดีระหว่างเรียก
        self._token_exp = time.time() + data.get("expires_in", 300) - 10
        return self._token

    def _auth_header(self) -> dict:
        # ขอ token ใหม่เฉพาะตอนยังไม่มี หรือหมดอายุ — นี่คือ refresh ที่ถูกต้อง
        if not self._token or time.time() >= self._token_exp:
            self._login()
        return {"Authorization": f"Bearer {self._token}"}

    # ---------- http helpers (retry ครั้งเดียวถ้าโดน 401) ----------
    def _get(self, path: str) -> dict:
        r = requests.get(f"{self.base_url}{path}", headers=self._auth_header(), timeout=10)
        if r.status_code == 401:            # token ถูกปฏิเสธ -> login ใหม่แล้วลองอีกรอบ
            self._login()
            r = requests.get(f"{self.base_url}{path}", headers=self._auth_header(), timeout=10)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, body: dict) -> dict:
        r = requests.post(f"{self.base_url}{path}", headers=self._auth_header(), json=body, timeout=10)
        if r.status_code == 401:
            self._login()
            r = requests.post(f"{self.base_url}{path}", headers=self._auth_header(), json=body, timeout=10)
        r.raise_for_status()
        return r.json()

    # ---------- API ที่แอปเรียกใช้ ----------
    def get_accounts(self) -> list:
        return self._get("/accounts")["accounts"]

    def get_transactions(self, account_id: str) -> list:
        return self._get(f"/accounts/{account_id}/transactions")["transactions"]

    def get_credit_cards(self) -> list:
        return self._get("/credit-cards")["credit_cards"]

    def ask(self, message: str) -> str:
        r = self._post("/chat", {"message": message})
        return r["reply"]

    def parse_utterance(self, text: str) -> dict:
        """แปลงข้อความ (จากเสียงที่ถอดแล้ว) เป็นรายการ — คืน {"items": [...], "source": "llm"|"fallback"}"""
        return self._post("/chat/parse", {"message": text})
