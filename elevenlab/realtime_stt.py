"""
ElevenLabs Realtime Speech-to-Text จากไมค์ -> บันทึกเป็นไฟล์ .txt

โฟลว์: ไมค์ (16 kHz, mono, PCM 16-bit) -> WebSocket ของ ElevenLabs (scribe_v2_realtime)
      -> ได้ข้อความ partial (แสดงสด) และ committed (ประโยคที่จบแล้ว) -> เขียนลงไฟล์

วิธีรัน:
    python realtime_stt.py              # ตรวจจับภาษาอัตโนมัติ
    python realtime_stt.py --lang tha   # บังคับภาษาไทย
    python realtime_stt.py --lang eng   # บังคับภาษาอังกฤษ
    python realtime_stt.py --list-devices   # ดูรายชื่อไมค์
    python realtime_stt.py --device 1       # เลือกไมค์ตามหมายเลข
กด Ctrl+C เพื่อหยุด
"""
import argparse
import asyncio
import base64
import os
import sys
from datetime import datetime
from pathlib import Path

import sounddevice as sd
from dotenv import load_dotenv
from elevenlabs import AudioFormat, CommitStrategy, ElevenLabs, RealtimeEvents

SAMPLE_RATE = 16000          # ElevenLabs รับ pcm_16000
CHUNK_MS = 100               # ส่งเสียงทีละ 100 ms
BLOCK_SIZE = SAMPLE_RATE * CHUNK_MS // 1000

# Windows console ให้แสดงภาษาไทยได้
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def parse_args():
    p = argparse.ArgumentParser(description="ElevenLabs realtime STT from microphone")
    p.add_argument("--lang", default=None, help="รหัสภาษา เช่น tha, eng (ไม่ใส่ = ตรวจจับอัตโนมัติ)")
    p.add_argument("--device", type=int, default=None, help="หมายเลขไมค์ (ดูจาก --list-devices)")
    p.add_argument("--list-devices", action="store_true", help="แสดงรายชื่ออุปกรณ์เสียงแล้วออก")
    p.add_argument("--outdir", default="transcripts", help="โฟลเดอร์เก็บไฟล์ข้อความ")
    return p.parse_args()


async def main():
    args = parse_args()
    if args.list_devices:
        print(sd.query_devices())
        return

    load_dotenv()
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ไม่พบ ELEVENLABS_API_KEY — สร้างไฟล์ .env แล้วใส่ ELEVENLABS_API_KEY=xxxx")
        return

    # เตรียมไฟล์ผลลัพธ์
    outdir = Path(args.outdir)
    outdir.mkdir(exist_ok=True)
    outfile = outdir / f"transcript_{datetime.now():%Y%m%d_%H%M%S}.txt"
    f = open(outfile, "a", encoding="utf-8")

    client = ElevenLabs(api_key=api_key)
    options = {
        "model_id": "scribe_v2_realtime",
        "audio_format": AudioFormat.PCM_16000,
        "sample_rate": SAMPLE_RATE,
        "commit_strategy": CommitStrategy.VAD,   # เซิร์ฟเวอร์ตัดประโยคเองเมื่อเราหยุดพูด
        "vad_silence_threshold_secs": 1.0,
    }
    if args.lang:
        options["language_code"] = args.lang

    connection = await client.speech_to_text.realtime.connect(options)
    stop = asyncio.Event()

    def on_partial(data):
        text = data.get("text", "")
        print(f"\r… {text[-100:]:<100}", end="", flush=True)

    def on_committed(data):
        text = data.get("text", "").strip()
        if not text:
            return
        line = f"[{datetime.now():%H:%M:%S}] {text}"
        print(f"\r✔ {line:<100}")
        f.write(line + "\n")
        f.flush()                     # เขียนลงดิสก์ทันที ไม่หายถ้าโปรแกรมปิดกะทันหัน

    def on_error(data):
        print(f"\n[ERROR] {data}")
        stop.set()

    connection.on(RealtimeEvents.SESSION_STARTED, lambda d: print("เชื่อมต่อแล้ว — เริ่มพูดได้เลย (Ctrl+C เพื่อหยุด)\n"))
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, on_partial)
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, on_committed)
    connection.on(RealtimeEvents.ERROR, on_error)
    connection.on(RealtimeEvents.CLOSE, lambda *_: stop.set())

    # ไมค์ทำงานบน thread ของ sounddevice -> ส่งต่อเข้า asyncio queue
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def mic_callback(indata, frames, time_info, status):
        if status:
            print(f"\n[mic] {status}", file=sys.stderr)
        loop.call_soon_threadsafe(queue.put_nowait, bytes(indata))

    async def sender():
        while not stop.is_set():
            chunk = await queue.get()
            await connection.send({"audio_base_64": base64.b64encode(chunk).decode("ascii")})

    stream = sd.RawInputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="int16",
        blocksize=BLOCK_SIZE, device=args.device, callback=mic_callback,
    )

    print(f"บันทึกข้อความลงไฟล์: {outfile.resolve()}")
    send_task = None
    try:
        with stream:
            send_task = asyncio.create_task(sender())
            await stop.wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        if send_task:
            send_task.cancel()
        try:
            await connection.commit()     # ส่งเสียงที่ค้างอยู่ให้แปลงก่อนปิด
            await asyncio.sleep(1.5)
        except Exception:
            pass
        await connection.close()
        f.close()
        print(f"\nหยุดแล้ว — ไฟล์อยู่ที่ {outfile.resolve()}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
