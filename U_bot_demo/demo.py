"""
ตัวอย่างการใช้ UBotClient ในบ้านรอด AI
=====================================
รันหลังจากเปิด mock server แล้ว (ดู README):
    python demo.py
"""
from ubot_client import UBotClient


def summarize_debt(cards: list) -> None:
    total = sum(c["outstanding_balance"] for c in cards)
    total_min = sum(c["min_payment"] for c in cards)
    print(f"\n=== สรุปหนี้บัตรเครดิต ===")
    for c in cards:
        print(f"  {c['name']}: คงค้าง {c['outstanding_balance']:,.0f} บาท "
              f"| ขั้นต่ำ {c['min_payment']:,.0f} | ครบกำหนด {c['due_date']} "
              f"| ดอกเบี้ย {c['interest_rate_apr']*100:.0f}%/ปี")
    print(f"  รวมหนี้ทั้งหมด: {total:,.0f} บาท | ขั้นต่ำรวมเดือนนี้: {total_min:,.0f} บาท")


def summarize_income(txns: list) -> None:
    income = sum(t["amount"] for t in txns if t["type"] == "income")
    expense = -sum(t["amount"] for t in txns if t["type"] == "expense")
    print(f"\n=== กระแสเงินเดือนนี้ ===")
    print(f"  รายรับ: {income:,.0f} บาท | รายจ่าย: {expense:,.0f} บาท | คงเหลือสุทธิ: {income-expense:,.0f} บาท")


def main():
    client = UBotClient()  # mock โดยดีฟอลต์; ตั้ง env UBOT_BASE_URL เพื่อสลับไปของจริง

    accounts = client.get_accounts()
    acc = accounts[0]
    print(f"บัญชี: {acc['name']} | ยอด {acc['balance']:,.2f} {acc['currency']}")

    summarize_income(client.get_transactions(acc["account_id"]))
    summarize_debt(client.get_credit_cards())

    print("\n=== ถามบอท ===")
    print(" ", client.ask("เดือนนี้ควรโปะบัตรใบไหนก่อน?"))

    print("\n=== แปลงข้อความเสียงเป็นรายการ ===")
    res = client.parse_utterance("กินข้าวร้านป้าแมว 60 บาท, ค่าวินมอเตอร์ไซค์ 30")
    print(f"  แหล่ง: {res['source']}")
    for it in res["items"]:
        flag = " (ต้องตรวจ)" if it["needs_review"] else ""
        print(f"  {it['type']} {it['amount']} | {it['merchant']} | {it['category']}{flag}")


if __name__ == "__main__":
    main()
