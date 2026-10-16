"""
slip_reader.py — อ่านสลิปโอนเงิน (รูปภาพ) -> รายการรายรับ/รายจ่าย
===================================================================
รองรับ: ออมสิน (MyMo) เป็นหลัก + กรุงไทย, กสิกร (K PLUS/MAKE), ทรูมันนี่ และสลิปทั่วไปที่มี
        "จำนวนเงิน / วันที่ / รหัสอ้างอิง"

โฟลว์:
  1. OCR ภาษาไทย+อังกฤษ ด้วย EasyOCR (ทำงานในเครื่อง ไม่ส่งรูปออกไปไหน)
  2. แยกข้อมูลด้วยกฎ (regex): จำนวนเงิน, ค่าธรรมเนียม, วันที่-เวลา (พ.ศ. -> ค.ศ.), รหัสอ้างอิง,
     ผู้โอน, ผู้รับ, บันทึกช่วยจำ
  3. จัดหมวดด้วย LLM (KKU) จาก "บันทึกช่วยจำ/ผู้รับ" ถ้า LLM ใช้ไม่ได้ -> "อื่นๆ"
  4. กันสลิปซ้ำด้วยรหัสอ้างอิง แล้วสรุปแบบเดียวกับ voice_pipeline

ติดตั้ง (ครั้งแรก):  pip install easyocr      (ครั้งแรกที่รันจะดาวน์โหลดโมเดล OCR ~100MB)

วิธีรัน (จากโฟลเดอร์ Umaiwai):
    python slip_reader.py                    # อ่านทุกรูปในโฟลเดอร์ slips/
    python slip_reader.py slips\\a.jpg b.png  # ระบุไฟล์เอง
    python slip_reader.py --show-ocr          # แสดงข้อความที่ OCR อ่านได้ (ไว้แก้ปัญหา)

ตั้งชื่อเจ้าของบัญชีใน U_bot_demo/.env เพื่อแยก "โอนออก=รายจ่าย / รับเข้า=รายรับ":
    OWNER_NAME=นิปุณ ถมปัทม์
ถ้าไม่ตั้ง จะถือว่าทุกสลิปเป็นรายจ่าย (สลิปส่วนใหญ่คือหลักฐานการโอนออก)
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "U_bot_demo"))

from dotenv import load_dotenv

load_dotenv(ROOT / "U_bot_demo" / ".env")

import llm_parser                                   # จาก U_bot_demo (ใช้ CATEGORIES, เกณฑ์ตรวจ, เรียก LLM)
from report import DT_FMT, build_summary, format_items

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# ---------------------------------------------------------------- ข้อมูลอ้างอิง
BANKS = [  # (คำที่เจอบนสลิป, ชื่อธนาคาร)
    (("ออมสิน", "gsb", "csb", "mymo"), "ออมสิน"),
    (("กรุงไทย", "krungthai"), "กรุงไทย"),
    (("กสิกร", "kbank", "k plus", "make"), "กสิกรไทย"),
    (("ไทยพาณิชย์", "scb"), "ไทยพาณิชย์"),
    (("กรุงเทพ", "bangkok bank", "bualuang"), "กรุงเทพ"),
    (("กรุงศรี", "krungsri"), "กรุงศรี"),
    (("ทหารไทยธนชาต", "ttb"), "ทีทีบี"),
    (("ทรูมันนี่", "ทรูมันนี", "truemoney"), "ทรูมันนี่"),
    (("พร้อมเพย์", "promptpay"), "พร้อมเพย์"),
]
MONTHS = {"มค": 1, "กพ": 2, "มีค": 3, "เมย": 4, "พค": 5, "มิย": 6,
          "กค": 7, "สค": 8, "กย": 9, "ตค": 10, "พย": 11, "ธค": 12,
          "3ค": 10}  # OCR มักอ่าน "ต" เป็น "๓"
THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
LABEL_AMOUNT = ("จำนวนเงิน", "จำนวน")
LABEL_REF = ("รหัสอ้างอิง", "เลขที่รายการ", "หมายเลขการทำรายการ", "เลขที่อ้างอิง")
LABEL_MEMO = ("บันทึกช่วยจำ", "บันทึก")
LABEL_FROM = ("จาก",)
LABEL_TO = ("ถึง", "ไปยัง", "ไปที่")
MONEY_RE = re.compile(r"(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)")


# ---------------------------------------------------------------- OCR
_reader = None


def ocr_lines(path: Path) -> list[str]:
    """อ่านข้อความจากรูป -> รายการบรรทัด (เรียงบนลงล่าง) ตัดเศษที่ความมั่นใจต่ำทิ้ง"""
    global _reader
    if _reader is None:
        import easyocr  # import ตอนใช้ เพราะโหลดนาน
        print("กำลังโหลดโมเดล OCR (ครั้งแรกอาจนานหลายนาที)...")
        _reader = easyocr.Reader(["th", "en"], gpu=False, verbose=False)
    lines = []
    for _box, text, conf in _reader.readtext(str(path)):
        t = text.strip()
        if conf >= 0.15 and t.strip(" .,_-;<>|"):
            lines.append(t)
    return lines


# ---------------------------------------------------------------- แยกข้อมูลจากข้อความ
def _fix_number(s: str) -> str:
    """แก้ OCR สับสนตัวอักษร-ตัวเลข เฉพาะในก้อนที่หน้าตาเป็นตัวเลข เช่น '1oo.00' -> '100.00'"""
    s = s.translate(THAI_DIGITS)

    def fix(m):
        return m.group(0).translate(str.maketrans("oOdDlI|", "0000111"))

    return re.sub(r"[\doOdDlI|][\doOdDlI|,]*\.[\doOdD]{2}\b", fix, s)


def _money(s: str) -> float | None:
    m = MONEY_RE.search(_fix_number(s))
    return float(m.group(1).replace(",", "") + "." + m.group(2)) if m else None


def _after_label(lines: list[str], labels, same_line=True) -> tuple[int, str] | None:
    """หาค่าหลังป้ายกำกับ: ในบรรทัดเดียวกัน (หลัง ':') หรือบรรทัดถัดไป"""
    for i, ln in enumerate(lines):
        for lb in labels:
            if lb in ln:
                rest = ln.split(lb, 1)[1].strip(" :：")
                if same_line and rest:
                    return i, rest
                if i + 1 < len(lines):
                    return i + 1, lines[i + 1]
    return None


def find_amount(lines):
    # 1) บรรทัดถัดจาก "จำนวนเงิน"
    for i, ln in enumerate(lines):
        if any(lb in ln for lb in LABEL_AMOUNT) and "ค่าธรรมเนียม" not in ln:
            for cand in [ln] + lines[i + 1:i + 3]:
                if "ค่าธรรมเนียม" in cand:
                    continue
                v = _money(cand)
                if v is not None:
                    return v
    # 2) บรรทัดที่ขึ้นต้นด้วย ฿ (ทรูมันนี่ OCR อ่านเป็น 'b')
    for ln in lines:
        if re.match(r"^\s*(฿|b|B)\s*[\doO]", ln):
            v = _money(ln)
            if v is not None:
                return v
    # 3) ตัวเลขเงินตัวแรกที่ไม่ใช่ค่าธรรมเนียม
    for ln in lines:
        if "ค่าธรรมเนียม" not in ln:
            v = _money(ln)
            if v:
                return v
    return None


def find_fee(lines):
    for i, ln in enumerate(lines):
        if "ค่าธรรมเนียม" in ln:
            for cand in (ln, lines[i + 1] if i + 1 < len(lines) else ""):
                v = _money(cand)
                if v is not None:
                    return v
    return 0.0


def find_datetime(lines):
    text = " ".join(lines).translate(THAI_DIGITS)
    # วัน + เดือนย่อ (ยอมให้ OCR แตกเป็นหลายก้อน) + ปี พ.ศ./ค.ศ. + เวลา
    # วันต้องไม่ติดกับตัวเลข/อักษรอื่น (กันไปจับท้ายรหัสอ้างอิง); เดือนยอมให้มี '3' เพราะ OCR อ่าน 'ต' เป็น '๓'
    m = re.search(r"(?<![\dA-Za-z|])(\d{1,2})\s*([ก-ฮะ-์.\s|3]{1,12}?)\s*(25\d{2}|20\d{2})\s*[-–]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if not m:
        return None
    day, mon_raw, year, hh, mm, ss = m.groups()
    letters = re.sub(r"[^ก-ฮ3]", "", mon_raw)
    letters = re.sub(r"(.)\1+", r"\1", letters)          # 'กคค' -> 'กค'
    month = MONTHS.get(letters)
    if month is None:  # เทียบใกล้เคียงที่สุด
        best = max(MONTHS, key=lambda k: SequenceMatcher(None, k, letters).ratio())
        month = MONTHS[best] if SequenceMatcher(None, best, letters).ratio() >= 0.5 else None
    if month is None:
        return None
    y = int(year)
    y = y - 543 if y > 2400 else y
    try:
        return datetime(y, month, int(day), int(hh), int(mm), int(ss or 0))
    except ValueError:
        return None


def find_ref(lines):
    hit = _after_label(lines, LABEL_REF)
    if not hit:
        return None
    ref = re.sub(r"\s+", "", hit[1]).upper().replace("|", "I")
    return ref if len(ref) >= 6 else None


def find_memo(lines):
    hit = _after_label(lines, LABEL_MEMO)
    if not hit:
        return None
    memo = hit[1].strip()
    if re.search(r"qr|code|สแกน", memo, re.I):           # ไม่มีบันทึก แต่ไปเจอบรรทัด QR แทน
        return None
    return memo


STOP_LABELS = LABEL_FROM + LABEL_TO + LABEL_MEMO + LABEL_AMOUNT + LABEL_REF + ("ค่าธรรมเนียม", "วันที่", "qr", "สแกน")


def _is_noise(ln: str) -> bool:
    """เลขบัญชีที่ปิดบัง หรือเศษ OCR ที่ไม่มีตัวอักษรจริง"""
    return bool(re.fullmatch(r"[\dxX*\-\s]+", ln)) or not re.search(r"[ก-ฮA-Za-z]{2,}", ln)


def find_party(lines, labels):
    """ผู้โอน/ผู้รับ: บรรทัดหลังป้าย 'จาก'/'ถึง' -> (ชื่อ, ธนาคาร)"""
    for i, ln in enumerate(lines):
        if ln.strip() in labels:
            name, bank = None, None
            for nxt in lines[i + 1:i + 6]:
                low = nxt.strip().lower()
                if low in LABEL_FROM + LABEL_TO or any(lb in low for lb in STOP_LABELS[len(LABEL_FROM + LABEL_TO):]):
                    break
                if _is_noise(nxt):
                    continue
                b = detect_bank(nxt)
                if b:
                    bank = bank or b
                elif name is None:
                    name = nxt.strip()
                elif nxt.strip().startswith("(") and bank is None:   # ชื่อต่อบรรทัดที่สอง เช่น "(เยือน หฤทัยถาวร)"
                    name += " " + nxt.strip()
            return name, bank
    return None, None


def detect_bank(s: str) -> str | None:
    low = s.lower()
    for keys, name in BANKS:
        if any(k in low for k in keys):
            return name
    return None


def detect_app(lines) -> str | None:
    """ธนาคาร/แอปที่ออกสลิป: ดูจากโลโก้/หัวสลิป หรือธนาคารผู้โอน"""
    for ln in lines[:4] + lines[-4:]:
        b = detect_bank(ln)
        if b and b != "พร้อมเพย์":
            return b
    return None


def parse_slip_text(lines: list[str]) -> dict:
    from_name, from_bank = find_party(lines, LABEL_FROM)
    to_name, to_bank = find_party(lines, LABEL_TO)
    joined = " ".join(lines)
    return {
        "app": detect_app(lines) or from_bank,
        "kind": "เติมเงิน" if "เติมเงิน" in joined else "โอนเงิน",
        "amount": find_amount(lines),
        "fee": find_fee(lines),
        "datetime": find_datetime(lines),
        "ref": find_ref(lines),
        "from_name": from_name, "from_bank": from_bank,
        "to_name": to_name, "to_bank": to_bank,
        "memo": find_memo(lines),
    }


# ---------------------------------------------------------------- แปลงเป็นรายการ (เหมือน U bot)
def _similar(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    norm = lambda s: re.sub(r"(นาย|นางสาว|นาง|น\.ส\.|\s|\*|x)", "", s.lower())
    a, b = norm(a), norm(b)
    return bool(a and b) and (a in b or b in a or SequenceMatcher(None, a, b).ratio() >= 0.75)


def categorize(text: str) -> str:
    """ให้ LLM เลือกหมวดจากบันทึกช่วยจำ/ผู้รับ; ใช้ไม่ได้ -> 'อื่นๆ'"""
    if not text:
        return "อื่นๆ"
    try:
        system = (f"เลือกหมวดรายจ่าย/รายรับที่ตรงที่สุดหนึ่งหมวดจาก {llm_parser.CATEGORIES} "
                  "ตอบเป็นชื่อหมวดอย่างเดียว ห้ามมีข้อความอื่น")
        ans = llm_parser._call_llm(text, system).strip()
        return next((c for c in llm_parser.CATEGORIES if c in ans), "อื่นๆ")
    except Exception:
        return "อื่นๆ"


def slip_to_item(slip: dict, owner: str | None) -> dict:
    # ทิศทาง: เจ้าของเป็นผู้รับ = รายรับ, นอกนั้น = รายจ่าย
    is_income = _similar(owner, slip["to_name"]) and not _similar(owner, slip["from_name"])
    counterpart = slip["from_name"] if is_income else slip["to_name"]
    merchant = slip["memo"] or counterpart or f"{slip['kind']}{(' ' + slip['to_bank']) if slip['to_bank'] else ''}"
    amt = slip["amount"]

    reasons = []
    if amt is None:
        reasons.append("อ่านจำนวนเงินไม่ได้")
    elif amt > llm_parser.REVIEW_ABOVE:
        reasons.append(f"ยอดสูงกว่า {llm_parser.REVIEW_ABOVE:,.0f} บาท")
    if slip["datetime"] is None:
        reasons.append("อ่านวันที่ไม่ได้ (ใช้เวลาปัจจุบันแทน)")
    if not slip["ref"]:
        reasons.append("ไม่พบรหัสอ้างอิง (เช็กสลิปซ้ำไม่ได้)")

    when = slip["datetime"] or datetime.now()
    return {
        "type": "income" if is_income else "expense",
        "amount": amt,
        "merchant": merchant,
        "category": categorize(" ".join(filter(None, [slip["memo"], counterpart]))),
        "needs_review": bool(reasons),
        "review_reason": ", ".join(reasons) or None,
        "recorded_at": when.isoformat(timespec="seconds"),
        "recorded_at_text": f"{when:{DT_FMT}}",
        "source": "slip",
    }


def slip_summary_line(slip: dict) -> str:
    dt = f"{slip['datetime']:{DT_FMT}}" if slip["datetime"] else "?"
    amt = f"{slip['amount']:,.2f}" if slip["amount"] is not None else "?"
    route = f"{slip['from_name'] or '?'} ({slip['from_bank'] or '?'}) → {slip['to_name'] or '?'} ({slip['to_bank'] or '?'})"
    memo = f" | บันทึก: {slip['memo']}" if slip["memo"] else ""
    return f"{slip['app'] or '?'} | {slip['kind']} {amt} บาท | {dt} | ref {slip['ref'] or '?'}\n      {route}{memo}"


# ---------------------------------------------------------------- main
def collect_images(args_paths: list[str]) -> list[Path]:
    paths = [Path(p) for p in args_paths] or [ROOT / "slips"]
    files = []
    for p in paths:
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in IMAGE_EXT)
        elif p.suffix.lower() in IMAGE_EXT and p.exists():
            files.append(p)
        else:
            print(f"[ข้าม] ไม่พบไฟล์รูป: {p}")
    return files


def main():
    ap = argparse.ArgumentParser(description="อ่านสลิปโอนเงิน -> รายการรายรับ/รายจ่าย")
    ap.add_argument("paths", nargs="*", help="ไฟล์รูปหรือโฟลเดอร์ (ดีฟอลต์: slips/)")
    ap.add_argument("--show-ocr", action="store_true", help="แสดงข้อความดิบจาก OCR")
    args = ap.parse_args()

    files = collect_images(args.paths)
    if not files:
        (ROOT / "slips").mkdir(exist_ok=True)
        print(f"ไม่พบรูปสลิป — เอารูปไปใส่ในโฟลเดอร์ {ROOT / 'slips'} แล้วรันใหม่")
        return

    owner = os.getenv("OWNER_NAME")
    print(f"สลิป {len(files)} รูป | เจ้าของบัญชี: {owner or '(ไม่ได้ตั้ง OWNER_NAME -> ถือเป็นรายจ่ายทั้งหมด)'}")
    logdir = ROOT / "slip_logs"
    logdir.mkdir(exist_ok=True)
    started = datetime.now()
    stamp = f"{started:%Y%m%d_%H%M%S}"
    jsonl = open(logdir / f"slips_{stamp}.jsonl", "w", encoding="utf-8")
    txtfile = logdir / f"slips_{stamp}.txt"
    txt = open(txtfile, "w", encoding="utf-8")
    txt.write(f"บันทึกรายรับ-รายจ่ายจากสลิป — {started:{DT_FMT}}\n{'=' * 50}\n\n")

    items, seen, dups = [], {}, []
    for f in files:
        print(f"\n📄 {f.name}")
        lines = ocr_lines(f)
        if args.show_ocr:
            print("   OCR: " + " | ".join(lines))
        slip = parse_slip_text(lines)
        print("   " + slip_summary_line(slip))

        if slip["ref"] and slip["ref"] in seen:                 # กันสลิปซ้ำ
            print(f"   ⏭  สลิปซ้ำกับ {seen[slip['ref']]} — ไม่นับซ้ำ")
            dups.append((f.name, seen[slip["ref"]]))
            txt.write(f"[ซ้ำ] {f.name} = {seen[slip['ref']]}\n\n")
            continue
        if slip["ref"]:
            seen[slip["ref"]] = f.name

        item = slip_to_item(slip, owner)
        items.append(item)
        for ln in format_items({"items": [item]}):
            print(f"   └─ {ln}")
        txt.write(f"[{item['recorded_at_text']}] {f.name}\n    {slip_summary_line(slip)}\n"
                  + "".join(f"    {ln}\n" for ln in format_items({"items": [item]})) + "\n")
        jsonl.write(json.dumps({"file": f.name, "ocr": lines,
                                "slip": {**slip, "datetime": slip["datetime"].isoformat() if slip["datetime"] else None},
                                "item": item}, ensure_ascii=False) + "\n")

    items.sort(key=lambda i: i["recorded_at"])                  # เรียงตามเวลาในสลิป
    summary = build_summary(items, title="สรุปสลิป")
    if dups:
        summary += f"\n\n=== สลิปซ้ำที่ข้ามไป ({len(dups)}) ===\n" + "\n".join(f"  - {a} = {b}" for a, b in dups)
    txt.write(f"{'=' * 50}\n{summary}\n")
    txt.close()
    jsonl.close()
    print(f"\n{summary}\n\n  ไฟล์อ่านง่าย: {txtfile}")


if __name__ == "__main__":
    main()
