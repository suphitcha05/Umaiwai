const E = require('./engine.js');
const assert = require('assert');
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('ผ่าน', name); };

const base = () => ({
  incomeNormal: 20000, incomeMin: 15000, mode: 'normal', reserve: 2000, days: 30, leftoverMode: 'bucket',
  fixed: [{ name: 'ค่าห้อง', amount: 5500 }, { name: 'ไฟ-น้ำ', amount: 1200 }, { name: 'มือถือ', amount: 800 }, { name: 'ประกันสังคม', amount: 500 }],
  debt: { balance: 0, minPay: 0, apr: 16 },
  cats: [
    { id: 'shop', weight: 83, cap: 1 }, { id: 'coffee', weight: 50, cap: 0.5 },
    { id: 'travel', weight: 0, cap: 0 }, { id: 'other', weight: 0, cap: 0 }, { id: 'food', weight: 200, cap: 0.5 }],
});
const sumA = a => a.reduce((x, y) => x + y, 0);
const all = [];

t('T1 งบวันแรก', () => {
  const r = E.replay(base(), { txns: [] }, 0); all.push(r);
  assert.strictEqual(r.M, 10000); assert.strictEqual(r.today.B, 333); assert.strictEqual(r.today.T, 333);
  assert.deepStrictEqual(r.today.cb, [83, 50, 0, 0, 200]);
});
t('T2 ใช้เกิน', () => {
  const r = E.replay(base(), { txns: [{ day: 0, amount: 433, cat: 'food' }] }, 1); all.push(r);
  assert.strictEqual(r.today.Dstart, 100); assert.deepStrictEqual(r.today.red, [83, 17, 0, 0, 0]);
  assert.strictEqual(r.today.T, 233); assert.deepStrictEqual(r.today.catT, [0, 33, 0, 0, 200]);
});
t('T3 ใช้เหลือ', () => {
  const r = E.replay(base(), { txns: [{ day: 0, amount: 233, cat: 'food' }] }, 1); all.push(r);
  assert.strictEqual(r.bucket, 100); assert.strictEqual(r.today.T, 333);
});
t('T4 รายได้เปลี่ยนกลางเดือน', () => {
  const txns = []; for (let d = 0; d < 9; d++) txns.push({ day: d, amount: 333, cat: 'food' });
  const r = E.replay(base(), { txns, incomes: [{ day: 9, amount: 17000 }] }, 9); all.push(r);
  assert.strictEqual(r.M, 7000); assert.strictEqual(r.today.B, 190); assert.strictEqual(r.D, 0); assert.strictEqual(r.daysLeft, 21);
});
t('T12 ขั้นต่ำบัตร 1,500', () => {
  const s = base(); s.debt.minPay = 1500;
  const r = E.replay(s, { txns: [] }, 0); all.push(r);
  assert.strictEqual(r.M, 8500); assert.strictEqual(r.today.B, 283); assert.deepStrictEqual(r.today.cb, [70, 42, 0, 0, 171]);
});
t('ค่าคงที่ไม่หักงบรายวัน (กติกา 6)', () => {
  const r = E.replay(base(), { txns: [{ day: 0, amount: 5500, cat: 'fixed' }] }, 1);
  assert.strictEqual(r.today.T, 333); assert.strictEqual(r.bucket, 333);
});
t('ลดสุดเพดานแล้วยังค้าง + ปิดด้วยถังสำรอง (กติกา 4)', () => {
  const tx = [{ day: 0, amount: 133, cat: 'food' }, { day: 1, amount: 833, cat: 'shop' }];
  const r = E.replay(base(), { txns: tx }, 2); all.push(r);
  assert.ok(r.today.short > 0);
  const r2 = E.replay(base(), { txns: tx, covers: [{ day: 2 }] }, 2); all.push(r2);
  assert.ok(r2.today.short < r.today.short);
});
t('T8 ผลรวมหมวด = T เสมอ', () => {
  all.forEach(r => r.hist.forEach(h => assert.strictEqual(sumA(h.catT), h.T)));
});
t('ดอกเบี้ยต่อเดือน', () => {
  const s = base(); s.debt.balance = 30000; assert.strictEqual(E.monthlyInterest(s), 400);
});

const slipK = `โอนเงินสำเร็จ
15 ต.ค. 69 12:31 น.
นาย สมชาย ใจดี
ธ.กสิกรไทย
xxx-x-x1234-x
ร้านป้าแดง ตามสั่ง
ธ.กรุงไทย
xxx-x-x5678-x
เลขที่รายการ: 015288123456
จำนวน: 60.00 บาท
ค่าธรรมเนียม: 0.00 บาท`;
t('อ่านสลิปแบบโอน', () => {
  const p = E.parseSlip(slipK);
  assert.strictEqual(p.amount, 60); assert.strictEqual(p.shop, 'ร้านป้าแดง ตามสั่ง'); assert.strictEqual(p.date, '2026-10-15');
});
t('อ่านสลิปมีคำว่าไปยัง + ตัวไทยมีช่องว่างจาก OCR', () => {
  const p = E.parseSlip(`ช ำ ร ะ เ งิ น สำเร็จ\n16/10/2569 08:02\nไปยัง\nAmazon Café สาขา อารีย์\nPromptPay\nจ ำ น ว น เ งิ น\n1,065.00\nบาท`);
  assert.strictEqual(p.amount, 1065); assert.strictEqual(p.shop, 'Amazon Café สาขา อารีย์'); assert.strictEqual(p.date, '2026-10-16');
});
t('จัดหมวดด้วยคำหลัก', () => {
  assert.strictEqual(E.guessCat('Amazon Café'), 'coffee');
  assert.strictEqual(E.guessCat('ป้าแดง ตามสั่ง'), 'food');
  assert.strictEqual(E.guessCat('KTC บัตรเครดิต'), 'fixed');
  assert.strictEqual(E.guessCat('นายเอ'), 'other');
});

t('ร้านนิติบุคคลแบบโอน: ชื่อมีตัวเลข', () => {
  const p = E.parseSlip(`โอนเงินสำเร็จ\n16 ต.ค. 69 09:10 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nบจก. 123 เซอร์วิส\nธ.ไทยพาณิชย์\nxxx-x-x9876-x\nจำนวน: 1,500.00 บาท`);
  assert.strictEqual(p.shop, 'บจก. 123 เซอร์วิส'); assert.strictEqual(p.amount, 1500); assert.strictEqual(p.acct, '9876');
  assert.ok(p.candidates.includes('นาย สมชาย ใจดี'));
});
t('ร้านแบบมีรหัสร้านค้า', () => {
  const p = E.parseSlip(`ชำระเงินสำเร็จ\n16 ต.ค. 69 09:10\n123 เซอร์วิส\nรหัสร้านค้า 010556012345\nจำนวน 250.00 บาท`);
  assert.strictEqual(p.shop, '123 เซอร์วิส'); assert.strictEqual(p.amount, 250);
});
t('ชื่อเดียวกัน คีย์เดียวกัน', () => {
  assert.strictEqual(E.shopKey('บจก. 123 เซอร์วิส'), E.shopKey('บริษัท 123 เซอร์วิส จำกัด'));
});

t('บันทึกช่วยจำ → หมวด', () => {
  const p = E.parseSlip(`โอนเงินสำเร็จ\n16 ต.ค. 69 19:05 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nจำนวน: 120.00 บาท\nบันทึกช่วยจำ: ค่าข้าวเย็น`);
  assert.strictEqual(p.shop, 'น.ส. มะลิ ดีงาม'); assert.strictEqual(p.memo, 'ค่าข้าวเย็น'); assert.strictEqual(E.guessCat(p.memo), 'food');
  const q = E.parseSlip(`ชำระเงินสำเร็จ\nไปยัง SHOPEEPAY\nจำนวน 349.00 บาท\nMemo\nกาแฟเพื่อนร่วมงาน`);
  assert.strictEqual(q.memo, 'กาแฟเพื่อนร่วมงาน'); assert.strictEqual(E.guessCat(q.memo), 'coffee');
});

t('จำร้านเมื่อเลขบัญชีเปลี่ยน / ชื่อเพี้ยน / บัญชีตัวกลาง', () => {
  const shops = { [E.shopKey('123 เซอร์วิส')]: { cat: 'other' }, [E.shopKey('ร้านป้าแดง')]: { cat: 'food' } };
  const aliases = { 'acct:1111': E.shopKey('123 เซอร์วิส'), [E.shopKey('l23 เซอรวิส')]: E.shopKey('123 เซอร์วิส') };
  assert.deepStrictEqual(E.findShop(shops, aliases, '123 เซอร์วิส', '2222'), { key: E.shopKey('123 เซอร์วิส'), via: '' });
  assert.deepStrictEqual(E.findShop(shops, aliases, 'l23 เซอรวิส', '3333'), { key: E.shopKey('123 เซอร์วิส'), via: 'alias' });
  // ชื่ออ่านได้แต่ไม่รู้จัก → ร้านใหม่ เลขบัญชีเป็นแค่ข้อเสนอ
  assert.deepStrictEqual(E.findShop(shops, aliases, 'ร้านใหม่เอี่ยม', '1111'), { key: E.shopKey('ร้านใหม่เอี่ยม'), via: '', suggest: E.shopKey('123 เซอร์วิส') });
  // อ่านชื่อไม่ได้ → ใช้เลขบัญชี
  assert.deepStrictEqual(E.findShop(shops, aliases, '', '1111'), { key: E.shopKey('123 เซอร์วิส'), via: 'acct' });
  assert.deepStrictEqual(E.findShop(shops, aliases, 'ร้านป้าแดง', '1111'), { key: E.shopKey('ร้านป้าแดง'), via: '' });
});

t('เลขบัญชีต้องเป็นของผู้รับ ไม่ใช่ของผู้ส่ง', () => {
  const pp = E.parseSlip(`โอนเงินสำเร็จ\n16 ต.ค. 69 10:00\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nไปยัง\nร้านก๋วยเตี๋ยวเรือ\nพร้อมเพย์\nจำนวน 80.00 บาท`);
  assert.strictEqual(pp.shop, 'ร้านก๋วยเตี๋ยวเรือ'); assert.strictEqual(pp.acct, '');
  const kk = E.parseSlip(`โอนเงินสำเร็จ\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nร้านป้าแดง ตามสั่ง\nธ.กรุงไทย\nxxx-x-x5678-x\nจำนวน: 60.00 บาท`);
  assert.strictEqual(kk.acct, '5678');
});
t('ทางลัดที่ชี้หลายร้านถูกเลิกใช้', () => {
  const al = {};
  E.learnAlias(al, 'acct:9999', 'a'); E.learnAlias(al, 'acct:9999', 'a'); assert.strictEqual(al['acct:9999'], 'a');
  E.learnAlias(al, 'acct:9999', 'b'); assert.strictEqual(al['acct:9999'], undefined);
  E.learnAlias(al, 'acct:9999', 'a'); assert.strictEqual(al['acct:9999'], undefined);
});
console.log(`\nผ่านทั้งหมด ${ok} ข้อ`);
