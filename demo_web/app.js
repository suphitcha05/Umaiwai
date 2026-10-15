(function () {
  const E = window.BanRod;
  const KEY = 'banrod-v1';
  const CAT_NAMES = { shop: 'ช้อปปิ้ง', coffee: 'กาแฟ', travel: 'เดินทาง', other: 'อื่นๆ', food: 'ค่ากิน', fixed: 'ค่าคงที่', transfer: 'โอน/ออม (ไม่นับงบ)', income: 'รายรับ' };
  const SRC = { slip: 'สลิป', manual: 'พิมพ์เอง', sample: 'ตัวอย่าง' };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baht = v => '฿' + Math.round(v).toLocaleString('th-TH');
  const n = v => (Number.isFinite(+v) ? +v : 0);

  /* ---------- วันที่ ---------- */
  const isoToday = () => { const d = new Date(); return iso(d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
  const addDays = (s, k) => { const d = parseIso(s); d.setDate(d.getDate() + k); return iso(d); };
  const thDate = s => { const d = parseIso(s); return `${d.getDate()} ${E.TH_MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, '0')}`; };

  /* ---------- ข้อมูลตัวอย่าง (ตรงกับชุดทดสอบ T1) ---------- */
  function sampleState() {
    const start = isoToday();
    return {
      sample: true,
      settings: {
        incomeNormal: 20000, incomeMin: 15000, mode: 'normal', reserve: 2000, days: 30, startDate: start, leftoverMode: 'bucket', owners: ['สมชาย ใจดี'],
        fixed: [{ name: 'ค่าห้อง', amount: 5500, paid: false }, { name: 'ค่าไฟ-น้ำ', amount: 1200, paid: false }, { name: 'มือถือ + เน็ต', amount: 800, paid: false }, { name: 'ประกันสังคม', amount: 500, paid: false }],
        debt: { balance: 0, minPay: 0, apr: 16, paid: false },
        cats: [
          { id: 'shop', weight: 83, cap: 1 }, { id: 'coffee', weight: 50, cap: 0.5 },
          { id: 'travel', weight: 0, cap: 0 }, { id: 'other', weight: 0, cap: 0 }, { id: 'food', weight: 200, cap: 0.5 }],
      },
      txns: [
        { id: 'x1', day: 0, amount: 55, shop: 'Amazon Café', cat: 'coffee', source: 'sample' },
        { id: 'x2', day: 0, amount: 50, shop: 'ข้าวมันไก่ป้าศรี', cat: 'food', source: 'sample' },
      ],
      shops: {
        [E.shopKey('Amazon Café')]: { name: 'Amazon Café', cat: 'coffee', note: 'ร้านกาแฟหน้าออฟฟิศ', created: start },
        [E.shopKey('ข้าวมันไก่ป้าศรี')]: { name: 'ข้าวมันไก่ป้าศรี', cat: 'food', note: 'ข้าวกลางวัน', created: start },
      },
      incomes: [], covers: [], offset: 0, aliases: {},
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.settings) S = sampleState();
  if (!S.settings.owners) S.settings.owners = [];
  if (!S.aliases) S.aliases = {}; // ชื่อที่อ่านเพี้ยน / เลขบัญชี → ร้านที่จำไว้
  if (!S.aliasV2) { // ล้างทางลัดเลขบัญชีที่ตัวอ่านรุ่นเก่าอาจผูกผิด (เลขบัญชีของผู้ใช้เอง)
    Object.keys(S.aliases).forEach(k => { if (k.startsWith('acct:')) delete S.aliases[k]; });
    S.aliasV2 = true;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const todayIdx = () => diffDays(S.settings.startDate, isoToday()) + n(S.offset);
  const dayDate = i => addDays(S.settings.startDate, i);
  const calc = () => E.replay(S.settings, S, todayIdx());

  let tab = 'today';
  let draft = null;
  let flash = '';

  /* ---------- หน้า "วันนี้" ---------- */
  function explain(r) {
    const t = r.today, out = [];
    t.notes.forEach(x => {
      if (x.k === 'income') out.push(`รายได้เดือนนี้เปลี่ยนเป็น ${baht(x.income)} คิดใหม่จากเงินที่เหลือ ${baht(x.M - x.spent - x.bucket)} หาร ${x.left} วัน ได้งบวันละ ${baht(t.B)} ยอดค้างเดิมรวมอยู่ในสูตรนี้แล้ว`);
      if (x.k === 'cover') out.push(`ใช้ถังสำรอง ${baht(x.amt)} ปิดยอดค้างตามที่คุณเลือก`);
    });
    if (t.C > 0) {
      const parts = S.settings.cats.map((c, i) => t.red[i] > 0 ? `${CAT_NAMES[c.id]} ${baht(t.red[i])}` : '').filter(Boolean);
      out.push(`มียอดใช้เกินค้าง ${baht(t.Dstart)} วันนี้ลด${parts.join(' และ ')} รวม ${baht(t.C)}`);
    }
    if (t.short > 0) out.push(`ลดเต็มเพดานทุกหมวดแล้ว ยังค้างอีก ${baht(t.short)} ยกไปพรุ่งนี้ เดือนนี้ค่อนข้างตึง`);
    if (t.carry > 0) out.push(`ยกเงินที่เหลือจากเมื่อวานมาเพิ่ม ${baht(t.carry)}`);
    if (t.negative) out.push('รายได้ที่ใช้คำนวณไม่พอจ่ายค่าคงที่ ขั้นต่ำบัตร และเงินสำรอง งบรายวันจึงเป็น 0');
    if (!out.length) out.push(`งบปกติ วันละ ${baht(t.B)} ยังไม่มียอดค้าง`);
    return out;
  }
  function viewToday() {
    const r = calc(), t = r.today, s = S.settings;
    const left = t.T - t.U;
    const pct = t.T > 0 ? Math.min(100, Math.round(t.U / t.T * 100)) : 100;
    const dataDays = new Set(S.txns.filter(x => x.day >= 0 && x.day <= r.dayIdx).map(x => x.day)).size;
    const todays = S.txns.filter(x => x.day === r.dayIdx);
    const incomeIn = S.txns.filter(x => x.cat === 'income' && x.day >= 0 && x.day <= r.dayIdx).reduce((a, x) => a + n(x.amount), 0);
    const interest = E.monthlyInterest(s);
    const fixedSum = E.fixedTotal(s);
    const catRows = s.cats.map((c, i) => ({ c, b: t.catT[i], u: t.catU[i] })).filter(x => x.b > 0 || x.u > 0);
    return `
    <section class="hero ${left < 0 ? 'is-over' : ''}">
      <div class="hero-top">
        <span class="eyebrow">${left < 0 ? 'วันนี้ใช้เกินแล้ว' : 'วันนี้ใช้ได้อีก'}</span>
        ${dataDays < 7 ? '<span class="chip chip-warn" title="จะหายเมื่อมีรายการจริงครบ 7 วัน">ประมาณการ</span>' : ''}
      </div>
      <div class="big num">${baht(Math.abs(left))}</div>
      <div class="bar" role="img" aria-label="ใช้ไป ${pct}% ของงบวันนี้"><span style="width:${pct}%"></span></div>
      <div class="hero-meta num"><span>งบวันนี้ ${baht(t.T)}</span><span>ใช้ไป ${baht(t.U)}</span></div>
    </section>

    <section class="why">
      <h2>ทำไมได้เท่านี้</h2>
      ${explain(r).map(l => `<p>${esc(l)}</p>`).join('')}
      ${t.short > 0 && r.bucket > 0 ? `<button class="btn btn-ghost" data-act="cover">ใช้ถังสำรอง (${baht(r.bucket)}) ปิดยอดค้าง</button>` : ''}
    </section>

    ${catRows.length ? `<section class="block"><h2>งบแต่ละหมวดวันนี้</h2><ul class="cats">
      ${catRows.map(x => { const p = x.b > 0 ? Math.min(100, Math.round(x.u / x.b * 100)) : 100; return `
        <li><div class="cat-line"><span>${CAT_NAMES[x.c.id]}</span><span class="num ${x.u > x.b ? 'bad' : ''}">${baht(x.u)} / ${baht(x.b)}</span></div>
        <div class="bar thin ${x.u > x.b ? 'over' : ''}"><span style="width:${p}%"></span></div></li>`; }).join('')}
    </ul></section>` : ''}

    <section class="block">
      <div class="h-row"><h2>รายการวันนี้</h2><button class="btn btn-small" data-act="go-add">+ เพิ่มสลิป</button></div>
      ${todays.length ? `<ul class="tx">${todays.map(x => `
        <li><div><strong>${esc(x.shop || 'ไม่ระบุร้าน')}</strong><span class="sub">${x.memo ? `“${esc(x.memo)}” · ` : ''}${CAT_NAMES[x.cat] || x.cat} · <span class="src src-${x.source}">${SRC[x.source] || x.source}</span>${x.edited ? ' · แก้เอง' : ''}</span></div>
        <div class="tx-r"><span class="num ${x.cat === 'income' ? 'in' : ''}">${x.cat === 'income' ? '+' : ''}${baht(x.amount)}</span><button class="icon-btn" data-act="del-tx" data-id="${x.id}" aria-label="ลบรายการ ${esc(x.shop)}">ลบ</button></div></li>`).join('')}</ul>`
        : '<p class="empty">ยังไม่มีรายการวันนี้ เลือกรูปสลิปเพื่อเริ่มจด</p>'}
    </section>

    <section class="block">
      <h2>ค่าใช้จ่ายคงที่เดือนนี้ <span class="num muted">${baht(fixedSum)}</span></h2>
      <ul class="fixed">
        ${s.fixed.map((f, i) => `<li><label><input type="checkbox" id="fx-${i}" data-act="paid" data-i="${i}" ${f.paid ? 'checked' : ''}> ${esc(f.name)}</label><span class="num">${baht(f.amount)}</span></li>`).join('')}
        ${n(s.debt.minPay) > 0 ? `<li><label><input type="checkbox" id="fx-debt" data-act="paid-debt" ${s.debt.paid ? 'checked' : ''}> ขั้นต่ำบัตรเครดิต</label><span class="num">${baht(s.debt.minPay)}</span></li>` : ''}
      </ul>
      ${n(s.debt.balance) > 0 ? `<p class="debt num">หนี้บัตรค้าง ${baht(s.debt.balance)} · ดอกเบี้ย ${n(s.debt.apr)}% ต่อปี ≈ ${baht(interest)} ต่อเดือน</p>` : ''}
    </section>

    ${incomeIn > 0 ? `<section class="block"><div class="h-row"><h2>รับเข้ารอบนี้ <span class="num in">${baht(incomeIn)}</span></h2></div>
      <p class="muted small">จากสลิปที่คุณเป็นผู้รับ เทียบกับที่ตั้งไว้ ${baht(E.incomeBase(s))} งบยังคิดจากค่าที่ตั้งไว้ ถ้ารายได้ทั้งรอบชัดแล้ว ใส่ที่ "รายได้เดือนนี้เข้าจริง" ด้านล่าง</p></section>` : ''}
    <section class="block ledger">
      <h2>ที่มาของงบ</h2>
      <dl class="num">
        <dt>รายได้ที่ใช้คำนวณ${S.incomes.length ? ' (รายได้จริง)' : s.mode === 'careful' ? ' (ต่ำสุด)' : ' (ปกติ)'}</dt><dd>${baht(r.income)}</dd>
        <dt>− ค่าคงที่ + ขั้นต่ำบัตร</dt><dd>${baht(fixedSum)}</dd>
        <dt>− เงินสำรองที่กันไว้</dt><dd>${baht(s.reserve)}</dd>
        <dt class="strong">ถังรายเดือน</dt><dd class="strong">${baht(r.M)}</dd>
        <dt>ถังสำรองสะสม</dt><dd>${baht(r.bucket)}</dd>
        <dt>ยอดค้างที่ยกมา</dt><dd>${baht(t.Dstart)}</dd>
      </dl>
    </section>

    <section class="block demo">
      <h2>ควบคุมเดโม</h2>
      <p class="muted small">วันที่ ${r.dayIdx + 1} จาก ${r.days} · ${thDate(dayDate(r.dayIdx))}</p>
      <div class="row">
        <button class="btn btn-ghost" data-act="prev-day" ${r.dayIdx <= 0 ? 'disabled' : ''}>← ย้อน 1 วัน</button>
        <button class="btn btn-ghost" data-act="next-day" ${r.dayIdx >= r.days - 1 ? 'disabled' : ''}>ปิดวันนี้ ไปวันถัดไป →</button>
      </div>
      <form class="row" data-form="income">
        <label class="grow" for="inc-real">รายได้เดือนนี้เข้าจริง (บาท)
          <input id="inc-real" type="number" inputmode="numeric" min="0" step="1" placeholder="เช่น 14000" required></label>
        <button class="btn" type="submit">คำนวณใหม่</button>
      </form>
      ${S.incomes.length ? '<button class="btn btn-link" data-act="clear-income">ยกเลิกรายได้จริง กลับไปใช้ค่าที่ตั้ง</button>' : ''}
    </section>`;
  }

  /* ---------- หน้าเพิ่มสลิป ---------- */
  function sampleSlips() {
    const d = thDate(dayDate(Math.max(0, todayIdx())));
    return [
      { label: 'โอนให้ร้านตามสั่ง ฿60', text: `โอนเงินสำเร็จ\n${d} 12:31 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nร้านป้าแดง ตามสั่ง\nธ.กรุงไทย\nxxx-x-x5678-x\nเลขที่รายการ: 015288123456\nจำนวน: 60.00 บาท\nค่าธรรมเนียม: 0.00 บาท` },
      { label: 'จ่ายร้านกาแฟ ฿65', text: `ชำระเงินสำเร็จ\n${d} 08:02\nไปยัง\nAmazon Café\nPromptPay\nจำนวนเงิน\n65.00 บาท` },
      { label: 'โอนให้เพื่อน มีบันทึกช่วยจำ ฿120', text: `โอนเงินสำเร็จ\n${d} 19:05 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nจำนวน: 120.00 บาท\nบันทึกช่วยจำ: ค่าข้าวเย็น` },
      { label: 'เพื่อนโอนคืน ฿500 (รายรับ)', text: `โอนเงินสำเร็จ\n${d} 20:15 น.\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nจำนวน: 500.00 บาท\nบันทึกช่วยจำ: คืนค่าข้าว` },
      { label: 'จ่ายบิลค่าไฟ ฿845 (ค่าคงที่)', text: `ชำระเงินสำเร็จ\n${d} 09:30\nจาก\nนาย สมชาย ใจดี\nไปยัง\nการไฟฟ้านครหลวง\nจำนวน 845.00 บาท` },
      { label: 'Shopee ฿349', text: `ชำระเงินสำเร็จ\n${d} 21:40\nไปยัง SHOPEEPAY\nธ.ไทยพาณิชย์\nจำนวน 349.00 บาท` },
    ];
  }
  function viewAdd() {
    if (draft) return viewReview();
    return `
    <section class="block pick">
      <h2>เพิ่มรายจ่ายจากสลิป</h2>
      <p class="muted">แอปอ่านเฉพาะรูปที่คุณเลือกทีละรูป อ่านบนเครื่องนี้ และไม่เก็บรูปไว้ เก็บแค่ยอด ร้าน และวันที่</p>
      <label class="drop" for="slip-file">
        <span class="drop-title">เลือกรูปสลิป</span>
        <span class="muted small">PNG หรือ JPG จากอัลบั้ม</span>
        <input id="slip-file" type="file" accept="image/*" data-act="file">
      </label>
      <p class="status" id="ocr-status" aria-live="polite">${esc(flash)}</p>
      <div class="h-row"><h3>ไม่มีสลิปติดมือ</h3><button class="btn btn-small btn-ghost" data-act="manual">พิมพ์เอง</button></div>
      <p class="muted small">สลิปตัวอย่าง ส่งข้อความแบบที่ OCR อ่านได้เข้าตัวแยกยอด/ร้าน/วันที่ ใช้ซ้อมเดโมเมื่อไม่มีเน็ต</p>
      <div class="samples">${sampleSlips().map((x, i) => `<button class="btn btn-ghost" data-act="sample-slip" data-i="${i}">${esc(x.label)}</button>`).join('')}</div>
      <button class="btn btn-link" data-act="warm-ocr">เตรียม OCR ล่วงหน้า (โหลดภาษาไทยครั้งแรก)</button>
    </section>`;
  }
  // เดาว่าสลิปค่าคงที่นี้คือรายการไหนในค่าคงที่ที่ตั้งไว้ (กฎกลุ่มเดียวกัน)
  function fixedGuess(cls) {
    if (cls.cat !== 'fixed') return '';
    if (cls.rule === 'debt' && n(S.settings.debt.minPay) > 0) return 'debt';
    const i = S.settings.fixed.findIndex(f => { const m = E.Rules.matchRule(f.name); return m && m.id === cls.rule; });
    return i >= 0 ? String(i) : '';
  }
  function openDraft(p, source, msg) {
    const k0 = E.shopKey(p.shop);
    const hit = E.findShop(S.shops, S.aliases, p.shop, p.acct);
    const known = S.shops[hit.key];
    if (known) p.shop = known.name;
    const idx = todayIdx();
    let day = idx;
    if (p.date) { const di = diffDays(S.settings.startDate, p.date); if (di <= idx) day = di; }
    const cls = E.classify({ sender: p.sender, shop: p.shop, memo: p.memo, owners: S.settings.owners, memory: known });
    draft = {
      amount: p.amount ?? '', shop: p.shop || '', day, source,
      cat: cls.cat, cls, sender: p.sender || '',
      memo: p.memo || '', note: p.memo || '', known: !!known, fixedIdx: fixedGuess(cls), msg: msg || '',
      orig: { amount: p.amount, shop: p.shop, readShop: k0 }, acct: p.acct || '',
      candidates: (p.candidates || []).filter(c => c !== p.shop), raw: p.raw || '', via: known ? hit.via : '', suggest: !known && hit.suggest ? hit.suggest : '',
    };
    flash = '';
    tab = 'add';
    render();
  }
  function catOptions(sel) {
    return Object.keys(CAT_NAMES).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${CAT_NAMES[k]}</option>`).join('');
  }
  const SOURCE_TXT = { owner: 'ชื่อผู้ส่ง/ผู้รับ', memo: 'บันทึกช่วยจำ', memory: 'ความจำร้าน', shop: 'ชื่อร้าน', person: 'ผู้รับเป็นบุคคล', none: 'ไม่เข้ากฎ' };
  function reasonBox(d) {
    const c = d.cls; if (!c) return '';
    const me = d.sender && E.Rules.isOwner(d.sender, S.settings.owners);
    return `<div class="reason conf-${c.conf}">
      ${d.sender ? `<p><span class="muted">ผู้ส่ง</span> ${esc(d.sender)}${me ? ' <span class="chip">คุณ</span>' : ''}</p>` : ''}
      ${d.memo ? `<p><span class="muted">บันทึกช่วยจำ</span> “${esc(d.memo)}”</p>` : ''}
      <p><span class="muted">จัดหมวดจาก${SOURCE_TXT[c.source]}</span> ${esc(c.label)} → <strong>${CAT_NAMES[c.cat]}</strong>${c.conf === 'low' ? ' · เลือกหมวดเองได้ แอปจะจำไว้' : c.conf === 'mid' ? ' · ตรวจอีกครั้ง' : ''}</p>
    </div>`;
  }
  function viewReview() {
    const d = draft, s = S.settings;
    const known = S.shops[E.shopKey(d.shop)];
    return `
    <form class="block review" data-form="review">
      <h2>ตรวจก่อนบันทึก</h2>
      ${d.msg ? `<p class="note">${esc(d.msg)}</p>` : ''}
      <label for="rv-amount">ยอดเงิน (บาท)<input id="rv-amount" name="amount" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(d.amount)}" required></label>
      <label for="rv-shop">ร้าน / ผู้รับ<input id="rv-shop" name="shop" value="${esc(d.shop)}" required autocomplete="off"></label>
      ${!known && d.suggest && S.shops[d.suggest] ? `<div class="picks"><span class="muted small">เลขบัญชีผู้รับนี้เคยจ่ายให้ร้านนี้ ถ้าเป็นร้านเดิมให้แตะ ถ้าไม่ใช่ บันทึกเป็นร้านใหม่ได้เลย</span>
        <button type="button" class="pick-chip" data-act="use-suggest">ใช่ ${esc(S.shops[d.suggest].name)}</button></div>` : ''}
      ${!known && d.candidates.length ? `<div class="picks"><span class="muted small">ชื่อไม่ถูก แตะเลือกจากที่อ่านได้:</span>
        ${d.candidates.map((c, i) => `<button type="button" class="pick-chip" data-act="pick-shop" data-i="${i}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${known ? `<p class="remember">จำร้านนี้ได้${d.via === 'acct' ? 'จากเลขบัญชีปลายทาง' : d.via === 'alias' ? 'จากชื่อที่เคยแก้' : ''}: ${esc(known.note || CAT_NAMES[known.cat])} → ${CAT_NAMES[known.cat]}</p>` : `
      <label for="rv-note" class="first-note">ร้านใหม่: ร้านนี้คืออะไร (ถามครั้งเดียว)
        <input id="rv-note" name="note" value="${esc(d.note)}" placeholder="เช่น ร้านข้าวหน้าหอ, ร้านกาแฟ" autocomplete="off"></label>`}
      ${reasonBox(d)}
      <label for="rv-cat">หมวด<select id="rv-cat" name="cat">${catOptions(d.cat)}</select></label>
      ${d.cat === 'fixed' ? `<label for="rv-fixed">ติ๊กว่าจ่ายแล้ว<select id="rv-fixed" name="fixedIdx">
        <option value="">ไม่ติ๊ก</option>${s.fixed.map((f, i) => `<option value="${i}" ${d.fixedIdx === String(i) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}${n(s.debt.minPay) > 0 ? `<option value="debt" ${d.fixedIdx === 'debt' ? 'selected' : ''}>ขั้นต่ำบัตรเครดิต</option>` : ''}</select></label>
        <p class="muted small">ค่าคงที่ไม่หักจากงบรายวัน</p>` : ''}
      ${d.cat === 'transfer' ? '<p class="muted small">โอน/ออม ไม่หักจากงบรายวัน</p>' : d.cat === 'income' ? '<p class="muted small">รายรับไม่หักงบ ดูยอดรวมได้ที่หน้าวันนี้</p>' : ''}
      <p class="muted small">วันที่ ${thDate(dayDate(d.day))}${d.day < 0 ? ' (ก่อนเริ่มรอบ ใช้เป็นข้อมูลตั้งต้น ไม่หักงบ)' : ''} · ที่มา: ${SRC[d.source]}</p>
      <div class="row"><button class="btn" type="submit">บันทึก</button><button class="btn btn-ghost" type="button" data-act="cancel-draft">ยกเลิก</button></div>
      ${d.raw ? `<details class="raw"><summary>ดูข้อความที่ OCR อ่านได้</summary><pre>${esc(d.raw)}</pre>
        <button type="button" class="btn btn-small btn-ghost" data-act="copy-raw">คัดลอกข้อความ</button></details>` : ''}
    </form>`;
  }

  /* ---------- หน้าร้านที่จำ ---------- */
  function viewShops() {
    const list = Object.entries(S.shops);
    return `<section class="block">
      <h2>ร้านที่แอปจำแล้ว <span class="muted num">${list.length}</span></h2>
      <p class="muted small">ใส่โน้ตครั้งแรกครั้งเดียว ครั้งต่อไปแอปจัดหมวดให้เอง เปลี่ยนหมวดได้ที่นี่</p>
      <button class="btn btn-link" data-act="clear-aliases">ล้างทางลัด (ชื่อที่เคยแก้และเลขบัญชี) แต่เก็บร้านไว้</button>
      ${list.length ? `<ul class="shops">${list.map(([k, v]) => `
        <li><div><strong>${esc(v.name)}</strong><span class="sub">${esc(v.note || 'ไม่มีโน้ต')}</span></div>
        <div class="tx-r"><select id="shop-${esc(k)}" data-act="shop-cat" data-k="${esc(k)}" aria-label="หมวดของ ${esc(v.name)}">${catOptions(v.cat)}</select>
        <button class="icon-btn" data-act="del-shop" data-k="${esc(k)}" aria-label="ลืมร้าน ${esc(v.name)}">ลืม</button></div></li>`).join('')}</ul>`
        : '<p class="empty">ยังไม่มีร้านที่จำไว้</p>'}
    </section>`;
  }

  /* ---------- หน้าตั้งค่า ---------- */
  function viewSettings() {
    const s = S.settings;
    const f = (id, label, val, extra = '') => `<label for="${id}">${label}<input id="${id}" name="${id}" type="number" inputmode="numeric" min="0" step="1" value="${esc(val)}" ${extra}></label>`;
    return `
    <form class="block settings" data-form="settings">
      <h2>ตั้งค่าแรก</h2>
      <fieldset><legend>รายได้ต่อเดือน</legend>
        <div class="grid2">${f('incomeMin', 'ต่ำสุดที่เคยได้', s.incomeMin)}${f('incomeNormal', 'ปกติ', s.incomeNormal)}</div>
        <div class="seg" role="radiogroup" aria-label="โหมดคำนวณ">
          <label><input type="radio" name="mode" value="careful" ${s.mode === 'careful' ? 'checked' : ''}> ระมัดระวัง (ใช้รายได้ต่ำสุด)</label>
          <label><input type="radio" name="mode" value="normal" ${s.mode === 'normal' ? 'checked' : ''}> ปกติ</label>
        </div>
      </fieldset>
      <fieldset><legend>ค่าใช้จ่ายคงที่</legend>
        <div id="fixed-list">${s.fixed.map((x, i) => `<div class="fx-row">
          <input id="fxn-${i}" name="fxn-${i}" value="${esc(x.name)}" aria-label="ชื่อรายการ" required>
          <input id="fxa-${i}" name="fxa-${i}" type="number" inputmode="numeric" min="0" value="${esc(x.amount)}" aria-label="จำนวนเงิน">
          <button type="button" class="icon-btn" data-act="fx-del" data-i="${i}" aria-label="ลบ ${esc(x.name)}">ลบ</button></div>`).join('')}</div>
        <button type="button" class="btn btn-small btn-ghost" data-act="fx-add">+ เพิ่มรายการ</button>
      </fieldset>
      <fieldset><legend>หนี้บัตรเครดิต</legend>
        <div class="grid3">${f('debtBalance', 'ยอดหนี้', s.debt.balance)}${f('debtMin', 'ขั้นต่ำต่อเดือน', s.debt.minPay)}
          <label for="debtApr">ดอกเบี้ย % ต่อปี<input id="debtApr" name="debtApr" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(s.debt.apr)}"></label></div>
        <p class="muted small">ขั้นต่ำนับเป็นค่าคงที่ หักออกก่อนแบ่งงบรายวัน ยอดหนี้และดอกเบี้ยใช้แสดงผล ดูยอดขั้นต่ำจากใบแจ้งยอดของบัตร</p>
      </fieldset>
      <fieldset><legend>ชื่อบัญชีของฉัน</legend>
        <label for="owners">ชื่อตามบัญชีธนาคาร คั่นด้วยจุลภาค (ไทยและอังกฤษ)<input id="owners" name="owners" value="${esc((s.owners || []).join(', '))}" placeholder="สมชาย ใจดี, SOMCHAI JAIDEE" autocomplete="off"></label>
        <p class="muted small">ใช้แยกทิศทางเงิน: คุณเป็นผู้รับ = รายรับ, คุณเป็นทั้งผู้ส่งและผู้รับ = โอนระหว่างบัญชีตัวเอง (ไม่นับงบ)</p>
      </fieldset>
      <fieldset><legend>เงินสำรองและรอบ</legend>
        <div class="grid3">${f('reserve', 'กันเงินสำรอง', s.reserve)}${f('days', 'จำนวนวันในรอบ', s.days, 'min="1" max="31"')}
          <label for="startDate">เริ่มรอบ<input id="startDate" name="startDate" type="date" value="${esc(s.startDate)}"></label></div>
        <div class="seg" role="radiogroup" aria-label="เงินเหลือแต่ละวัน">
          <label><input type="radio" name="leftoverMode" value="bucket" ${s.leftoverMode !== 'tomorrow' ? 'checked' : ''}> เงินเหลือเก็บเข้าถังสำรอง</label>
          <label><input type="radio" name="leftoverMode" value="tomorrow" ${s.leftoverMode === 'tomorrow' ? 'checked' : ''}> บวกเข้างบพรุ่งนี้</label>
        </div>
      </fieldset>
      <fieldset><legend>หมวดที่ปรับได้ (เรียงตามลำดับที่ลดก่อน)</legend>
        <div class="cat-head muted small"><span>หมวด</span><span>งบ/วัน (สัดส่วน)</span><span>ลดได้ %</span><span></span></div>
        ${s.cats.map((c, i) => `<div class="cat-row"><span>${CAT_NAMES[c.id]}</span>
          <input id="cw-${c.id}" name="cw-${c.id}" type="number" min="0" value="${esc(c.weight)}" aria-label="สัดส่วน ${CAT_NAMES[c.id]}">
          <input id="cc-${c.id}" name="cc-${c.id}" type="number" min="0" max="100" value="${Math.round(c.cap * 100)}" aria-label="ลดได้ % ${CAT_NAMES[c.id]}">
          <span class="ord"><button type="button" class="icon-btn" data-act="cat-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น">↑</button><button type="button" class="icon-btn" data-act="cat-down" data-i="${i}" ${i === s.cats.length - 1 ? 'disabled' : ''} aria-label="เลื่อนลง">↓</button></span></div>`).join('')}
        <p class="muted small">หมวดสุดท้ายในลำดับได้เศษจากการปัด แนะนำให้ค่ากินอยู่ท้ายและลดได้ไม่เกิน 50%</p>
      </fieldset>
      <div class="row"><button class="btn" type="submit">บันทึกและคำนวณใหม่</button></div>
      <p class="status" aria-live="polite">${esc(flash)}</p>
    </form>
    <section class="block">
      <h2>กฎจัดหมวด <span class="muted num">${E.Rules.RULES.length} กลุ่ม</span></h2>
      <p class="muted small">ลำดับ: ชื่อผู้ส่ง/ผู้รับ → บันทึกช่วยจำ → ร้านที่คุณสอนไว้ → ชื่อร้าน → อื่นๆ (ให้คุณเลือก) กฎบนชนะกฎล่าง</p>
      <details class="rules"><summary>ดูกฎทั้งหมด</summary><ol>${E.Rules.RULES.map(r => `<li><strong>${esc(r.label)}</strong> → ${CAT_NAMES[r.cat]}<span class="sub">${esc(r.terms.slice(0, 8).join(', '))}${r.terms.length > 8 ? ` และอีก ${r.terms.length - 8} คำ` : ''}</span></li>`).join('')}</ol></details>
    </section>
    <section class="block">
      <h2>ตรวจกติกาเครื่องคำนวณ</h2>
      <ul class="tests">${runTests().map(x => `<li class="${x.ok ? 'pass' : 'fail'}"><span>${x.ok ? 'ผ่าน' : 'ไม่ผ่าน'}</span> ${esc(x.name)}</li>`).join('')}</ul>
    </section>
    <section class="block">
      <h2>ข้อมูลในเครื่องนี้</h2>
      <p class="muted small">เก็บในเบราว์เซอร์นี้เท่านั้น ไม่มีบัญชีผู้ใช้</p>
      <div class="row"><button class="btn btn-ghost" data-act="reset-sample">โหลดข้อมูลตัวอย่างใหม่</button><button class="btn btn-ghost" data-act="clear-all">เริ่มใหม่แบบว่าง</button></div>
    </section>`;
  }

  function runTests() {
    const base = () => ({ incomeNormal: 20000, incomeMin: 15000, mode: 'normal', reserve: 2000, days: 30, leftoverMode: 'bucket',
      fixed: [{ amount: 8000 }], debt: { minPay: 0 },
      cats: [{ id: 'shop', weight: 83, cap: 1 }, { id: 'coffee', weight: 50, cap: .5 }, { id: 'food', weight: 200, cap: .5 }] });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const res = [];
    const T = (name, fn) => { let ok = false; try { ok = fn(); } catch (e) {} res.push({ name, ok }); };
    const sumA = a => a.reduce((x, y) => x + y, 0);
    const rs = [];
    T('T1 งบวันแรก B = 333, หมวด 83/50/200', () => { const r = E.replay(base(), { txns: [] }, 0); rs.push(r); return r.today.B === 333 && eq(r.today.cb, [83, 50, 200]); });
    T('T2 ใช้เกิน 100 → วันที่ 2 งบ 233', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 433, cat: 'food' }] }, 1); rs.push(r); return r.today.T === 233 && eq(r.today.red, [83, 17, 0]); });
    T('T3 ใช้เหลือ 100 → ถังสำรอง 100', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 233, cat: 'food' }] }, 1); rs.push(r); return r.bucket === 100 && r.today.T === 333; });
    T('T4 รายได้เป็น 17,000 วันที่ 10 → B = 190', () => { const tx = []; for (let d = 0; d < 9; d++) tx.push({ day: d, amount: 333, cat: 'food' }); const r = E.replay(base(), { txns: tx, incomes: [{ day: 9, amount: 17000 }] }, 9); rs.push(r); return r.today.B === 190 && r.D === 0; });
    T('T12 ขั้นต่ำบัตร 1,500 → B = 283, หมวด 70/42/171', () => { const s = base(); s.debt.minPay = 1500; const r = E.replay(s, { txns: [] }, 0); rs.push(r); return r.today.B === 283 && eq(r.today.cb, [70, 42, 171]); });
    T('T8 ผลรวมหมวดเท่ากับงบวันนี้ทุกวัน', () => rs.every(r => r.hist.every(h => sumA(h.catT) === h.T)));
    return res;
  }

  /* ---------- OCR (Tesseract.js บนเครื่อง) ---------- */
  let worker = null;
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load')); document.head.appendChild(s); });
  }
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  async function getWorker() {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    if (!worker) worker = await window.Tesseract.createWorker('tha+eng');
    return worker;
  }
  function setStatus(t) { flash = t; const el = $('#ocr-status'); if (el) el.textContent = t; }
  async function readSlip(file) {
    setStatus('กำลังอ่านสลิปบนเครื่องนี้…');
    try {
      const w = await timeout(getWorker(), 60000);
      const { data } = await timeout(w.recognize(file), 45000);
      const p = E.parseSlip(data.text);
      const miss = [p.amount == null && 'ยอด', !p.shop && 'ร้าน'].filter(Boolean);
      openDraft(p, 'slip', miss.length ? `อ่าน${miss.join('และ')}ไม่ได้ กรอกเองได้เลย` : 'อ่านจากสลิปแล้ว ตรวจตัวเลขก่อนบันทึก');
    } catch (e) {
      openDraft({}, 'slip', 'อ่านอัตโนมัติไม่ได้บนหน้านี้ กรอกยอดและร้านเองได้ (OCR ทำงานเมื่อเปิดแอปจากเว็บที่โฮสต์เอง)');
    }
  }

  /* ---------- การกระทำ ---------- */
  const uid = () => Math.random().toString(36).slice(2, 9);
  function act(a, el) {
    const s = S.settings;
    switch (a) {
      case 'go-add': tab = 'add'; break;
      case 'del-tx': S.txns = S.txns.filter(x => x.id !== el.dataset.id); break;
      case 'paid': s.fixed[+el.dataset.i].paid = el.checked; break;
      case 'paid-debt': s.debt.paid = el.checked; break;
      case 'cover': S.covers.push({ day: todayIdx() }); break;
      case 'next-day': S.offset = n(S.offset) + 1; break;
      case 'prev-day': S.offset = n(S.offset) - 1; break;
      case 'clear-income': S.incomes = []; break;
      case 'use-income': { const v = S.txns.filter(x => x.cat === 'income' && x.day >= 0 && x.day <= todayIdx()).reduce((a, x) => a + n(x.amount), 0); S.incomes = S.incomes.filter(e => e.day !== todayIdx()); S.incomes.push({ day: todayIdx(), amount: v }); break; }
      case 'manual': openDraft({}, 'manual'); return;
      case 'sample-slip': { const x = sampleSlips()[+el.dataset.i]; openDraft(E.parseSlip(x.text), 'sample', 'สลิปตัวอย่าง ผ่านตัวแยกยอด/ร้าน/วันที่เดียวกับ OCR'); return; }
      case 'warm-ocr': setStatus('กำลังเตรียม OCR…'); timeout(getWorker(), 60000).then(() => setStatus('OCR พร้อมแล้ว'), () => setStatus('โหลด OCR ไม่ได้บนหน้านี้ ใช้สลิปตัวอย่างหรือพิมพ์เองแทน')); return;
      case 'cancel-draft': draft = null; break;
      case 'use-suggest': {
        const f = el.form; draft.amount = f.elements.amount.value;
        const sh = S.shops[draft.suggest]; if (!sh) return;
        draft.shop = sh.name; draft.known = true; draft.via = 'acct'; draft.suggest = '';
        draft.cls = E.classify({ sender: draft.sender, shop: sh.name, memo: draft.memo, owners: S.settings.owners, memory: sh });
        draft.cat = draft.cls.cat; render(); return;
      }
      case 'pick-shop': {
        const f = el.form; draft.amount = f.elements.amount.value; if (f.elements.note) draft.note = f.elements.note.value;
        const c = draft.candidates[+el.dataset.i];
        draft.candidates = draft.candidates.filter(x => x !== c).concat(draft.shop ? [draft.shop] : []);
        draft.shop = c;
        const k = S.aliases[E.shopKey(c)] || E.shopKey(c);
        draft.cls = E.classify({ sender: draft.sender, shop: c, memo: draft.memo, owners: S.settings.owners, memory: S.shops[k] || null });
        draft.cat = draft.cls.cat;
        if (S.shops[k]) draft.shop = S.shops[k].name;
        render(); return;
      }
      case 'copy-raw': {
        const pre = el.parentElement.querySelector('pre');
        const sel = () => { const r = document.createRange(); r.selectNodeContents(pre); const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r); };
        try { navigator.clipboard.writeText(draft.raw).then(() => { el.textContent = 'คัดลอกแล้ว'; }, sel); } catch (e) { sel(); }
        return;
      }
      case 'shop-cat': S.shops[el.dataset.k].cat = el.value; break;
      case 'clear-aliases': S.aliases = {}; flash = ''; break;
      case 'del-shop': { const k = el.dataset.k; delete S.shops[k]; Object.keys(S.aliases).forEach(x => { if (x !== '__shared' && S.aliases[x] === k) delete S.aliases[x]; }); break; }
      case 'fx-add': syncSettings(); s.fixed.push({ name: 'รายการใหม่', amount: 0, paid: false }); break;
      case 'fx-del': syncSettings(); s.fixed.splice(+el.dataset.i, 1); break;
      case 'cat-up': case 'cat-down': { syncSettings(); const i = +el.dataset.i, j = a === 'cat-up' ? i - 1 : i + 1; [s.cats[i], s.cats[j]] = [s.cats[j], s.cats[i]]; break; }
      case 'reset-sample': S = sampleState(); flash = 'โหลดข้อมูลตัวอย่างแล้ว'; break;
      case 'clear-all': { const st = sampleState(); st.sample = false; st.txns = []; st.shops = {}; st.settings.fixed.forEach(f => f.paid = false); S = st; tab = 'settings'; flash = 'ล้างรายการแล้ว ตั้งค่าของคุณเองได้เลย'; break; }
      default: return;
    }
    save(); render();
  }
  function syncSettings() {
    const form = document.querySelector('[data-form="settings"]');
    if (!form) return;
    const fd = new FormData(form), s = S.settings, g = k => fd.get(k);
    s.incomeMin = n(g('incomeMin')); s.incomeNormal = n(g('incomeNormal'));
    s.mode = g('mode') || 'normal'; s.leftoverMode = g('leftoverMode') || 'bucket';
    s.fixed.forEach((x, i) => { if (fd.has('fxn-' + i)) { x.name = g('fxn-' + i); x.amount = n(g('fxa-' + i)); } });
    s.debt.balance = n(g('debtBalance')); s.debt.minPay = n(g('debtMin')); s.debt.apr = n(g('debtApr'));
    s.owners = String(g('owners') || '').split(/[,،\n]/).map(x => x.trim()).filter(Boolean);
    s.reserve = n(g('reserve')); s.days = Math.min(31, Math.max(1, n(g('days')) || 30));
    if (g('startDate')) s.startDate = g('startDate');
    s.cats.forEach(c => { c.weight = n(g('cw-' + c.id)); c.cap = Math.min(100, n(g('cc-' + c.id))) / 100; });
  }
  function submit(kind, form) {
    if (kind === 'income') {
      const v = n(form.querySelector('#inc-real').value);
      S.incomes = S.incomes.filter(e => e.day !== todayIdx()); S.incomes.push({ day: todayIdx(), amount: v });
    } else if (kind === 'settings') {
      syncSettings(); S.sample = false; S.offset = 0; S.incomes = []; S.covers = [];
      flash = 'บันทึกแล้ว งบคำนวณใหม่';
    } else if (kind === 'review') {
      const fd = new FormData(form);
      const amount = Math.round(n(fd.get('amount')) * 100) / 100, shop = String(fd.get('shop')).trim(), cat = fd.get('cat');
      const key = E.shopKey(shop);
      const ownerKeys = (S.settings.owners || []).map(E.shopKey);
      // ไม่สร้างทางลัดจากชื่อของผู้ใช้เอง (มักเป็นผู้ส่งที่ตัวอ่านหยิบผิด)
      if (draft.orig.readShop && !ownerKeys.includes(draft.orig.readShop) && !E.Rules.isOwner(draft.orig.shop, S.settings.owners)) E.learnAlias(S.aliases, draft.orig.readShop, key);
      if (draft.acct) E.learnAlias(S.aliases, 'acct:' + draft.acct, key);
      if (!S.shops[key]) S.shops[key] = { name: shop, cat, note: String(fd.get('note') || '').trim(), created: isoToday() };
      else S.shops[key].cat = cat;
      const fx = fd.get('fixedIdx');
      if (cat === 'fixed' && fx === 'debt') S.settings.debt.paid = true;
      else if (cat === 'fixed' && fx !== null && fx !== '') S.settings.fixed[+fx].paid = true;
      const edited = draft.source === 'slip' && (draft.orig.amount !== amount || draft.orig.shop !== shop);
      S.txns.push({ id: uid(), day: draft.day, amount, shop, cat, source: draft.source, edited, memo: draft.memo || '' });
      draft = null; tab = 'today';
    }
    save(); render();
  }

  /* ---------- วาดหน้า ---------- */
  const TABS = [['today', 'วันนี้'], ['add', 'เพิ่มสลิป'], ['shops', 'ร้านที่จำ'], ['settings', 'ตั้งค่า']];
  function render() {
    const views = { today: viewToday, add: viewAdd, shops: viewShops, settings: viewSettings };
    $('#view').innerHTML = views[tab]();
    $('#date-line').textContent = `${thDate(dayDate(Math.max(0, Math.min(todayIdx(), S.settings.days - 1))))} · วันที่ ${Math.min(Math.max(todayIdx(), 0), S.settings.days - 1) + 1}/${S.settings.days}`;
    $('#sample-chip').hidden = !S.sample;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  }
  document.addEventListener('click', e => {
    const tb = e.target.closest('.tabs button');
    if (tb) { tab = tb.dataset.tab; if (tab !== 'add') draft = null; flash = ''; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'file') { e.preventDefault(); act(el.dataset.act, el); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.act === 'file' && el.files && el.files[0]) { readSlip(el.files[0]); el.value = ''; return; }
    if (el.name === 'cat' && draft) { draft.cat = el.value; const f = el.form; draft.amount = f.elements.amount.value; draft.shop = f.elements.shop.value; if (f.elements.note) draft.note = f.elements.note.value; render(); return; }
    if (el.dataset.act && (el.tagName === 'SELECT' || el.type === 'checkbox')) act(el.dataset.act, el);
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (draft && el.name === 'note' && !draft.known) {
      draft.note = el.value;
      const g = E.guessCat(el.value + ' ' + el.form.elements.shop.value);
      if (g !== 'other') { el.form.elements.cat.value = g; draft.cat = g; }
    }
  });
  document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (f) { e.preventDefault(); submit(f.dataset.form, f); } });
  render();
})();
