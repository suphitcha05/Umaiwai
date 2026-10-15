# Mock U-bot API สำหรับบ้านรอด AI

ชุดนี้ให้ทีมสร้างและเดโมแอปได้โดยไม่ต้องรอ API จริงของ U-bot ข้อมูลทั้งหมดเป็น **ข้อมูลปลอม** ไม่มีการต่อระบบธนาคารจริง และออกแบบให้สลับไปต่อของจริงได้เมื่อได้สิทธิ์ (ดูหัวข้อ "สลับไปของจริง")

## ไฟล์ในชุด

| ไฟล์ | หน้าที่ |
|---|---|
| `mock_server.py` | เซิร์ฟเวอร์ปลอม (FastAPI) คืนข้อมูลบัญชี / ธุรกรรม / หนี้บัตร และมีระบบ token |
| `ubot_client.py` | client ฝั่งแอป (Python) ใช้ได้ทั้ง mock และของจริง |
| `llm_parser.py` | ตัวเรียก AI (KKU IntelSphere หรือ gateway แบบ OpenAI-compatible) แปลงข้อความเป็นรายการ และตอบคำถาม มี fallback เมื่อ AI ใช้ไม่ได้ |
| `demo.py` | ตัวอย่างใช้ `UBotClient` ทั้งชุด |
| `smoke_test.py` | สคริปต์ทดสอบอัตโนมัติ (11 ข้อ) |
| `test_ui.html` | หน้าเว็บทดสอบ ลองกดเรียก API จากเบราว์เซอร์ |

## ต้องมีอะไร

- Python 3.10 ขึ้นไป (โค้ดใช้ไวยากรณ์ `str | None`)
- แพ็กเกจ: `fastapi`, `uvicorn`, `requests`

```powershell
python -m pip install fastapi uvicorn requests
```

> ถ้าคำสั่ง `uvicorn` ไม่เจอบน Windows ให้เรียกผ่าน Python เสมอ: `python -m uvicorn ...`

## เริ่มใช้ (เครื่องเดียว)

ใช้ PowerShell สองหน้าต่าง

**หน้าต่างที่ 1: เปิด server**

```powershell
cd <โฟลเดอร์นี้>
python -m uvicorn mock_server:app --port 8002
```

เห็น `Uvicorn running on http://127.0.0.1:8002` แปลว่าพร้อม (เปิดค้างไว้) ลองเปิด `http://localhost:8002/docs` จะเห็นรายการ endpoint ทั้งหมด

**หน้าต่างที่ 2: รันเดโม**

```powershell
cd <โฟลเดอร์นี้>
$env:UBOT_BASE_URL="http://localhost:8002"
python demo.py
```

> `demo.py` และ `ubot_client.py` ใช้ `http://localhost:8001` เป็นค่าเริ่มต้นถ้าไม่ตั้ง `UBOT_BASE_URL` จะต้องเปิด server ที่ port 8001 ให้ตรงกัน
>
> ถ้าได้ error `10048` (port ถูกใช้อยู่) แปลว่ามี server เก่าค้าง ให้เปลี่ยนเลข port แล้วตั้ง `UBOT_BASE_URL` ให้ตรง

## เปิดใช้ AI จริง (ไม่บังคับ)

ถ้าไม่ตั้งค่า ระบบจะใช้ข้อความสำรอง (`fallback`) ซึ่งเดโมได้ แต่ไม่ฉลาดเท่า AI จริง ตั้งค่าในหน้าต่างเดียวกับที่เปิด server **ก่อน** สั่งรัน server:

```powershell
$env:LLM_BASE_URL="https://<ที่อยู่ IntelSphere>/v1"
$env:LLM_API_KEY="<key ของคุณ>"
$env:LLM_MODEL="<ชื่อโมเดล>"
python -m uvicorn mock_server:app --port 8002
```

- `llm_parser.py` เรียกแบบ OpenAI-compatible (`POST {LLM_BASE_URL}/chat/completions`) ถ้า gateway จริงต่างออกไป แก้ฟังก์ชัน `_call_llm` ที่เดียว
- ในผลลัพธ์ฟิลด์ `source` บอกว่าใช้ `llm` หรือ `fallback` และถ้าเป็น `fallback` ฟิลด์ `error` บอกสาเหตุ
- **อย่าใส่ API key ในโค้ด อย่าส่งทางแชท และอย่า commit ขึ้น git** ตัวแปร `$env:` มีผลเฉพาะหน้าต่างนั้น

## Endpoint

ต้องล็อกอินก่อน (ยกเว้น `/auth/login`) แล้วส่ง `Authorization: Bearer <token>` ทุกครั้ง token หมดอายุใน 5 นาที (ได้ 401 ให้ล็อกอินใหม่)

| Method และ path | ทำอะไร |
|---|---|
| `POST /auth/login` | ล็อกอิน (`demo` / `demo1234`) ได้ `access_token` |
| `GET /accounts` | รายการบัญชี |
| `GET /accounts/{account_id}/transactions` | ธุรกรรมของบัญชี (ตัวอย่าง `acc_001`) |
| `GET /credit-cards` | หนี้บัตร: ยอดคงค้าง ขั้นต่ำ วันครบกำหนด ดอกเบี้ย |
| `POST /chat` | ถามบอท `{"message": "..."}` ได้ `{"reply": "...", "source": "..."}` |
| `POST /chat/parse` | แปลงข้อความเป็นรายการ `{"message": "..."}` ได้ `{"items": [...], "source": "..."}` |

ตัวอย่างผลของ `/chat/parse`:

```json
{
  "items": [
    {"type": "expense", "amount": 60.0, "merchant": "ร้านป้าแมว", "category": "อาหาร", "needs_review": false}
  ],
  "source": "llm"
}
```

รายการที่จำนวนเงินไม่ชัด หรือมาจาก `fallback` จะมี `needs_review: true` ให้แสดงหน้าตรวจให้ผู้ใช้แก้ก่อนบันทึก

> ตัวเลขที่ต้องแสดงใน UI (ยอดหนี้ ขั้นต่ำ งบ) ควรดึงจาก endpoint ข้อมูลหรือคำนวณด้วยโค้ด ไม่ควรอ่านจากข้อความที่ AI ตอบ

## ให้เพื่อนเรียกจากอีกเครื่อง

**ฝั่งเจ้าของ server**

```powershell
python -m uvicorn mock_server:app --host 0.0.0.0 --port 8002
ipconfig
```

ดู `IPv4 Address` ของ Wi-Fi (เช่น `192.168.1.25`) แล้วส่งให้เพื่อน Windows Firewall อาจถาม ให้อนุญาตเฉพาะ **Private network**

**ฝั่งเพื่อน** (ต้องอยู่ Wi-Fi เดียวกัน)

- เปิด `http://<IP>:8002/docs` ในเบราว์เซอร์เพื่อลองยิงโดยไม่ต้องเขียนโค้ด
- เรียกจากโค้ดเว็บ: `fetch("http://<IP>:8002/credit-cards", { headers: { Authorization: "Bearer " + token } })` (server เปิด CORS ไว้แล้ว)
- หรือทดสอบทั้งชุดด้วย `python smoke_test.py http://<IP>:8002`

ข้อควรรู้: ทุกคำขอ `/chat` และ `/chat/parse` ใช้โควตา key ของเจ้าของ server และไม่มีการจำกัดจำนวนครั้ง ใครอยู่เครือข่ายเดียวกันและรู้ IP ก็เรียกได้ ใช้เฉพาะเครือข่ายที่ไว้ใจ และปิด server (Ctrl+C) เมื่อเลิกใช้ ตอนเดโมจริงแนะนำรันทุกอย่างบนเครื่องเดียวด้วย `localhost`

## ทดสอบ

**อัตโนมัติ**

```powershell
python smoke_test.py http://localhost:8002
```

ต้องได้ `ผ่าน 11/11 ข้อ` ตรวจ: server ตอบ, login ผิด/ไม่ใส่ token ได้ 401, ดึงข้อมูล, parse ข้อความ, ไม่เดาตัวเลขเมื่อข้อความไม่มีจำนวนเงิน, ถามบอท

**ด้วยหน้าเว็บ**

ดับเบิลคลิก `test_ui.html` ใส่ Base URL ของ server กดล็อกอิน แล้วกดปุ่มต่างๆ ผลขึ้นในกล่องด้านล่าง ภาษาไทยแสดงถูกต้อง

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `uvicorn` ไม่ถูกรู้จัก | ใช้ `python -m uvicorn ...` และติดตั้งแพ็กเกจด้วย `python -m pip install ...` |
| `10048` port ถูกใช้อยู่ | มี server เก่าค้าง เปลี่ยนเลข port หรือปิด process เก่า |
| `404` ที่ `/chat/parse` | server ที่รันอยู่เป็นโค้ดเก่า ปิดแล้วเปิดใหม่จากโฟลเดอร์นี้ (server โหลดโค้ดตอนเริ่มเท่านั้น) |
| `401` | token หมดอายุหรือไม่ได้ใส่ ล็อกอินใหม่ |
| ตอบเป็น `fallback` ตลอด | ยังไม่ได้ตั้ง `LLM_*` ในหน้าต่างที่รัน server หรือ URL/key/ชื่อโมเดลไม่ถูก ดูฟิลด์ `error` |
| เบราว์เซอร์ฟ้อง CORS | ใช้ `mock_server.py` ชุดนี้ (มี CORS) และรีสตาร์ต server |
| ภาษาไทยเพี้ยนใน PowerShell | เป็นแค่การแสดงผลของ PowerShell รุ่นเก่า ข้อมูลที่ server ส่งถูกต้อง ใช้ `test_ui.html` หรือ `/docs` แทน |
| เพื่อนเข้าไม่ได้ | เช็ก Wi-Fi เดียวกัน, เปิด server ด้วย `--host 0.0.0.0`, Firewall, IP ไม่เปลี่ยน (Wi-Fi มหาวิทยาลัยบางแห่งบล็อกการเชื่อมต่อระหว่างเครื่อง ลองฮอตสปอตมือถือ) |

## สลับไปใช้ API จริง

แก้สองจุดใน `ubot_client.py` (มาร์ก `SWAP POINT` ไว้):

1. **base URL**: ตั้ง `UBOT_BASE_URL` แทนการแก้โค้ด ใส่ `username` / `password` จริงตอนสร้าง `UBotClient(...)`
2. **path และชื่อฟิลด์**: path และชื่อฟิลด์ใน mock นี้ **เป็นการออกแบบเอง ไม่ได้มาจากเอกสาร U-bot จริง** ถ้า API จริงต่างออกไป ให้แก้เมธอด `_login()` และการ parse ในเมธอด `get_*` ส่วนที่เหลือของแอปไม่ต้องแตะ

ตอนเดโมให้บอกกรรมการตรงๆ ว่าตอนนี้ต่อ mock และโค้ดพร้อมสลับไปของจริง

## สิ่งที่ mock นี้ยังไม่มี

- บันทึกรายการใหม่ (ข้อมูลเป็นค่าตายตัวในไฟล์ รูดบัตรแล้วงบไม่เปลี่ยน)
- U-Wallet: รายการจำลอง และจ่ายบิลบัตร
- แปลงเสียงเป็นข้อความ (ต้องต่อ ElevenLabs แยกต่างหาก)
- การตั้งค่ารายได้ ค่าคงที่ และคำนวณงบรายวัน (เป็นงานของแอป)
