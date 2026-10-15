const R = require('./rules.js');
const E = require('./engine.js');
let ok = 0, bad = 0;
const owners = ['สมชาย ใจดี', 'SOMCHAI JAIDEE'];
function check(name, ctx, cat, source) {
  const r = R.classify(Object.assign({ owners }, ctx));
  const pass = r.cat === cat && (!source || r.source === source);
  if (pass) ok++; else { bad++; console.log('ไม่ผ่าน', name, '→ ได้', r.cat, r.source, r.label, '| ต้องการ', cat, source || ''); }
}

// 1. ทิศทางเงิน
check('โอนระหว่างบัญชีตัวเอง', { sender: 'นาย สมชาย ใจดี', shop: 'นาย สมชาย ใ' }, 'transfer', 'owner');
check('ชื่ออังกฤษถูกปิดบางส่วน', { sender: 'MR. SOMCHAI J', shop: 'นาย สมชาย ใจดี' }, 'transfer', 'owner');
check('มีคนโอนเข้า', { sender: 'น.ส. มะลิ ดีงาม', shop: 'นาย สมชาย ใจดี', memo: 'ค่าข้าว' }, 'income', 'owner');
check('ชื่อคล้ายแต่ไม่ใช่', { sender: 'นาย สมชาย ใจดี', shop: 'นาย สมชาติ ดีใจ' }, 'other', 'person');

// 2-3. บันทึกช่วยจำ
check('ระบุหมวดตรงๆ', { shop: 'Shopee', memo: 'ค่ากิน' }, 'food', 'memo');
check('แฮชแท็ก', { shop: 'นาย เอ บี', memo: 'ซื้อของ #เดินทาง' }, 'travel', 'memo');
check('บันทึกชนะความจำร้าน', { shop: 'น.ส. มะลิ ดีงาม', memo: 'ค่าแท็กซี่', memory: { cat: 'food' } }, 'travel', 'memo');
check('บันทึกออม โอนเข้าบัญชีตัวเอง', { shop: 'นาย สมชาย ใจดี KBank', memo: 'เก็บเงิน' }, 'transfer', 'owner');
check('บันทึกออม ให้คนอื่น', { shop: 'บลจ. กสิกรไทย', memo: 'ซื้อกองทุน' }, 'transfer', 'memo');
check('บันทึกให้ยืม', { shop: 'นาย เอก ดี', memo: 'ให้ยืม' }, 'transfer', 'memo');
check('ค่าขนมลูกไม่ใช่ค่ากิน', { shop: 'ด.ช. ต้น ดี', memo: 'ค่าขนมลูก' }, 'other', 'memo');
check('ค่าน้ำมันไม่ใช่ค่าน้ำ', { shop: 'นาย ก ข', memo: 'ค่าน้ำมัน' }, 'travel', 'memo');
check('ค่าน้ำ', { shop: 'นาย ก ข', memo: 'ค่าน้ำ ต.ค.' }, 'fixed', 'memo');
check('ค่ารถไฟไม่ใช่ค่าไฟ', { shop: 'นาย ก ข', memo: 'ค่ารถไฟ' }, 'travel', 'memo');
check('ค่าไฟ', { shop: 'นาย ก ข', memo: 'ค่าไฟเดือนนี้' }, 'fixed', 'memo');

// 4. ความจำร้าน
check('ความจำร้าน', { shop: 'ร้านป้าแดง', memory: { cat: 'food' } }, 'food', 'memory');

// 5. ชื่อร้าน
const shops = [
  ['Amazon Café สาขาอารีย์', 'coffee'], ['STARBUCKS', 'coffee'], ['ชาตรามือ สยาม', 'coffee'], ['Black Canyon', 'coffee'],
  ['GRABFOOD', 'food'], ['LINE MAN', 'food'], ['GRAB', 'travel'], ['Bolt', 'travel'],
  ['7-ELEVEN สาขา 1234', 'food'], ['บิ๊กซี', 'food'], ['ร้านป้าแดง ตามสั่ง', 'food'], ['MK RESTAURANT', 'food'], ['สุกี้ตี๋น้อย', 'food'],
  ['PTT STATION', 'travel'], ['บางจาก', 'travel'], ['BTS', 'travel'], ['การทางพิเศษแห่งประเทศไทย', 'travel'], ['AIRASIA', 'travel'],
  ['การไฟฟ้านครหลวง', 'fixed'], ['การประปาส่วนภูมิภาค', 'fixed'], ['AIS', 'fixed'], ['TRUE MOVE H', 'fixed'], ['3BB', 'fixed'],
  ['KTC', 'fixed'], ['บัตรเครดิต กรุงศรี', 'fixed'], ['NETFLIX.COM', 'fixed'], ['เมืองไทยประกันชีวิต', 'fixed'], ['หอพักสุขใจ', 'fixed'],
  ['TRUEMONEY', 'transfer'], ['SHOPEEPAY', 'shop'], ['LAZADA', 'shop'], ['UNIQLO', 'shop'], ['HOMEPRO', 'shop'], ['WATSONS', 'shop'],
  ['โรงพยาบาลกรุงเทพ', 'other'], ['MAJOR CINEPLEX', 'other'], ['KERRY EXPRESS', 'other'], ['บจก. 123 เซอร์วิส', 'other'],
];
shops.forEach(([s, c]) => check('ร้าน ' + s, { shop: s }, c));

// 6-7. บุคคล / ไม่รู้จัก
check('บุคคลมีคำนำหน้า ชื่อชนคำหลัก', { shop: 'น.ส. ข้าวหอม มะลิ' }, 'other', 'person');
check('บุคคลไม่มีคำนำหน้า', { shop: 'สมหญิง ใจงาม' }, 'other', 'person');
check('ไม่รู้จัก', { shop: 'XYZ123' }, 'other', 'none');

// ป้องกันจับผิด
check('current ไม่ใช่ rent', { shop: 'CURRENT CO LTD' }, 'other');
check('items ไม่ใช่ ems', { shop: 'ITEMS PLUS CO.' }, 'other');

// การอ่านสลิป: ผู้ส่ง ผู้รับ และทิศทาง
const slip = `โอนเงินสำเร็จ\n16 ต.ค. 69 19:05 น.\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nจำนวน: 500.00 บาท\nบันทึกช่วยจำ: คืนค่าข้าว`;
const p = E.parseSlip(slip);
if (p.sender === 'น.ส. มะลิ ดีงาม' && p.shop === 'นาย สมชาย ใจดี') ok++; else { bad++; console.log('ไม่ผ่าน แยกผู้ส่ง/ผู้รับ', p.sender, '|', p.shop); }
check('สลิปเพื่อนโอนคืน', { sender: p.sender, shop: p.shop, memo: p.memo }, 'income', 'owner');
const q = E.parseSlip(`ชำระเงินสำเร็จ\nจาก\nนาย สมชาย ใจดี\nไปยัง\nการไฟฟ้านครหลวง\nจำนวน 845.00 บาท`);
if (q.sender === 'นาย สมชาย ใจดี' && q.shop === 'การไฟฟ้านครหลวง') ok++; else { bad++; console.log('ไม่ผ่าน จาก/ไปยัง', q.sender, '|', q.shop); }

// รายรับและการโอนไม่หักงบรายวัน
const s = { incomeNormal: 20000, mode: 'normal', reserve: 2000, days: 30, fixed: [{ amount: 8000 }], debt: {}, cats: [{ id: 'food', weight: 1, cap: .5 }] };
const r = E.replay(s, { txns: [{ day: 0, amount: 500, cat: 'income' }, { day: 0, amount: 1000, cat: 'transfer' }] }, 0);
if (r.today.U === 0) ok++; else { bad++; console.log('ไม่ผ่าน รายรับ/โอนถูกหักงบ'); }

console.log(`\nกฎจัดหมวด: ผ่าน ${ok} ไม่ผ่าน ${bad} · มีกฎ ${R.RULES.length} กลุ่ม ${R.RULES.reduce((a, x) => a + x.terms.length, 0)} คำ`);
process.exit(bad ? 1 : 0);
