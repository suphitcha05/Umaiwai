"""
report.py — จัดรูปแบบผลลัพธ์ (ใช้ร่วมกันระหว่าง voice_pipeline.py และ slip_reader.py)
"""
from datetime import datetime

DT_FMT = "%d/%m/%Y %H:%M:%S"           # รูปแบบวันที่-เวลาที่แสดงให้คนอ่าน


def amount_text(n: float) -> str:
    return f"{n:,.0f}" if float(n).is_integer() else f"{n:,.2f}"


def format_items(res: dict) -> list[str]:
    """แปลงผล {"items": [...]} เป็นบรรทัดข้อความอ่านง่าย"""
    items = res.get("items") or []
    if not items:
        return ["(ไม่พบรายการเงิน)"]
    lines = []
    for it in items:
        amt = f"{it['amount']:,.2f}" if it.get("amount") is not None else "?"
        sign = "+" if it.get("type") == "income" else "-"
        flag = f"  ⚠ ต้องตรวจ: {it.get('review_reason') or ''}" if it.get("needs_review") else ""
        lines.append(f"{sign} {amt:>10} บาท | {it.get('merchant','')} | {it.get('category','')}{flag}")
    return lines


def build_summary(items: list[dict], started: datetime | None = None, ended: datetime | None = None,
                  title: str = "สรุปเซสชัน") -> str:
    """สรุป: 1) ยอดรวม 2) รายการรายรับ 3) รายการรายจ่าย (บรรทัดละรายการ พร้อมวันที่-เวลา)"""
    items = [i for i in items if i.get("amount") is not None]
    incomes = [i for i in items if i["type"] == "income"]
    expenses = [i for i in items if i["type"] == "expense"]
    inc = sum(i["amount"] for i in incomes)
    exp = sum(i["amount"] for i in expenses)
    review = sum(1 for i in items if i.get("needs_review"))

    def listing(rows):
        if not rows:
            return ["  (ไม่มี)"]
        return [f"  - [{i.get('recorded_at_text', '')}] {i.get('merchant') or 'ไม่ระบุ'} {amount_text(i['amount'])} บาท"
                + ("  ⚠" if i.get("needs_review") else "") for i in rows]

    out = [
        f"=== {title} ===",
        *([f"  เริ่ม : {started:{DT_FMT}}", f"  จบ   : {ended:{DT_FMT}}"] if started and ended else []),
        f"  รายการทั้งหมด: {len(items)} (ต้องตรวจ ⚠ {review})",
        f"  รายรับรวม : {amount_text(inc)} บาท",
        f"  รายจ่ายรวม: {amount_text(exp)} บาท",
        f"  คงเหลือสุทธิ: {amount_text(inc - exp)} บาท",
        "",
        f"=== รายการรายรับ ({len(incomes)}) ===",
        *listing(incomes),
        "",
        f"=== รายการรายจ่าย ({len(expenses)}) ===",
        *listing(expenses),
    ]
    return "\n".join(out)
