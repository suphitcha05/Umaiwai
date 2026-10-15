"""
text_cleaner.py — ทำข้อความจากเสียง (ElevenLabs) ให้คนอ่านง่าย ก่อนส่งเข้า LLM
============================================================================
สิ่งที่ทำ:
  1. ตัดคำเติม/คำอุทาน ที่ยืนเป็นคำเดี่ยว เช่น อ่า เอ่อ อืม อุ๊ย
  2. แปลงตัวเลขคำไทยเป็นตัวเลข เช่น "ห้าสิบห้าบาท" -> "55 บาท", "แปดหมื่น" -> "80,000"
     (กันคำที่มีเลขซ่อนอยู่ เช่น เก้าอี้ ห้าง ยี่ห้อ สามารถ เรียบร้อย สองแถว ไม่ให้ถูกแปลง)
  3. จัดช่องว่างให้เรียบร้อย

ใช้:  from text_cleaner import clean_text
      clean_text("อ่า ช็อกโกแลตห้าสิบห้าบาท")  ->  "ช็อกโกแลต 55 บาท"
ทดสอบ: python text_cleaner.py
"""
import re

# ---------- 1. คำเติม (ตัดเฉพาะเมื่อยืนเป็นคำเดี่ยวระหว่างช่องว่าง) ----------
FILLERS = {"อ่า", "อ่ะ", "อ่าา", "เอ่อ", "เออ", "อืม", "อืมม", "อ๋อ", "เอิ่ม", "อุ๊ย", "แบบ", "แบบว่า", "คือว่า"}

# ---------- 2. ตัวเลขคำไทย ----------
DIGITS = {"ศูนย์": 0, "หนึ่ง": 1, "เอ็ด": 1, "สอง": 2, "ยี่": 2, "สาม": 3, "สี่": 4,
          "ห้า": 5, "หก": 6, "เจ็ด": 7, "แปด": 8, "เก้า": 9}
UNITS = {"สิบ": 10, "ร้อย": 100, "พัน": 1_000, "หมื่น": 10_000, "แสน": 100_000}
MILLION = "ล้าน"
_WORDS = sorted(list(DIGITS) + list(UNITS) + [MILLION], key=len, reverse=True)
_RUN = re.compile("(?:" + "|".join(_WORDS) + ")+")
_TOKEN = re.compile("|".join(_WORDS))

# คำที่มีพยางค์ตัวเลขซ่อนอยู่ ห้ามแปลง (เพิ่มได้)
PROTECTED = ["เก้าอี้", "ห้าง", "ยี่ห้อ", "ยี่สุ่น", "สามี", "สามารถ", "สามเณร", "เรียบร้อย", "ร้อยเอ็ด",
             "พันธุ์", "พันธ", "พันธมิตร", "แสนดี", "แสนสิริ", "หกล้ม", "ล้านนา", "สองแถว", "สิบล้อ",
             "เจ็ดเซเว่น", "สี่แยก", "ห้าแยก", "สามแยก", "สามย่าน", "หมื่นลี้", "เอ็ดตะโร",
             "สองสาม", "สามสี่", "สี่ห้า", "ห้าหก"]   # "สองสามวัน" = ประมาณ ไม่ใช่ตัวเลข
_PROTECT_RE = re.compile("|".join(sorted(map(re.escape, PROTECTED), key=len, reverse=True)))
_THAI_MARK_AFTER = re.compile(r"^[ะ-ฺๅ็-๎]")  # สระ/วรรณยุกต์ตามหลัง = ยังไม่จบคำ


def thai_words_to_int(run: str) -> int | None:
    total, current, digit = 0, 0, None
    for tok in _TOKEN.findall(run):
        if tok in DIGITS:
            if digit is not None:          # เลขสองตัวติดกันแบบ "สองสาม" = ไม่ใช่ตัวเลขเดียว
                return None
            digit = DIGITS[tok]
        elif tok in UNITS:
            current += (1 if digit is None else digit) * UNITS[tok]
            digit = None
        else:  # ล้าน
            total = (total + current + (digit or 0) or 1) * 1_000_000
            current, digit = 0, None
    return total + current + (digit or 0)


def _fmt(n: int) -> str:
    return f"{n:,}"


def convert_numbers(text: str) -> str:
    # ซ่อนคำที่ห้ามแปลงไว้ก่อน
    saved: list[str] = []

    def hide(m):
        saved.append(m.group(0))
        return f"\x00{len(saved)-1}\x00"

    text = _PROTECT_RE.sub(hide, text)

    def repl(m):
        run = m.group(0)
        after = text[m.end():]
        if _THAI_MARK_AFTER.match(after):            # เช่น "สาม|ารถ" ยังไม่จบคำ
            return run
        has_digit_word = any(t in DIGITS or t == "สิบ" for t in _TOKEN.findall(run))
        if not has_digit_word and not re.match(r"\s*บาท", after):   # "ร้อย" ลอยๆ แปลงเฉพาะ "ร้อยบาท"
            return run
        n = thai_words_to_int(run)
        return run if n is None else f" {_fmt(n)} "

    text = _RUN.sub(repl, text)
    return re.sub(r"\x00(\d+)\x00", lambda m: saved[int(m.group(1))], text)


def remove_fillers(text: str) -> str:
    return " ".join(w for w in text.split() if w not in FILLERS)


def clean_text(text: str) -> str:
    t = remove_fillers(text)
    t = convert_numbers(t)
    t = re.sub(r"(\d)\s+บาท", r"\1 บาท", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


if __name__ == "__main__":
    tests = [
        "ช็อกโกแลต ห้าสิบห้าบาท ช็อกโกแลตดูไบ สองร้อย",
        "โทรศัพท์ สองร้อย หอ อุ๊ย ถูกจัง อุ๊ย ไอโฟนดูโอ้แปดหมื่น ไอโฟนกูปริหนึ่งพัน",
        "ข้าวเหนียวพริก หนึ่งบาท ถูกจังนะ คอร์ทโปร เจ็ดร้อย อ่า น้ำดื่มคริสตัล เจ็ดบาท",
        "ทิชชู่สองกล่อง กล่องละสามสิบห้าบาท น้ำเจ็ดบาท อ่า ยาดมหงส์ไทยยี่สิบเก้าบาท อืม เบียร์สิงห์ห้าสิบเก้าบาท",
        "หมาล่าหนึ่งร้อยหกสิบเก้า ค่าสองแถวสิบบาท ซื้อเก้าอี้ที่ห้างสองพันห้าร้อย",
        "ได้รับค่าจ้างสามหมื่นสองพัน เรียบร้อยแล้ว สามารถจ่ายได้ ค่าเช่าห้าพันห้าร้อยบาท",
        "ร้อยบาท สองล้านห้าแสน สิบเอ็ด ยี่สิบเอ็ด สองสามวัน",
    ]
    for s in tests:
        print(f"ดิบ    : {s}\nอ่านง่าย: {clean_text(s)}\n")
