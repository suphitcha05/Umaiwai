"""
voice_server.py — เปิดเว็บแอปมีแผน + รับเสียงจากปุ่ม "กดแล้วพูด" ในแอป
=======================================================================
ทำไมต้องมีเซิร์ฟเวอร์: กุญแจ ElevenLabs ห้ามอยู่ในโค้ดฝั่งเบราว์เซอร์ เบราว์เซอร์จึงส่งเสียงมาที่นี่
แล้วเซิร์ฟเวอร์เป็นคนเรียก ElevenLabs

โฟลว์ (ใช้โค้ดเดิมของทีม):
  เบราว์เซอร์อัดเสียง → POST /api/voice → ElevenLabs scribe_v2 (แบบไฟล์ ไม่ใช่ realtime)
  → text_cleaner.clean_text → (ถ้าตั้ง LLM ไว้) U_bot_demo/llm_parser.parse_utterance
  → ส่ง {text, items} กลับ → แอปตรวจยอดกับข้อความ แล้วเปิดหน้าตรวจทีละรายการ
  ถ้าไม่มี LLM แอปแยกรายการเองด้วยโค้ด (engine.parseCashText)

วิธีรัน (จากโฟลเดอร์ Umaiwai):
    pip install elevenlabs python-dotenv requests
    cd demo_web && python3 build.py && cd ..
    python voice_server.py                 # เปิด http://localhost:8000
    python voice_server.py --no-llm        # ไม่เรียก LLM ให้แอปแยกเองด้วยโค้ด

อ่านสลิปบนเซิร์ฟเวอร์ด้วย slip_reader.py (EasyOCR) — แนะนำ:
    python -m pip install easyocr      (ครั้งแรกโหลดโมเดล ~100MB เซิร์ฟเวอร์จะโหลดรอไว้ตอนเปิด)
  แอปส่งรูปสลิปมาที่ POST /api/slip แล้วใช้ตัวแยกของ slip_reader (ออมสิน กรุงไทย กสิกร ทรูมันนี่)
  รูปอ่านบนเครื่องนี้ ไม่ส่งออกไปไหน · ปิดได้ด้วย --no-ocr · ถ้าไม่มี easyocr แอปใช้ OCR ในเบราว์เซอร์แทน
  ตั้ง OWNER_NAME ใน U_bot_demo/.env แอปจะใช้แยก "เราเป็นผู้รับ = รายรับ"

อ่านสลิปด้วย AI อ่านรูป (ไม่บังคับ ใช้เมื่อไม่มี easyocr): ถ้า gateway ของ LLM มีโมเดลที่อ่านรูปได้ ให้ใส่ใน U_bot_demo/.env
    SLIP_VISION_MODEL=<ชื่อโมเดลที่รับรูปได้>     (ใช้ LLM_BASE_URL และ LLM_API_KEY เดิม)
  แอปจะส่งรูปสลิปมาที่ POST /api/slip ให้ AI อ่าน ถ้าไม่ได้ตั้งหรือ AI ล่ม แอปกลับไปใช้ OCR บนเครื่อง
  หมายเหตุ: ทางนี้รูปสลิปถูกส่งออกไปยังผู้ให้บริการ LLM ต่างจาก OCR บนเครื่อง

รายการสด (จำลอง ธนาคารส่งธุรกรรมใหม่มาให้):
  เปิด <ลิงก์เดียวกับแอป>/push บนคอมหรือมือถืออีกเครื่อง แล้วกดปุ่ม "รูดบัตร" (SMS) หรือ "U-Wallet"
  แอปที่เปิดค้างไว้จะเด้งแจ้งเตือนและงบเปลี่ยนภายใน ~2 วินาที (แอปถามเซิร์ฟเวอร์ทุก 2 วินาทีที่ /api/feed)
  ของจริง: ระบบธนาคาร/U-Wallet ยิง webhook มาที่ POST /api/push แทนปุ่มเหล่านี้
  ใครมีลิงก์ก็กด /push ได้ ใช้เฉพาะเดโม

ค่าที่ใช้ (ไฟล์ .env เดิม):
    elevenlab/.env   -> ELEVENLABS_API_KEY  (ถ้าอยากเปลี่ยนโมเดล ตั้ง STT_MODEL ได้ ดีฟอลต์ scribe_v2)
    U_bot_demo/.env  -> LLM_BASE_URL, LLM_API_KEY, LLM_MODEL (ไม่บังคับ)

ใช้เสียงจากโทรศัพท์ (เบราว์เซอร์ให้เปิดไมค์ในหน้าเว็บเฉพาะ https หรือ localhost):
  ทาง A (แนะนำ) อุโมงค์ https ฟรีของ Cloudflare ไม่ต้องสมัคร ได้ลิงก์ https จริง ใช้ได้ทั้ง iPhone และ Android
      หน้าต่าง 1: python voice_server.py
      หน้าต่าง 2: cloudflared tunnel --url http://localhost:8000
      เปิดลิงก์ https://....trycloudflare.com ที่ขึ้นมาบนมือถือ แล้วกด "กดแล้วพูด"
      (ติดตั้ง Windows: winget install --id Cloudflare.cloudflared · Mac: brew install cloudflared)
  ทาง B https ในวง Wi-Fi เดียวกันด้วยใบรับรองที่สร้างเอง (ต้องมีคำสั่ง openssl)
      python voice_server.py --https --host 0.0.0.0   แล้วเปิด https://<IP เครื่อง>:8000 บนมือถือ
      เบราว์เซอร์จะเตือนว่าไม่ปลอดภัย ต้องกดยอมรับก่อน (iPhone อาจไม่ยอมให้ใช้ไมค์)
  ทาง C ไม่ต้องตั้งอะไร: เปิด http://<IP>:8000 ปุ่ม "อัดด้วยแอปอัดเสียงของมือถือ" จะเปิดแอปอัดเสียง
      ของเครื่อง แล้วส่งไฟล์มาแปลง (ช่องพิมพ์ประโยคยังใช้ได้ทุกทาง)
"""
import argparse
import io
import json
import os
import sys
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "demo_web" / "dist"
sys.path.insert(0, str(ROOT / "U_bot_demo"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / "elevenlab" / ".env")
    load_dotenv(ROOT / "U_bot_demo" / ".env")
except ImportError:
    pass

from text_cleaner import clean_text  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

MAX_AUDIO = 10 * 1024 * 1024  # 10 MB
EXT = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
       "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/3gpp": "3gp",
       "audio/amr": "amr", "video/mp4": "mp4", "video/webm": "webm"}


def load_keyterms() -> list[str]:
    p = ROOT / "keyterms.txt"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        t = line.split("#", 1)[0].strip()
        if t and len(t) <= 20 and t not in out:
            out.append(t)
    return out[:50]


class VoiceOff(Exception):
    pass


class Voice:
    def __init__(self, use_llm: bool):
        key = os.getenv("ELEVENLABS_API_KEY")
        self.client = None
        if key:
            from elevenlabs import ElevenLabs
            self.client = ElevenLabs(api_key=key)
        else:
            print("[i] ไม่มี ELEVENLABS_API_KEY → ปิดปุ่มพูด (ฟีเจอร์อื่นใช้ได้ปกติ, ช่องพิมพ์ยังใช้ได้)")
        self.model = os.getenv("STT_MODEL", "scribe_v2")
        self.keyterms = load_keyterms()
        self.llm = None
        if use_llm and os.getenv("LLM_MODEL"):
            try:
                import llm_parser
                self.llm = llm_parser
            except ImportError:
                print("[!] ไม่พบ U_bot_demo/llm_parser.py แอปจะแยกรายการเองด้วยโค้ด")
        self.logdir = ROOT / "voice_logs"
        self.logdir.mkdir(exist_ok=True)
        self.log = self.logdir / f"web_{datetime.now():%Y%m%d}.jsonl"

    def transcribe(self, audio: bytes, ctype: str, filename: str = "", lang: str = "auto") -> str:
        f = io.BytesIO(audio)
        ext = Path(filename).suffix.lstrip(".").lower() if filename else ""
        f.name = "voice." + (ext if ext.isalnum() and len(ext) <= 5 else EXT.get(ctype.split(";")[0].strip(), "webm"))
        kw = dict(file=f, model_id=self.model)
        code = {"th": "tha", "en": "eng"}.get(lang)  # auto = ให้ ElevenLabs เดาภาษาเอง (ไทย/อังกฤษ)
        if code:
            kw["language_code"] = code
        try:
            res = self.client.speech_to_text.convert(**kw, **({"keyterms": self.keyterms} if self.keyterms else {}))
        except TypeError:  # SDK รุ่นที่ยังไม่รับ keyterms
            f.seek(0)
            res = self.client.speech_to_text.convert(**kw)
        return (getattr(res, "text", "") or "").strip()

    def handle(self, audio: bytes, ctype: str, filename: str = "", lang: str = "auto") -> dict:
        if not self.client:
            raise VoiceOff()
        raw = self.transcribe(audio, ctype, filename, lang)
        text = clean_text(raw) if raw else ""
        items, source = None, "code"
        if text and self.llm:
            try:
                r = self.llm.parse_utterance(text)
                items, source = r.get("items") or [], r.get("source") or "llm"
            except Exception as e:  # LLM ล่ม แอปยังแยกเองได้
                print(f"[!] LLM error: {e}")
        out = {"text_raw": raw, "text": text, "items": items, "source": source}
        with open(self.log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"time": datetime.now().isoformat(timespec="seconds"), **out}, ensure_ascii=False) + "\n")
        return out


SLIP_PROMPT = (
    "อ่านสลิปโอนเงิน/ชำระเงินของธนาคารไทยในรูปนี้ ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น รูปแบบ "
    '{"amount": ยอดเงินที่โอน (ตัวเลข ไม่รวมค่าธรรมเนียม) หรือ null, "date": "YYYY-MM-DD" แปลง พ.ศ. เป็น ค.ศ. หรือ null, '
    '"sender": ชื่อผู้โอน, "receiver": ชื่อผู้รับหรือชื่อร้าน, "memo": บันทึกช่วยจำ หรือ "", '
    '"text": ข้อความทั้งหมดในสลิป บรรทัดละบรรทัดตามที่เห็น} '
    "ห้ามเดาตัวเลขที่มองไม่เห็น ถ้าไม่แน่ใจให้ใส่ null"
)


def read_slip_vision(data_url: str) -> dict:
    import re
    import requests
    base, key, model = os.getenv("LLM_BASE_URL", "").rstrip("/"), os.getenv("LLM_API_KEY", ""), os.getenv("SLIP_VISION_MODEL", "")
    r = requests.post(f"{base}/chat/completions", timeout=45, headers={"Authorization": f"Bearer {key}"}, json={
        "model": model, "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": SLIP_PROMPT},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]}],
    })
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(c.get("text", "") for c in content if isinstance(c, dict))
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise ValueError("AI ไม่ได้ตอบเป็น JSON")
    j = json.loads(m.group(0))
    amt = j.get("amount")
    try:
        amt = float(str(amt).replace(",", "")) if amt not in (None, "") else None
    except ValueError:
        amt = None
    return {"amount": amt, "date": j.get("date") or None, "sender": j.get("sender") or "", "receiver": j.get("receiver") or "",
            "memo": j.get("memo") or "", "text": j.get("text") if isinstance(j.get("text"), str) else "\n".join(j.get("text") or [])}


import threading  # noqa: E402

FEED: list[dict] = []
FEED_LOCK = threading.Lock()
FEED_SEQ = [0]


def push_event(ev: dict) -> dict:
    with FEED_LOCK:
        FEED_SEQ[0] += 1
        ev = {**ev, "id": FEED_SEQ[0], "time": datetime.now().isoformat(timespec="seconds")}
        FEED.append(ev)
        del FEED[:-200]
    return ev


def feed_after(after: int | None) -> dict:
    with FEED_LOCK:
        last = FEED_SEQ[0]
        events = [] if after is None else [e for e in FEED if e["id"] > after]
    return {"last": last, "events": events}


PUSH_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send a test payment · MePlan</title><style>
body{font-family:system-ui,'Leelawadee UI',sans-serif;max-width:460px;margin:0 auto;padding:16px;background:#EEF3E4;color:#161B14}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#5E6A57;font-size:14px}
.g{display:grid;gap:8px;margin-bottom:18px}button{font:600 16px inherit;border:0;border-radius:999px;padding:14px 18px;background:#161B14;color:#fff;text-align:left;cursor:pointer}
button.w{background:#2f6b8a}button.i{background:#B8E643;color:#161B14}h2{font-size:15px;margin:14px 0 8px}
input,select{font:16px inherit;width:100%;box-sizing:border-box;padding:10px;border:1px solid #DCE4CF;border-radius:12px;margin-bottom:8px}
#ok{min-height:1.4em;font-weight:600;color:#3C7A16}</style></head><body>
<h1>Send a test payment</h1><p>Tap a button. The MePlan app that is open will update in about 2 seconds. (Sample data)</p><p id="ok"></p>
<h2>Card payment (bank SMS)</h2><div class="g">
<button data-sms="300|SHOPEE">Card ฿300 at SHOPEE</button>
<button data-sms="459|GRAB*FOOD">Card ฿459 at GRAB*FOOD</button>
<button data-sms="1290|CENTRAL WORLD">Card ฿1,290 at CENTRAL WORLD</button></div>
<h2>U-Wallet</h2><div class="g">
<button class="w" data-w="payment|65|Amazon Café">Paid ฿65 at Amazon Café</button>
<button class="w" data-w="payment|60|ร้านป้าแดง ตามสั่ง">Paid ฿60 at a food stall</button>
<button class="i" data-w="transfer_in|1200|Food delivery platform">Got ฿1,200 from delivery work</button></div>
<h2>Your own</h2>
<select id="k"><option value="sms">Card payment (SMS)</option><option value="payment">U-Wallet payment</option><option value="transfer_in">U-Wallet money in</option></select>
<input id="a" type="number" inputmode="decimal" placeholder="Amount (baht)"><input id="m" placeholder="Shop or person">
<button id="go">Send</button>
<script>
const ok=t=>{document.getElementById('ok').textContent=t};
const PIN=new URLSearchParams(location.search).get('pin')||'';
const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+p(d.getFullYear()%100)+' '+p(d.getHours())+':'+p(d.getMinutes())};
async function send(body,label){try{const r=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json','X-App-Pin':PIN},body:JSON.stringify(body)});ok(r.ok?'Sent: '+label:r.status===401?'Locked: open this page with ?pin=YOUR_PIN':'Could not send')}catch(e){ok('Could not send')}}
const sms=(amt,shop)=>send({kind:'sms',text:'บัตร x1234 ใช้จ่าย '+Number(amt).toLocaleString('en-US',{minimumFractionDigits:2})+' บาท ที่ '+shop+' '+stamp()},'card ฿'+amt+' at '+shop);
const wal=(type,amt,name)=>send({kind:'wallet',record:{type,amount:Number(amt),[type==='payment'?'merchant':'counterparty']:name}},'U-Wallet ฿'+amt+' '+name);
document.querySelectorAll('[data-sms]').forEach(b=>b.onclick=()=>{const[a,s]=b.dataset.sms.split('|');sms(a,s)});
document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{const[t,a,n]=b.dataset.w.split('|');wal(t,a,n)});
document.getElementById('go').onclick=()=>{const k=document.getElementById('k').value,a=document.getElementById('a').value,m=document.getElementById('m').value||'Shop';if(!(a>0)){ok('Type an amount first');return}k==='sms'?sms(a,m):wal(k,a,m)};
</script></body></html>"""


class SlipOCR:
    """ห่อ slip_reader.py ของทีม: OCR ด้วย EasyOCR + แยกข้อมูลด้วยกฎ (ไม่เรียก LLM จัดหมวด แอปจัดเอง)"""

    def __init__(self):
        import importlib.util
        self.ok = importlib.util.find_spec("easyocr") is not None
        self.ready = False
        self.lock = threading.Lock()
        self.sr = None
        if not self.ok:
            print("[i] ไม่พบ easyocr → อ่านสลิปในเบราว์เซอร์แทน (ติดตั้ง: python -m pip install easyocr)")
            return
        try:
            import slip_reader
            self.sr = slip_reader
        except Exception as e:  # เช่น ไม่มี U_bot_demo/llm_parser.py
            print(f"[!] โหลด slip_reader.py ไม่ได้: {e}")
            self.ok = False
            return
        threading.Thread(target=self._warm, daemon=True).start()

    def _warm(self):
        try:
            with self.lock:
                if self.sr._reader is None:
                    import easyocr
                    print("กำลังโหลดโมเดล OCR สลิป (ครั้งแรกอาจนานหลายนาที)…")
                    self.sr._reader = easyocr.Reader(["th", "en"], gpu=False, verbose=False)
            self.ready = True
            print("OCR สลิปพร้อมแล้ว")
        except Exception as e:
            print(f"[!] โหลดโมเดล OCR ไม่ได้: {e}")
            self.ok = False

    def read(self, data_url: str) -> dict:
        import base64
        import tempfile
        head, b64 = data_url.split(",", 1)
        ext = ".png" if "png" in head else ".jpg"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as fh:
            fh.write(base64.b64decode(b64))
            tmp = Path(fh.name)
        try:
            with self.lock:  # EasyOCR ใช้พร้อมกันหลายคำขอไม่ได้
                lines = self.sr.ocr_lines(tmp)
        finally:
            tmp.unlink(missing_ok=True)
        slip = self.sr.parse_slip_text(lines)
        dt = slip.get("datetime")
        return {"engine": "easyocr", "amount": slip.get("amount"), "fee": slip.get("fee"),
                "date": dt.strftime("%Y-%m-%d") if dt else None, "time": dt.strftime("%H:%M") if dt else None,
                "sender": slip.get("from_name") or "", "receiver": slip.get("to_name") or "",
                "memo": slip.get("memo") or "", "ref": slip.get("ref") or "", "app": slip.get("app") or "",
                "kind": slip.get("kind") or "", "text": "\n".join(lines)}


class Handler(SimpleHTTPRequestHandler):
    voice: Voice = None
    slip: SlipOCR = None

    def _json(self, code: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        from urllib.parse import parse_qs, urlparse
        u = urlparse(self.path)
        if u.path == "/api/config":
            sl = self.slip
            return self._json(200, {"voice": bool(self.voice and self.voice.client), "feed": True, "owner": os.getenv("OWNER_NAME") or "",
                                    "slipOcr": bool(sl and sl.ok), "slipOcrReady": bool(sl and sl.ready),
                                    "slipVision": bool(os.getenv("SLIP_VISION_MODEL") and os.getenv("LLM_BASE_URL"))})
        if u.path == "/api/feed":
            a = parse_qs(u.query).get("after", [None])[0]
            return self._json(200, feed_after(int(a) if a and a.isdigit() else None))
        if u.path in ("/push", "/push/"):
            data = PUSH_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    def log_message(self, fmt, *args):  # ไม่พิมพ์ทุกครั้งที่แอปถาม /api/feed
        if "/api/feed" not in (self.path or ""):
            super().log_message(fmt, *args)

    def do_POST(self):
        # เว็บสาธารณะ: ตั้ง APP_PIN แล้วคำขอที่ใช้เครดิต (เสียง สลิป ส่งรายการ) ต้องแนบ PIN มา
        pin = os.getenv("APP_PIN")
        if pin and self.headers.get("X-App-Pin") != pin:
            n = int(self.headers.get("Content-Length") or 0)
            if 0 < n < MAX_AUDIO:
                self.rfile.read(n)
            return self._json(401, {"error": "locked"})
        if self.path == "/api/push":
            n = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(n) if 0 < n < 100_000 else b"{}")
            except ValueError:
                body = {}
            if body.get("kind") == "sms" and isinstance(body.get("text"), str) and body["text"].strip():
                ev = push_event({"kind": "sms", "text": body["text"][:500]})
            elif body.get("kind") == "wallet" and isinstance(body.get("record"), dict):
                ev = push_event({"kind": "wallet", "record": body["record"]})
            else:
                return self._json(400, {"error": "ต้องเป็น {kind:'sms', text} หรือ {kind:'wallet', record}"})
            print(f"[push] {ev['kind']} #{ev['id']}")
            return self._json(200, {"ok": True, "id": ev["id"]})
        if self.path == "/api/slip":
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_AUDIO:
                return self._json(400, {"error": "The photo is empty or too big"})
            try:
                body = json.loads(self.rfile.read(n))
                url = body.get("image", "")
                if not url.startswith("data:image/"):
                    return self._json(400, {"error": "Please send a photo"})
                if self.slip and self.slip.ok:
                    return self._json(200, self.slip.read(url))
                return self._json(200, read_slip_vision(url))
            except Exception as e:
                print(f"[ERROR slip] {e}")
                return self._json(502, {"error": "Could not read the slip"})
        if self.path != "/api/voice":
            return self._json(404, {"error": "Not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_AUDIO:
            return self._json(400, {"error": "The audio is empty or too big"})
        audio = self.rfile.read(n)
        try:
            from urllib.parse import unquote
            name = unquote(self.headers.get("X-Filename") or "")
            lang = (self.headers.get("X-Lang") or "auto").lower()
            self._json(200, self.voice.handle(audio, self.headers.get("Content-Type") or "audio/webm", name, lang))
        except VoiceOff:
            self._json(503, {"error": "voice_off"})
        except Exception as e:
            print(f"[ERROR] {e}")
            self._json(502, {"error": "Could not read your voice. Try again or type instead"})


def lan_ip() -> str:
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sk:
            sk.connect(("10.255.255.255", 1))
            return sk.getsockname()[0]
    except OSError:
        return "<IP เครื่องนี้>"


def self_signed_cert() -> tuple[str, str]:
    """สร้างใบรับรองสำหรับเดโมครั้งเดียว เก็บไว้ที่ .cert/ (อยู่ใน .gitignore)"""
    import shutil
    import subprocess
    d = ROOT / ".cert"
    cert, key = d / "cert.pem", d / "key.pem"
    if cert.exists() and key.exists():
        return str(cert), str(key)
    if not shutil.which("openssl"):
        raise SystemExit("ไม่พบคำสั่ง openssl ใช้ทาง A (cloudflared tunnel) แทน ดูคำอธิบายบนสุดของไฟล์นี้")
    d.mkdir(exist_ok=True)
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
                    "-keyout", str(key), "-out", str(cert), "-subj", "/CN=banrod-demo"], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return str(cert), str(key)


def main():
    ap = argparse.ArgumentParser(description="มีแผน: เว็บแอป + แปลงเสียงเป็นรายการ")
    ap.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    ap.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"), help="ใช้ 0.0.0.0 ถ้าจะเปิดจากเครื่องอื่น (ไมค์ใช้ไม่ได้ถ้าไม่ใช่ https)")
    ap.add_argument("--no-llm", action="store_true", help="ไม่เรียก LLM ให้แอปแยกรายการเองด้วยโค้ด")
    ap.add_argument("--no-ocr", action="store_true", help="ไม่ใช้ EasyOCR อ่านสลิปบนเซิร์ฟเวอร์")
    ap.add_argument("--https", action="store_true", help="เปิดแบบ https ด้วยใบรับรองที่สร้างเอง (ให้มือถือในวง Wi-Fi ใช้ไมค์ได้)")
    a = ap.parse_args()
    if not (DIST / "index.html").exists():
        raise SystemExit("ไม่พบ demo_web/dist/index.html ให้รัน python3 build.py ใน demo_web ก่อน")
    Handler.voice = Voice(use_llm=not a.no_llm)
    Handler.slip = None if (a.no_ocr or os.getenv("NO_OCR") == "1") else SlipOCR()
    srv = ThreadingHTTPServer((a.host, a.port), partial(Handler, directory=str(DIST)))
    scheme = "http"
    if a.https:
        import ssl
        cert, key = self_signed_cert()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        scheme = "https"
    if a.host == "0.0.0.0":
        print(f"มือถือในวง Wi-Fi เดียวกัน: {scheme}://{lan_ip()}:{a.port}")
    print(f"เปิด {scheme}://localhost:{a.port}  · STT: {Handler.voice.model} · LLM: {'เปิด' if Handler.voice.llm else 'ปิด (แยกด้วยโค้ด)'}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
