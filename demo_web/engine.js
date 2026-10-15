/* บ้านรอด AI — เครื่องคำนวณงบ (กติกาสโคป 3) + ตัวอ่านข้อความสลิป
   ทุกตัวเลขคำนวณด้วยโค้ดล้วน ไม่ใช้ AI */
(function (root) {
  const floor = Math.floor;
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const sum = a => a.reduce((x, y) => x + num(y), 0);

  function incomeBase(s) { return s.mode === 'careful' ? num(s.incomeMin) : num(s.incomeNormal); }
  function debtMin(s) { return num((s.debt || {}).minPay); }
  // ขั้นต่ำบัตรนับเป็นค่าใช้จ่ายคงที่อีกรายการ
  function fixedTotal(s) { return sum((s.fixed || []).map(f => f.amount)) + debtMin(s); }
  function monthPot(s, income) { return income - fixedTotal(s) - num(s.reserve); }
  function monthlyInterest(s) { const d = s.debt || {}; return floor(num(d.balance) * num(d.apr) / 100 / 12); }

  // กติกา 1: แบ่ง B ตามสัดส่วน ปัดลง เศษให้หมวดที่ลดทีหลังสุด (ตัวสุดท้ายในลำดับ)
  function splitCats(B, cats) {
    const W = sum(cats.map(c => c.weight));
    const out = cats.map(c => (W > 0 ? floor(B * num(c.weight) / W) : 0));
    if (cats.length) out[cats.length - 1] += B - sum(out);
    return out;
  }
  // กติกา 2: ลดตามลำดับ หมวดแรกลดถึงเพดานก่อน
  function reduceCats(cb, cats, D) {
    let left = D;
    const red = cats.map((c, i) => {
      const cap = floor(cb[i] * num(c.cap));
      const r = Math.max(0, Math.min(cap, left));
      left -= r;
      return r;
    });
    return { red, C: D - left, short: left };
  }
  const NOT_BUDGET = { fixed: 1, transfer: 1, income: 1 };
  const isAdjustable = t => !NOT_BUDGET[t.cat] && t.day >= 0; // กติกา 6, 8 + โอน/รายรับไม่หักงบ

  function replay(s, data, todayIdx) {
    const days = Math.max(1, num(s.days));
    const n = Math.min(Math.max(todayIdx, 0), days - 1);
    let income = incomeBase(s);
    let M = monthPot(s, income);
    let B = floor(M / days);
    let D = 0, bucket = 0, carry = 0, spent = 0;
    const hist = [];
    for (let d = 0; d <= n; d++) {
      const notes = [];
      const evs = (data.incomes || []).filter(e => e.day === d);
      if (evs.length) { // กติกา 5
        income = num(evs[evs.length - 1].amount);
        M = monthPot(s, income);
        B = floor((M - spent - bucket) / (days - d));
        D = 0; carry = 0;
        notes.push({ k: 'income', income, M, spent, bucket, left: days - d });
      }
      if ((data.covers || []).some(c => c.day === d) && D > 0 && bucket > 0) { // กติกา 4
        const a = Math.min(D, bucket);
        D -= a; bucket -= a;
        notes.push({ k: 'cover', amt: a });
      }
      const Bd = Math.max(B, 0);
      const cb = splitCats(Bd, s.cats);
      const Dstart = D;
      const r = reduceCats(cb, s.cats, D);
      const catT = cb.map((v, i) => v - r.red[i]);
      if (catT.length) catT[catT.length - 1] += carry;
      const T = Bd - r.C + carry;
      const dayTx = (data.txns || []).filter(t => t.day === d && isAdjustable(t));
      const U = sum(dayTx.map(t => t.amount));
      const catU = s.cats.map(c => sum(dayTx.filter(t => t.cat === c.id).map(t => t.amount)));
      hist.push({ day: d, B: Bd, T, C: r.C, red: r.red, cb, catT, catU, Dstart, short: r.short, carry, U, bucket, notes, negative: B < 0 });
      let next = 0;
      if (d < n) { // กติกา 3: ปิดวัน
        if (U > T) D = D - r.C + (U - T);
        else {
          D = D - r.C;
          const lo = T - U;
          if (s.leftoverMode === 'tomorrow') next = lo; else bucket += lo;
        }
        spent += U;
      }
      carry = next;
    }
    return { today: hist[n], hist, D, bucket, income, M, dayIdx: n, days, daysLeft: days - n };
  }

  /* ---------- ตัวอ่านข้อความสลิป ---------- */
  const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  // OCR ไทยมักเว้นวรรคทุกไม่กี่ตัวอักษร: ยุบเฉพาะบรรทัดที่เว้นถี่ผิดปกติ บรรทัดปกติคงช่องว่างของชื่อไว้
  function squashThai(t) {
    return t.split(/\r?\n/).map(l => {
      const th = (l.match(/[฀-๿]/g) || []).length;
      const sp = (l.match(/[฀-๿][ \t]+(?=[฀-๿])/g) || []).length;
      return th && sp / th > 0.2 ? l.replace(/([฀-๿])[ \t]+(?=[฀-๿])/g, '$1') : l;
    }).join('\n');
  }
  const BANK_RE = /^(ธ\.|ธนาคาร|bank|พร้อมเพย์|promptpay|k\s?plus|scb|ktb|bbl|kbank|ttb|gsb|ออมสิน)/i;
  const ACCT_RE = /x{2,}|\d{3}-\d-\d{5}-\d|\*{2,}/i;
  const SKIP_RE = /(สำเร็จ|เลขที่รายการ|รหัสอ้างอิง|ref|จำนวน|ค่าธรรมเนียม|บาท|amount|fee|สแกน|ตรวจสอบ|qr|บันทึกช่วยจำ|memo|วันที่|เวลา|\d{1,2}:\d{2})/i;

  function parseAmount(lines) {
    const cands = [];
    lines.forEach((l, i) => {
      if (/ค่าธรรมเนียม|fee/i.test(l)) return;
      const ms = l.match(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}/g) || [];
      ms.forEach(m => {
        const v = parseFloat(m.replace(/,/g, ''));
        if (v > 0) cands.push({ v, key: /จำนวน|ยอด|amount|total|บาท/i.test(l) || /จำนวน|amount/i.test(lines[i - 1] || '') });
      });
    });
    const keyed = cands.filter(c => c.key);
    const pool = keyed.length ? keyed : cands;
    return pool.length ? Math.max(...pool.map(c => c.v)) : null;
  }
  function parseDate(text) {
    const t = text.replace(/\s+/g, ' ');
    for (let i = 0; i < 12; i++) {
      const esc = TH_MONTHS[i].replace(/\./g, '\\.?\\s?');
      const m = t.match(new RegExp('(\\d{1,2})\\s*' + esc + '\\s*(\\d{2,4})'));
      if (m) return mkDate(+m[2], i + 1, +m[1]);
    }
    const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return mkDate(+m[3], +m[2], +m[1]);
    return null;
  }
  function mkDate(y, mo, d) {
    if (y < 100) y += y >= 40 ? 2500 : 2000; // 69 → 2569 (พ.ศ.)
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const TO_RE = /^(ไปยัง|ไปที่|ถึง|to|ผู้รับเงิน|ผู้รับ|ชื่อร้าน|ร้านค้า|ชื่อบัญชี|merchant|ชำระให้|จ่ายให้)\s*[:：]?\s*/i;
  const MERCH_ID_RE = /รหัสร้านค้า|merchant\s*id|biller\s*id|รหัสผู้ให้บริการ|เลขประจำตัวผู้เสียภาษี/i;
  function cleanName(l) {
    return l.replace(TO_RE, '').replace(/\s{2,}/g, ' ').trim();
  }
  const nameLike = l => !BANK_RE.test(l) && !ACCT_RE.test(l) && !SKIP_RE.test(l) && !MERCH_ID_RE.test(l) && /[A-Za-z฀-๿]{2}/.test(l) && l.length <= 60;
  // ทุกบรรทัดที่น่าจะเป็นชื่อ ให้ผู้ใช้แตะเลือก
  function candidates(lines, best) {
    const out = [];
    const add = s => { s = cleanName(s); if (s.length >= 2 && !out.includes(s)) out.push(s); };
    if (best) add(best);
    lines.forEach(l => { if (nameLike(cleanName(l)) && cleanName(l).length >= 2) add(l); });
    return out.slice(0, 6);
  }
  // เลขบัญชีปลายทาง (บรรทัดบัญชีสุดท้าย) ใช้เป็นตัวจำร้านที่ทนกว่าชื่อ
  // เลขบัญชีของผู้รับเท่านั้น: บรรทัดเลขบัญชีที่อยู่ใต้ชื่อผู้รับไม่เกิน 2 บรรทัด
  // สลิปพร้อมเพย์/QR มักไม่มีเลขผู้รับ ถ้าหยิบบรรทัดสุดท้ายจะได้เลขบัญชีของผู้ใช้เองทุกใบ
  function parseAcct(lines, shop) {
    if (!shop) return '';
    const i = lines.findIndex(l => cleanName(l) === shop || cleanName(l).includes(shop));
    if (i < 0) return '';
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      if (ACCT_RE.test(lines[j])) { const d = lines[j].replace(/[^0-9]/g, ''); return d.length >= 3 ? d : ''; }
      if (!BANK_RE.test(lines[j])) break;
    }
    return '';
  }
  // บันทึกช่วยจำที่ผู้ใช้เขียนตอนโอน (อยู่บรรทัดเดียวกันหรือบรรทัดถัดไป)
  const MEMO_RE = /^(บันทึกช่วยจำ|บันทึก|memo|note|หมายเหตุ)\s*[:：]?\s*(.*)$/i;
  function parseMemo(lines) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(MEMO_RE);
      if (!m) continue;
      if (m[2].trim()) return m[2].trim();
      const nx = lines[i + 1] || '';
      if (nx && !SKIP_RE.test(nx) && !ACCT_RE.test(nx)) return nx.trim();
    }
    return '';
  }
  // ชื่อที่ตามด้วยบรรทัดธนาคาร/เลขบัญชี: ตัวแรกคือผู้ส่ง ตัวสุดท้ายคือผู้รับ
  function partyNames(lines) {
    const names = [];
    lines.forEach((l, i) => {
      const next = lines[i + 1] || '';
      if ((BANK_RE.test(next) || ACCT_RE.test(next)) && !BANK_RE.test(l) && !ACCT_RE.test(l) && !SKIP_RE.test(l) && /[A-Za-z\u0E00-\u0E7F]{2}/.test(l)) names.push(cleanName(l));
    });
    return names;
  }
  function parseSender(lines, shop) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(จาก|from|ผู้โอน|ผู้ส่ง|ผู้ชำระ)\s*[:：]?\s*(.*)$/i);
      if (m) { const v = m[2].trim() || (lines[i + 1] || '').trim(); if (v && !BANK_RE.test(v) && !ACCT_RE.test(v)) return cleanName(v); }
    }
    const names = partyNames(lines).filter(n => n !== shop);
    return names.length ? names[0] : '';
  }
  function parseShop(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (MERCH_ID_RE.test(lines[i]) && i > 0 && nameLike(lines[i - 1])) return cleanName(lines[i - 1]);
    }
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(ไปยัง|ไปที่|ถึง|to|ผู้รับเงิน|ผู้รับ|ชื่อร้าน|ร้านค้า|ชื่อบัญชี|merchant|ชำระให้|จ่ายให้)\s*[:：]?\s*(.*)$/i);
      if (m) {
        const rest = m[2].trim();
        if (rest.length >= 2) return cleanName(rest);
        const nx = lines.slice(i + 1).find(l => l && !BANK_RE.test(l) && !ACCT_RE.test(l));
        if (nx) return cleanName(nx);
      }
    }
    const names = partyNames(lines);
    if (names.length) return names[names.length - 1]; // คนรับคือชื่อหลังสุด
    const shopLine = lines.find(l => /ร้าน|shop|cafe|coffee/i.test(l) && !SKIP_RE.test(l));
    return shopLine ? cleanName(shopLine) : '';
  }
  function parseSlip(raw) {
    const text = squashThai(raw || '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const shop = parseShop(lines);
    const memo = parseMemo(lines);
    const sender = parseSender(lines, shop);
    const cands = candidates(lines, shop).filter(c => c !== memo);
    return { amount: parseAmount(lines), shop, sender, date: parseDate(text), acct: parseAcct(lines, shop), memo, candidates: cands, raw: raw || '' };
  }

  /* ---------- จัดหมวด: ใช้ชุดกฎใน rules.js ---------- */
  const Rules = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.BanRodRules;
  function shopKey(name) {
    return (name || '').toLowerCase().replace(/^(ร้าน|บจก\.?|บริษัท|หจก\.?|นาย|นาง|น\.ส\.)\s*/g, '').replace(/(จำกัด|\(?มหาชน\)?)/g, '').replace(/[\s.,\-_'"()]/g, '');
  }
  // หาร้านที่จำไว้: ชื่อ (ตรง/เคยแก้) ก่อน เลขบัญชีเป็นทางสำรองเมื่ออ่านชื่อไม่ได้
  // ร้านเดิมเปลี่ยนเลขบัญชี → เจอจากชื่อ; ชื่ออ่านเพี้ยน → เจอจากเลขบัญชี; บัญชีตัวกลางหลายร้าน → ชื่อชนะ
  // อ่านชื่อได้แต่ไม่รู้จัก = ร้านใหม่ เลขบัญชีที่ตรงกับร้านเก่าเป็นแค่ข้อเสนอ (suggest) ให้ผู้ใช้กดยืนยัน
  // ใช้เลขบัญชีจับคู่เองเฉพาะเมื่ออ่านชื่อไม่ได้เลย
  function findShop(shops, aliases, name, acct) {
    const k0 = shopKey(name);
    if (k0 && shops[k0]) return { key: k0, via: '' };
    if (k0 && aliases[k0] && shops[aliases[k0]]) return { key: aliases[k0], via: 'alias' };
    const ka = acct && aliases['acct:' + acct];
    const hasAcct = !!(ka && shops[ka]);
    if (k0.length < 2 && hasAcct) return { key: ka, via: 'acct' };
    return { key: k0, via: '', suggest: hasAcct ? ka : '' };
  }
  // บันทึกทางลัด: ถ้าทางลัดเดิมชี้ไปร้านอื่น แปลว่าใช้ร่วมกันหลายร้าน → ลบและห้ามใช้อีก
  function learnAlias(aliases, k, key) {
    if (!k || !key || k === key) return;
    const banned = aliases.__shared || (aliases.__shared = {});
    if (banned[k]) return;
    if (aliases[k] && aliases[k] !== key) { delete aliases[k]; banned[k] = 1; return; }
    aliases[k] = key;
  }
  const guessCat = t => Rules.guessCat(t);
  const classify = ctx => Rules.classify(ctx);

  const api = { incomeBase, fixedTotal, monthPot, monthlyInterest, splitCats, reduceCats, replay, parseSlip, shopKey, findShop, learnAlias, guessCat, classify, Rules, TH_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BanRod = api;
})(this);
