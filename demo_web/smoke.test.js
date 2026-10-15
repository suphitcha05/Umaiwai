// ทดสอบกดตามเดโมแบบไม่เปิดเบราว์เซอร์ ต้องติดตั้งก่อน: npm i jsdom
// รัน: python3 build.py && node smoke.test.js
const { JSDOM } = require('jsdom'); const fs = require('fs'); const assert = require('assert');
const html = fs.readFileSync(__dirname + '/dist/index.html', 'utf8').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://x.test/' });
const w = dom.window, d = w.document; w.scrollTo = () => {}; const errs = []; w.addEventListener('error', e => errs.push(e.message));
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const tab = t => click(d.querySelector(`.tabs button[data-tab="${t}"]`));
const submit = f => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const T = s => (d.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim();
assert.ok(T('.hero').includes('฿228'), 'หน้าแรกต้องเหลือ ฿228 จากข้อมูลตัวอย่าง');
const expect = ['food', 'coffee', 'food', 'income', 'fixed', 'shop'];
tab('add'); const n = d.querySelectorAll('[data-act="sample-slip"]').length;
for (let i = 0; i < n; i++) {
  tab('add'); click(d.querySelectorAll('[data-act="sample-slip"]')[i]);
  assert.strictEqual(d.querySelector('#rv-cat').value, expect[i], 'สลิปตัวอย่าง ' + i);
  submit(d.querySelector('[data-form="review"]'));
}
tab('add'); click(d.querySelectorAll('[data-act="sample-slip"]')[0]);
assert.ok(!d.querySelector('#rv-note'), 'ร้านเดิมต้องไม่ถามโน้ตซ้ำ');
click(d.querySelector('[data-act="cancel-draft"]'));
tab('settings'); assert.ok(!T('.tests').includes('ไม่ผ่าน'), 'หน้าตรวจกติกาต้องผ่านทุกข้อ');
assert.deepStrictEqual(errs, []);
console.log('smoke: ผ่าน (สลิปตัวอย่าง ' + n + ' ใบ, ร้านเดิมไม่ถามซ้ำ, หน้าตรวจกติกาผ่าน)');
