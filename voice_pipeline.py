"""
voice_pipeline.py — ทดสอบรวมระบบ: เสียง -> ข้อความ -> รายการรายรับ/รายจ่าย
==========================================================================
โฟลว์:
  1. รับเสียงจากไมค์
  2. ElevenLabs (scribe_v2_realtime) แปลงเสียงเป็นข้อความแบบ realtime
  3. ส่งข้อความเข้า U_bot_demo (parse_utterance) -> ได้รายการ type/amount/merchant/category

โหมดการส่งข้อความ (ข้อ 3):
  - ดีฟอลต์: ผ่าน mock server ด้วย UBotClient (ต้องเปิด server ไว้ก่อน)
             ถ้าต่อ server ไม่ได้ จะสลับไปเรียก llm_parser ตรงๆ ให้อัตโนมัติ
  - --direct: เรียก llm_parser.parse_utterance ตรงๆ ไม่ต้องเปิด server

วิธีรัน (จากโฟลเดอร์ Umaiwai):
    python voice_pipeline.py
    python voice_pipeline.py --direct
    python voice_pipeline.py --device 1        # เลือกไมค์ (ดู --list-devices)
กด Ctrl+C เพื่อหยุด แล้วจะสรุปยอดรวมให้

ค่าที่ใช้ (อ่านจากไฟล์ .env):
    elevenlab/.env   -> ELEVENLABS_API_KEY
    U_bot_demo/.env  -> LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
ผลลัพธ์ (ในโฟลเดอร์ voice_logs/):
    session_*.txt   ไฟล์อ่านง่ายสำหรับคน: ข้อความที่ทำความสะอาดแล้ว + รายการที่แยกได้
    session_*.jsonl ข้อมูลเต็มสำหรับโปรแกรม: ข้อความดิบ, ข้อความสะอาด, ผลจาก LLM

ปรับแต่ง:
    keyterms.txt    ชื่อสินค้า/แบรนด์ที่พูดบ่อย ช่วยให้ ElevenLabs ฟังถูก (สูงสุด 50 คำ, คำละไม่เกิน 20 ตัวอักษร)
    text_cleaner.py ตัดคำเติม + แปลงตัวเลขคำไทยเป็นตัวเลข ก่อนส่งเข้า LLM
"""
import argparse
import asyncio
import base64
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "U_bot_demo"))

from dotenv import load_dotenv

load_dotenv(ROOT / "elevenlab" / ".env")
load_dotenv(ROOT / "U_bot_demo" / ".env")

import requests
import sounddevice as sd
from elevenlabs import AudioFormat, CommitStrategy, ElevenLabs, RealtimeEvents

import llm_parser                      # จาก U_bot_demo
from text_cleaner import clean_text    # ทำข้อความให้อ่านง่ายก่อนเข้า LLM
from ubot_client import UBotClient     # จาก U_bot_demo

SAMPLE_RATE = 16000
VAD_SILENCE_SECS = 1.5                 # เงียบนานเท่านี้ถึงตัดประโยค (เดิม 1.0 ทำให้ตัดกลางคำ)
BLOCK_SIZE = SAMPLE_RATE // 10         # ส่งทีละ 100 ms

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def parse_args():
    p = argparse.ArgumentParser(description="Voice -> ElevenLabs STT -> U bot parse_utterance")
    p.add_argument("--direct", action="store_true", help="เรียก llm_parser ตรงๆ ไม่ผ่าน mock server")
    p.add_argument("--lang", default="tha", help="รหัสภาษา (ดีฟอลต์ tha)")
    p.add_argument("--device", type=int, default=None, help="หมายเลขไมค์")
    p.add_argument("--list-devices", action="store_true")
    return p.parse_args()


class Parser:
    """ขั้นที่ 3: ส่งข้อความเข้าโค้ด U_bot_demo"""

    def __init__(self, direct: bool):
        self.client = None if direct else UBotClient()
        self.mode = "direct (llm_parser)" if direct else f"U bot server ({self.client.base_url})"

    def parse(self, text: str) -> dict:
        if self.client:
            try:
                return self.client.parse_utterance(text)
            except requests.exceptions.ConnectionError:
                print("\n[!] ต่อ mock server ไม่ได้ -> สลับไปเรียก llm_parser ตรงๆ")
                self.client = None
                self.mode = "direct (llm_parser)"
        return llm_parser.parse_utterance(text)


def load_keyterms(path: Path) -> list[str]:
    """อ่าน keyterms.txt: บรรทัดละคำ ข้ามบรรทัดว่างและ # ; ตัดตามข้อจำกัดของ ElevenLabs"""
    if not path.exists():
        return []
    terms = []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.split("#", 1)[0].strip()
        if t and len(t) <= 20 and t not in terms:
            terms.append(t)
    return terms[:50]


def format_items(res: dict) -> list[str]:
    """แปลงผลจาก U bot เป็นบรรทัดข้อความอ่านง่าย (ใช้ทั้งบนจอและในไฟล์ .txt)"""
    items = res.get("items") or []
    if not items:
        return ["(ไม่พบรายการเงินในประโยคนี้)"]
    lines = []
    for it in items:
        amt = f"{it['amount']:,.2f}" if it.get("amount") is not None else "?"
        sign = "+" if it.get("type") == "income" else "-"
        flag = f"  ⚠ ต้องตรวจ: {it.get('review_reason') or ''}" if it.get("needs_review") else ""
        lines.append(f"{sign} {amt:>10} บาท | {it.get('merchant','')} | {it.get('category','')}{flag}")
    return lines


def show_result(res: dict) -> None:
    print(f"   └─ แหล่ง: {res.get('source')}" + (f"  (error: {res['error']})" if res.get("error") else ""))
    for line in format_items(res):
        print(f"      {line}")


async def main():
    args = parse_args()
    if args.list_devices:
        print(sd.query_devices())
        return

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ไม่พบ ELEVENLABS_API_KEY ใน elevenlab/.env")
        return

    parser = Parser(direct=args.direct)
    logdir = ROOT / "voice_logs"
    logdir.mkdir(exist_ok=True)
    stamp = f"{datetime.now():%Y%m%d_%H%M%S}"
    logfile = logdir / f"session_{stamp}.jsonl"
    txtfile = logdir / f"session_{stamp}.txt"
    log = open(logfile, "a", encoding="utf-8")
    txt = open(txtfile, "a", encoding="utf-8")
    txt.write(f"บันทึกรายจ่ายจากเสียง — {datetime.now():%d/%m/%Y %H:%M}\n{'=' * 50}\n\n")
    keyterms = load_keyterms(ROOT / "keyterms.txt")
    all_items: list[dict] = []

    print(f"ข้อ 3 ส่งข้อความไปที่: {parser.mode}")
    print(f"LLM: {os.getenv('LLM_MODEL') or '(ไม่ได้ตั้ง -> ใช้ fallback)'}")
    print(f"keyterms: {len(keyterms)} คำ (จาก keyterms.txt)")
    print(f"บันทึกผลที่: {txtfile}")

    loop = asyncio.get_running_loop()
    text_queue: asyncio.Queue = asyncio.Queue()   # ประโยคที่รอส่งเข้า U bot
    audio_queue: asyncio.Queue = asyncio.Queue()
    stop = asyncio.Event()

    # ---------- ขั้นที่ 2: ElevenLabs realtime ----------
    conn = await ElevenLabs(api_key=api_key).speech_to_text.realtime.connect({
        "model_id": "scribe_v2_realtime",
        "audio_format": AudioFormat.PCM_16000,
        "sample_rate": SAMPLE_RATE,
        "commit_strategy": CommitStrategy.VAD,
        "vad_silence_threshold_secs": VAD_SILENCE_SECS,
        "language_code": args.lang,
        "no_verbatim": True,                 # ให้ ElevenLabs ตัด อ่า/เอ่อ/พูดซ้ำ ให้ตั้งแต่ต้นทาง
        **({"keyterms": keyterms} if keyterms else {}),
    })

    def on_partial(d):
        print(f"\r… {d.get('text', '')[-90:]:<90}", end="", flush=True)

    def on_committed(d):
        text = d.get("text", "").strip()
        if text:
            print(f"\r🎤 ดิบ     : {text:<90}")
            text_queue.put_nowait(text)

    def on_error(d):
        print(f"\n[ERROR ElevenLabs] {d}")
        stop.set()

    conn.on(RealtimeEvents.SESSION_STARTED, lambda d: print("\n✅ เชื่อมต่อแล้ว — พูดได้เลย เช่น \"กินข้าวมันไก่ 50 บาท ค่าวิน 20\" (Ctrl+C หยุด)\n"))
    conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, on_partial)
    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, on_committed)
    conn.on(RealtimeEvents.ERROR, on_error)
    conn.on(RealtimeEvents.CLOSE, lambda *_: stop.set())

    # ---------- ขั้นที่ 1: ไมค์ ----------
    def mic_cb(indata, frames, t, status):
        loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata))

    async def audio_sender():
        while True:
            chunk = await audio_queue.get()
            await conn.send({"audio_base_64": base64.b64encode(chunk).decode("ascii")})

    # ---------- ขั้นที่ 3: ข้อความ -> U bot ----------
    async def text_worker():
        while True:
            raw = await text_queue.get()
            clean = clean_text(raw)                              # ทำให้อ่านง่ายก่อนเข้า LLM
            print(f"   📝 อ่านง่าย: {clean}")
            res = await asyncio.to_thread(parser.parse, clean)  # ไม่บล็อกการรับเสียง
            show_result(res)
            all_items.extend(i for i in res.get("items", []) if i.get("amount") is not None)
            now = datetime.now()
            log.write(json.dumps({"time": now.isoformat(timespec="seconds"),
                                  "text_raw": raw, "text": clean, **res}, ensure_ascii=False) + "\n")
            log.flush()
            txt.write(f"[{now:%H:%M:%S}] {clean}\n" + "".join(f"    {l}\n" for l in format_items(res)) + "\n")
            txt.flush()
            text_queue.task_done()

    tasks = []
    try:
        with sd.RawInputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16",
                               blocksize=BLOCK_SIZE, device=args.device, callback=mic_cb):
            tasks = [asyncio.create_task(audio_sender()), asyncio.create_task(text_worker())]
            await stop.wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        try:
            await conn.commit()
            await asyncio.sleep(1.5)                       # รอประโยคสุดท้าย
            await asyncio.wait_for(text_queue.join(), 20)  # รอ U bot แปลงให้ครบ
        except Exception:
            pass
        for t in tasks:
            t.cancel()
        await conn.close()

        exp = sum(i["amount"] for i in all_items if i["type"] == "expense")
        inc = sum(i["amount"] for i in all_items if i["type"] == "income")
        review = sum(1 for i in all_items if i.get("needs_review"))
        summary = (f"=== สรุปเซสชัน ===\n  รายการ: {len(all_items)} (ต้องตรวจ {review}) | "
                   f"รายจ่ายรวม: {exp:,.2f} บาท | รายรับรวม: {inc:,.2f} บาท")
        txt.write(f"{'=' * 50}\n{summary}\n")
        log.close()
        txt.close()
        print(f"\n{summary}\n  ไฟล์อ่านง่าย: {txtfile}\n  ไฟล์ข้อมูล : {logfile}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
