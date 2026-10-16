(function () {
  const E = window.BanRod;
  const KEY = 'banrod-v1';
  const CAT_NAMES = { shop: 'Shopping', coffee: 'Coffee', travel: 'Getting around', other: 'Other', food: 'Food', fixed: 'Bills', transfer: 'Transfer or savings (not spending)', income: 'Money in' };
  const SRC = { slip: 'Slip', sms: 'Card SMS', voice: 'Voice', manual: 'Typed', sample: 'Sample' };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baht = v => '฿' + Math.round(v).toLocaleString('en-US');
  const n = v => (Number.isFinite(+v) ? +v : 0);

  /* ---------- วันที่ ---------- */
  const isoToday = () => { const d = new Date(); return iso(d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
  const addDays = (s, k) => { const d = parseIso(s); d.setDate(d.getDate() + k); return iso(d); };
  const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const thDate = s => { const d = parseIso(s); return `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  /* ---------- ข้อมูลตัวอย่าง (ตรงกับชุดทดสอบ T1) ---------- */
  // ข้อมูลตัวอย่าง 2 แบบ ใช้ตรวจการคำนวณ: รายจ่ายรายวันเหมือนกันทุกบาท ต่างกันแค่หนี้บัตร
  // รอบเริ่ม 5 วันก่อนวันนี้ (วันนี้ = วันที่ 6) จะได้เห็นการยกยอด/ถังสำรองย้อนหลัง
  const SAMPLE_TX = [
    [0, 50, 'ข้าวมันไก่ป้าศรี', 'food'], [0, 55, 'Amazon Café', 'coffee'], [0, 80, 'ร้านป้าแดง ตามสั่ง', 'food'], [0, 95, '7-Eleven', 'shop'],
    [1, 60, 'ข้าวมันไก่ป้าศรี', 'food'], [1, 55, 'Amazon Café', 'coffee'], [1, 250, 'Shopee', 'shop'], [1, 68, 'ร้านป้าแดง ตามสั่ง', 'food'],
    [2, 50, 'ข้าวมันไก่ป้าศรี', 'food'], [2, 55, 'Amazon Café', 'coffee'], [2, 95, 'ร้านป้าแดง ตามสั่ง', 'food'],
    [3, 50, 'ข้าวมันไก่ป้าศรี', 'food'], [3, 55, 'Amazon Café', 'coffee'], [3, 80, 'ร้านป้าแดง ตามสั่ง', 'food'], [3, 148, "Lotus's", 'shop'],
    [4, 50, 'ข้าวมันไก่ป้าศรี', 'food'], [4, 55, 'Amazon Café', 'coffee'], [4, 45, 'ร้านป้าแดง ตามสั่ง', 'food'],
    [5, 50, 'ข้าวมันไก่ป้าศรี', 'food'], [5, 55, 'Amazon Café', 'coffee'],
  ];
  const SAMPLE_NOTES = { 'ข้าวมันไก่ป้าศรี': 'Lunch', 'Amazon Café': 'Coffee near work', 'ร้านป้าแดง ตามสั่ง': 'Dinner', '7-Eleven': 'Daily items', Shopee: 'Online shopping', "Lotus's": 'Things for the room', SHOPEE: 'Online shopping' };
  function sampleState(kind) {
    const debt = kind === 'debt';
    const start = addDays(isoToday(), -5);
    const txns = SAMPLE_TX.map(([day, amount, shop, cat], i) => ({ id: 'x' + i, day, amount, shop, cat, source: 'sample', pay: 'cash' }));
    if (debt) txns.push({ id: 'xc1', day: 2, amount: 300, shop: 'SHOPEE', cat: 'shop', source: 'sample', pay: 'card', card4: '1234' });
    const shops = {};
    txns.forEach(t => { const k = E.shopKey(t.shop); if (!shops[k]) shops[k] = { name: t.shop, cat: t.cat, note: SAMPLE_NOTES[t.shop] || '', created: start }; });
    return {
      sample: true, sampleKind: debt ? 'debt' : 'normal',
      settings: {
        incomeNormal: 20000, incomeMin: 15000, mode: 'normal', reserve: 2000, days: 30, startDate: start, leftoverMode: 'bucket', owners: ['สมชาย ใจดี', 'SOMCHAI JAIDEE'],
        fixed: [{ name: 'Rent', amount: 5500, paid: true }, { name: 'Electricity and water', amount: 1200, paid: false }, { name: 'Phone and internet', amount: 800, paid: false }, { name: 'Social security', amount: 500, paid: false }],
        debt: debt ? { balance: 30000, minPay: 1500, apr: 16, planPay: 2800, paid: false } : { balance: 0, minPay: 0, apr: 16, planPay: 0, paid: false },
        cats: [
          { id: 'shop', weight: 83, cap: 1 }, { id: 'coffee', weight: 50, cap: 0.5 },
          { id: 'travel', weight: 0, cap: 0 }, { id: 'other', weight: 0, cap: 0 }, { id: 'food', weight: 200, cap: 0.5 }],
      },
      txns, shops, incomes: [], covers: [], offset: 0, aliases: {},
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
  let queue = []; // รายการจากเสียงที่รอตรวจทีละรายการ
  let flash = '';

  /* ---------- หน้า "วันนี้" ---------- */
  function explain(r) {
    const t = r.today, out = [];
    t.notes.forEach(x => {
      if (x.k === 'income') out.push(`Your income this month changed to ${baht(x.income)}. We took the money left (${baht(x.M - x.spent - x.bucket)}) and split it over ${x.left} days, so you get ${baht(t.B)} a day.`);
      if (x.k === 'cover') out.push(`You used ${baht(x.amt)} from your savings jar to clear the overspend.`);
    });
    if (t.C > 0) {
      const parts = S.settings.cats.map((c, i) => t.red[i] > 0 ? `${CAT_NAMES[c.id]} ${baht(t.red[i])}` : '').filter(Boolean);
      out.push(`You overspent ${baht(t.Dstart)} before, so today we cut ${parts.join(' and ')} (${baht(t.C)} in total).`);
    }
    if (t.short > 0) out.push(`That's the most we can cut today. ${baht(t.short)} is still left to make up, so it moves to tomorrow. This month is tight.`);
    if (t.carry > 0) out.push(`You get ${baht(t.carry)} extra left over from yesterday.`);
    if (t.negative) out.push('Your income does not cover your bills, card payment and safety money, so your daily budget is 0.');
    if (t.U > t.T) out.unshift(`You spent ${baht(t.U - t.T)} more than today's budget. Tomorrow's budget will be smaller. Food is cut last.`);
    if (!out.length) out.push(`Normal day: ${baht(t.B)} a day. Nothing to make up.`);
    return out;
  }
  // แผนปลดหนี้บัตร: ขั้นต่ำต้องจ่ายได้ก่อน แล้วเลือกว่าจะหมดหนี้ภายในกี่เดือน แลกกับงบต่อวัน
  function payoffCard(s, income) {
    const d = s.debt, minP = n(d.minPay), plan = E.debtPay(s);
    const chk = E.debtCheck(s, income);
    if (chk.level === 'cannot-min') return `<section class="card alert"><h2>Your income can't cover the card's minimum payment</h2>
      <p>You are short about ${baht(chk.short)} after bills. If you miss payments, this can turn into bad debt.</p>
      <p>Don't pay it with another card. Call your bank and <b>ask to turn the card balance into a loan with fixed monthly payments</b> before you fall behind. Under Bank of Thailand rules, card issuers must offer help.</p>
      <p class="muted small">Based on Bank of Thailand measures until the end of 2026. Check the details with your bank.</p></section>`;
    if (minP <= 0 && plan <= 0) return '';
    const opts = E.planOptions(s, income);
    const minPo = minP > 0 ? E.payoff(d.balance, d.apr, minP) : null;
    const row = o => `<li><div class="cat-line"><span>Pay ${baht(o.pay)}/month → debt-free in ${o.months} months</span><span class="num">Interest ≈ ${baht(o.payoff ? o.payoff.interest : 0)}</span></div>
      <div class="cat-line"><span class="muted small">Daily budget: ${baht(o.daily)}</span>${o.pay === plan ? '<span class="chip">Your plan</span>' : `<button class="btn btn-small btn-ghost" data-act="set-plan" data-pay="${o.pay}">Choose this</button>`}</div></li>`;
    const best = opts.find(o => o.pay === plan) || null;
    const diff = minPo && best && plan > minP ? `Compared with paying only the minimum, you finish ${minPo.months - best.months} months sooner and save about ${baht(minPo.interest - best.payoff.interest)} in interest.` : minP > 0 && !minPo ? 'If you pay only this minimum, interest eats it all and the debt barely goes down.' : 'Pick a plan you can live with. Paying a little every month beats paying a lot and then using the card again.';
    const cur = opts.find(o => o.pay === plan);
    return `<details class="card more plan"><summary>Card payoff plan: ${baht(plan)}/month${cur ? `, done in ${cur.months} months` : ''}</summary><div class="h-row"><span class="chip chip-warn">Estimate</span></div>
      <p class="muted small">Debt ${baht(d.balance)}, interest ${n(d.apr)}% a year, minimum ${baht(minP)}${minPo ? ` (minimum only: ${minPo.months} months, interest ≈ ${baht(minPo.interest)})` : ''}</p>
      <ul class="cats">${opts.map(row).join('')}</ul>
      <p>${esc(diff)}</p>
      <p class="muted small">Assumes the same payment every month and no new card spending. The real minimum is a % of what you owe (8% until the end of 2026). Your plan payment is set aside before your daily budget.</p></details>`;
  }
  function viewToday() {
    const r = calc(), t = r.today, s = S.settings;
    const note = flash; flash = '';
    const left = t.T - t.U;
    const pct = t.T > 0 ? Math.min(100, Math.round(t.U / t.T * 100)) : 100;
    const dataDays = new Set(S.txns.filter(x => x.day >= 0 && x.day <= r.dayIdx).map(x => x.day)).size;
    const todays = S.txns.filter(x => x.day === r.dayIdx).slice().reverse();
    const incomeIn = S.txns.filter(x => x.cat === 'income' && x.day >= 0 && x.day <= r.dayIdx).reduce((a, x) => a + n(x.amount), 0);
    const interest = E.monthlyInterest(s);
    const fixedSum = E.fixedTotal(s);
    const debtPay = E.debtPay(s);
    const cardSum = S.txns.filter(x => x.pay === 'card' && x.day >= 0 && x.day <= r.dayIdx).reduce((a, x) => a + n(x.amount), 0);
    const catRows = s.cats.map((c, i) => ({ c, b: t.catT[i], u: t.catU[i] })).filter(x => x.b > 0 || x.u > 0);
    const why = explain(r);
    return `${note ? `<p class="note" role="status">${esc(note)}</p>` : ''}
    <div class="cols"><div class="col">
    ${helloHtml()}
    <section class="hero ${left < 0 ? 'is-over' : ''}">
      <div class="hero-top">
        <span class="eyebrow">${left < 0 ? 'Over budget today' : 'Left to spend today'}</span>
        ${dataDays < 7 ? '<span class="chip chip-warn" title="Goes away after 7 days of real data">Estimate</span>' : ''}
      </div>
      <div class="big num">${baht(Math.abs(left))}</div>
      <div class="bar" role="img" aria-label="Used ${pct}% of today's budget"><span style="width:${pct}%"></span></div>
      <div class="hero-meta num"><span>Today's budget ${baht(t.T)}</span><span>Spent ${baht(t.U)}</span></div>
      <details class="why"><summary>${esc(why[0])}</summary>${why.slice(1).map(l => `<p>${esc(l)}</p>`).join('')}
        ${catRows.length ? `<ul class="cats">${catRows.map(x => { const p = x.b > 0 ? Math.min(100, Math.round(x.u / x.b * 100)) : 100; return `
          <li><div class="cat-line"><span>${CAT_NAMES[x.c.id]}</span><span class="num ${x.u > x.b ? 'bad' : ''}">${baht(x.u)} / ${baht(x.b)}</span></div>
          <div class="bar thin ${x.u > x.b ? 'over' : ''}"><span style="width:${p}%"></span></div></li>`; }).join('')}</ul>` : ''}
      </details>
      ${t.short > 0 && r.bucket > 0 ? `<button class="btn btn-ghost" data-act="cover">Use savings jar (${baht(r.bucket)}) to clear it</button>` : ''}
    </section>

    ${quickTiles()}
    ${weekCard(r)}
    </div><div class="col">

    <section class="card">
      <h2>Today</h2>
      ${todays.length ? `<ul class="tx">${todays.map(x => `
        <li><span class="tx-ic">${icon(ICON_PATH[x.cat] ? x.cat : 'other')}</span><div><strong>${esc(x.shop || 'Unknown')}</strong><span class="sub">${CAT_NAMES[x.cat] || x.cat}${x.pay === 'card' ? ' · card' : ''}${x.origin || x.source === 'sample' ? ' · <span class="src-sample">sample</span>' : ''}</span></div>
        <div class="tx-r"><span class="num ${x.cat === 'income' ? 'in' : ''}">${x.cat === 'income' ? '+' : '−'}${baht(x.amount)}</span><button class="icon-btn" data-act="del-tx" data-id="${x.id}" aria-label="Delete ${esc(x.shop)}">✕</button></div></li>`).join('')}</ul>`
        : '<p class="empty">Nothing yet today. Tap a button above to add.</p>'}
    </section>

    ${n(s.debt.balance) > 0 ? payoffCard(s, r.income) : ''}

    <details class="card more"><summary>Monthly bills <span class="num muted">${baht(fixedSum)}</span></summary>
      <ul class="fixed">
        ${s.fixed.map((f, i) => `<li><label><input type="checkbox" id="fx-${i}" data-act="paid" data-i="${i}" ${f.paid ? 'checked' : ''}> ${esc(f.name)}</label><span class="num">${baht(f.amount)}</span></li>`).join('')}
        ${debtPay > 0 ? `<li><label><input type="checkbox" id="fx-debt" data-act="paid-debt" ${s.debt.paid ? 'checked' : ''}> Credit card payment${debtPay > n(s.debt.minPay) ? ' (plan)' : ' (minimum)'}</label><span class="num">${baht(debtPay)}</span></li>` : ''}
      </ul>
      ${n(s.debt.balance) > 0 ? `<p class="debt num">Card debt ${baht(s.debt.balance)}. Interest ${n(s.debt.apr)}% a year, about ${baht(interest)} a month.</p>` : ''}
      ${cardSum > 0 ? `<p class="debt num">Card spending this month: ${baht(cardSum)}. Already taken from your daily budget. When you pay the card bill, save it as Bills so it isn't counted twice.</p>` : ''}
    </details>

    <details class="card more"><summary>How we got this number</summary>
      <dl class="num ledger">
        <dt>Income${S.incomes.length ? ' (actual)' : s.mode === 'careful' ? ' (lowest)' : ' (usual)'}</dt><dd>${baht(r.income)}</dd>
        <dt>− Bills + card payment</dt><dd>${baht(fixedSum)}</dd>
        <dt>− Safety money</dt><dd>${baht(s.reserve)}</dd>
        <dt class="strong">Spending money this month</dt><dd class="strong">${baht(r.M)}</dd>
        <dt>Savings jar</dt><dd>${baht(r.bucket)}</dd>
        <dt>Overspend to make up</dt><dd>${baht(t.Dstart)}</dd>
        ${incomeIn > 0 ? `<dt>Money in this month</dt><dd class="in">${baht(incomeIn)}</dd>` : ''}
      </dl>
    </details>

    <details class="card more demo"><summary>Demo controls (day ${r.dayIdx + 1} of ${r.days})</summary>
      <div class="row">
        <button class="btn btn-ghost" data-act="prev-day" ${r.dayIdx <= 0 ? 'disabled' : ''}>← Back 1 day</button>
        <button class="btn btn-ghost" data-act="next-day" ${r.dayIdx >= r.days - 1 ? 'disabled' : ''}>End today →</button>
      </div>
      <p class="muted small">Actual income this month</p>
      <div class="row">${[14000, 20000, 30000].map(v => `<button class="btn btn-ghost btn-small" data-act="quick-income" data-v="${v}">${baht(v)}</button>`).join('')}</div>
      <form class="row" data-form="income">
        <label class="grow" for="inc-real">Or type an amount<input id="inc-real" type="number" inputmode="numeric" min="0" step="1" placeholder="e.g. 14000" required></label>
        <button class="btn" type="submit">Update</button>
      </form>
      ${S.incomes.length ? '<button class="btn btn-link" data-act="clear-income">Remove actual income and use my usual income</button>' : ''}
    </details>
    </div></div>`;
  }
  const ICON_PATH = {
    voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
    wallet: '<path d="M4 7.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 6.5 1.5 1.5 0 0 1 5.5 5H16"/><circle cx="16" cy="14" r="1.2"/>',
    sms: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 14.5h4"/>',
    slip: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    manual: '<path d="M5 19.5 6 15 16 5l3 3-10 10z"/><path d="M14 7l3 3"/>',
    sample: '<circle cx="12" cy="12" r="3"/>',
    income: '<path d="M12 19V6M6 12l6-6 6 6"/>',
    food: '<path d="M4 12h16a8 8 0 0 1-16 0zM8.5 8.5c0-1.4 1-2 1-3.5M12.5 8.5c0-1.4 1-2 1-3.5"/>',
    coffee: '<path d="M5 9h11v4.5A5.5 5.5 0 0 1 10.5 19 5.5 5.5 0 0 1 5 13.5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M11.5 3.5v2.5"/>',
    shop: '<path d="M6 8h12l-1 12H7zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
    travel: '<circle cx="6" cy="16.5" r="3"/><circle cx="18" cy="16.5" r="3"/><path d="m6 16.5 3.5-7h5l3.5 7M8 9.5h3.5M12.5 9.5l-1.5 7"/>',
    fixed: '<path d="M4 11.5 12 4l8 7.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M10 20v-5h4v5"/>',
    transfer: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
    other: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  };
  const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATH[k] || ICON_PATH.sample}</svg>`;

  const MODES = [['voice', 'voice', 'Speak', 'Cash'], ['wallet', 'wallet', 'U-Wallet', 'Sync'], ['sms', 'sms', 'Card', 'Paste SMS'], ['slip', 'slip', 'Slip', 'Transfer']];
  // ทักทายด้วยชื่อภาษาอังกฤษจาก "My name on bank slips" (ถ้ามี)
  function helloHtml() {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const en = (S.settings.owners || []).find(o => /^[a-z]/i.test(o.trim()));
    const first = en ? en.trim().split(/\s+/)[0] : '';
    const name = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
    return `<section class="hello"><p>${greet}${name ? ',' : ''}</p><h1>${name ? esc(name) : "Here's your day"}</h1></section>`;
  }
  // 7 วันล่าสุด: ใช้ไปเทียบงบของแต่ละวัน
  function weekCard(r) {
    const end = Math.max(0, Math.min(r.dayIdx, r.hist.length - 1));
    const days = r.hist.slice(Math.max(0, end - 6), end + 1);
    if (!days.length) return '';
    const max = Math.max(1, ...days.map(h => Math.max(h.T, h.U)));
    const spent = days.reduce((a, h) => a + h.U, 0), budget = days.reduce((a, h) => a + h.T, 0);
    const bars = days.map(h => {
      const d = parseIso(dayDate(h.day));
      const cls = h.day === end ? 'today ' : '';
      return `<div class="wb ${cls}${h.U > h.T ? 'over' : 'ok'}" title="${EN_DAYS[d.getDay()]}: spent ${baht(h.U)} of ${baht(h.T)}">
        <div class="wb-track"><div class="wb-fill" style="height:${Math.round(h.U / max * 100)}%"></div><div class="wb-line" style="bottom:${Math.round(h.T / max * 100)}%"></div></div>
        <span>${h.day === end ? 'Today' : EN_DAYS[d.getDay()]}</span></div>`;
    }).join('');
    return `<section class="card week" aria-label="Spending in the last ${days.length} days">
      <div class="week-head"><h2>Last ${days.length} days</h2><span class="num ${spent > budget ? 'bad' : ''}">${baht(spent)} <span class="muted">of ${baht(budget)}</span></span></div>
      <div class="week-bars" style="grid-template-columns: repeat(${days.length}, 1fr)">${bars}</div>
      <div class="legend"><span><i class="l-ok"></i>Within budget</span><span><i class="l-over"></i>Over budget</span><span><i class="l-line"></i>Daily budget</span></div>
    </section>`;
  }
  function quickTiles(cur) {
    return `<nav class="tiles" aria-label="Add spending">${MODES.map(([m, ic, t, sub]) => `<button class="tile ${cur === m ? 'on' : ''}" data-act="add-mode" data-m="${m}" aria-pressed="${cur === m}"><span class="tile-ic">${icon(ic)}</span><span class="tile-t">${t}</span><span class="tile-s">${sub}</span></button>`).join('')}</nav>`;
  }

  /* ---------- หน้าเพิ่มสลิป ---------- */
  function sampleSlips() {
    const d = thDate(dayDate(Math.max(0, todayIdx())));
    return [
      { label: 'Paid a food stall ฿60', text: `โอนเงินสำเร็จ\n${d} 12:31 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nร้านป้าแดง ตามสั่ง\nธ.กรุงไทย\nxxx-x-x5678-x\nเลขที่รายการ: 015288123456\nจำนวน: 60.00 บาท\nค่าธรรมเนียม: 0.00 บาท` },
      { label: 'Paid a coffee shop ฿65', text: `ชำระเงินสำเร็จ\n${d} 08:02\nไปยัง\nAmazon Café\nPromptPay\nจำนวนเงิน\n65.00 บาท` },
      { label: 'Sent a friend ฿120 (with a note)', text: `โอนเงินสำเร็จ\n${d} 19:05 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nจำนวน: 120.00 บาท\nบันทึกช่วยจำ: ค่าข้าวเย็น` },
      { label: 'Friend paid me back ฿500', text: `โอนเงินสำเร็จ\n${d} 20:15 น.\nน.ส. มะลิ ดีงาม\nธ.กรุงเทพ\nxxx-x-x4321-x\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nจำนวน: 500.00 บาท\nบันทึกช่วยจำ: คืนค่าข้าว` },
      { label: 'Electricity bill ฿845', text: `ชำระเงินสำเร็จ\n${d} 09:30\nจาก\nนาย สมชาย ใจดี\nไปยัง\nการไฟฟ้านครหลวง\nจำนวน 845.00 บาท` },
      { label: 'Shopee ฿349', text: `ชำระเงินสำเร็จ\n${d} 21:40\nไปยัง SHOPEEPAY\nธ.ไทยพาณิชย์\nจำนวน 349.00 บาท` },
    ];
  }
  function sampleSms() {
    const d = parseIso(dayDate(Math.max(0, todayIdx())));
    const ds = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear() % 100).padStart(2, '0')}`;
    return [
      { label: 'Card at Shopee ฿300', text: `บัตร x1234 ใช้จ่าย 300.00 บาท ที่ SHOPEE ${ds} 12:30 วงเงินคงเหลือ 12,700.00 บาท` },
      { label: 'Card at 7-Eleven ฿85', text: `รายการใช้บัตร *1234 จำนวน 85.00 บาท ร้าน 7-ELEVEN วันที่ ${ds} 08:01` },
      { label: 'Card at Grab ฿459', text: `Card ending 1234 spent THB 459.00 at GRAB*FOOD on ${ds}` },
    ];
  }
  function readSms(text, source, msg) {
    const p = E.parseCardSms(text);
    const miss = [p.amount == null && 'the amount', !p.shop && 'the shop'].filter(Boolean);
    openDraft({ amount: p.amount, shop: p.shop, date: p.date, raw: p.raw }, source, msg || (miss.length ? `Couldn't read ${miss.join(' or ')} from the SMS. Please fill it in.` : 'SMS read. Check the numbers, then save.'), { pay: 'card', card4: p.card4 });
  }
  // รายการจำลองจาก U-Wallet (ไม่มี API จริง รูปแบบฟิลด์ดู engine.fromWallet)
  function walletSample() {
    const d = dayDate(Math.max(0, todayIdx()));
    const at = t => `${d}T${t}:00+07:00`;
    return [
      { id: 'demo-001', datetime: at('07:45'), type: 'payment', amount: 60, merchant: 'ร้านป้าแดง ตามสั่ง' },
      { id: 'demo-002', datetime: at('08:10'), type: 'payment', amount: 65, merchant: 'Amazon Café' },
      { id: 'demo-003', datetime: at('13:00'), type: 'transfer_in', amount: 1200, counterparty: 'Food delivery platform', note: 'Delivery earnings' },
      { id: 'demo-004', datetime: at('13:05'), type: 'topup', amount: 500, counterparty: 'U-Wallet top-up' },
      { id: 'demo-005', datetime: at('19:30'), type: 'payment', amount: 300, merchant: 'SHOPEE', method: 'card' },
    ];
  }
  // เพิ่มรายการ U-Wallet หนึ่งรายการ (ใช้ทั้งปุ่มดึงรายการและรายการสดที่เด้งเข้ามา)
  function addWalletRecord(rec, origin) {
    const w = E.fromWallet(rec);
    if (!w.kind || !w.amount) return { status: 'skip' };
    if (w.id && S.txns.some(x => x.extId === w.id)) return { status: 'dup' };
    let day = todayIdx();
    if (w.date) { const di = diffDays(S.settings.startDate, w.date); if (di > todayIdx()) return { status: 'skip' }; day = di; }
    let cat = w.kind === 'income' ? 'income' : 'transfer', shop = w.shop, unsure = false;
    if (w.kind === 'spend') {
      const hit = E.findShop(S.shops, S.aliases, shop, '');
      const known = S.shops[hit.key];
      if (known) shop = known.name;
      const cls = E.classify({ sender: '', shop, memo: w.memo, owners: S.settings.owners, memory: known });
      cat = cls.cat; unsure = cls.conf === 'low';
    }
    const t = { id: uid(), day, amount: w.amount, shop: shop || 'U-Wallet', cat, source: 'sample', origin: origin || 'uwallet', extId: w.id, memo: w.memo, pay: w.pay };
    S.txns.push(t);
    return { status: 'added', unsure, t };
  }
  function importWallet(recs) {
    let added = 0, dup = 0, skip = 0, unsure = 0;
    (recs || []).forEach(rec => {
      const r = addWalletRecord(rec);
      if (r.status === 'added') { added++; if (r.unsure) unsure++; } else if (r.status === 'dup') dup++; else skip++;
    });
    flash = `Added ${added} from U-Wallet (sample).` + (dup ? ` Skipped ${dup} already added.` : '') + (skip ? ` Skipped ${skip} we couldn't read.` : '') + (unsure ? ` ${unsure} may be in the wrong category.` : '');
    tab = 'today'; save(); render();
  }

  /* ---------- รายการสด: เซิร์ฟเวอร์ได้รับธุรกรรมใหม่ (จำลอง) → แอปรู้ภายใน ~2 วินาที ----------
     ของจริง: ธนาคาร/U-Wallet ส่งเหตุการณ์ (webhook) มาที่เซิร์ฟเวอร์ · เดโม: กดปุ่มในหน้า /push */
  let feedLast = null, feedTimer = null;
  function toast(msg, kind) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast show ' + (kind || '');
    el.textContent = msg;
    clearTimeout(el._t); el._t = setTimeout(() => { el.className = 'toast'; }, 5000);
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
  }
  function leftToday() { const t = calc().today; return t.T - t.U; }
  function applyLive(ev) {
    if (ev.kind === 'wallet') {
      const r = addWalletRecord({ ...ev.record, id: ev.record.id || 'live-' + ev.id, datetime: null }, 'uwallet');
      if (r.status !== 'added') return;
      save(); if (!draft) render();
      const t = r.t, left = leftToday();
      toast(`👛 U-Wallet ${t.cat === 'income' ? 'got +' : 'paid '}${baht(t.amount)} ${t.shop} · ${left < 0 ? 'over today by ' + baht(-left) : baht(left) + ' left today'}`, t.cat === 'income' ? 'in' : '');
    } else if (ev.kind === 'sms') {
      const ext = 'sms:' + ev.id;
      if (S.txns.some(x => x.extId === ext)) return;
      const p = E.parseCardSms(ev.text || '');
      if (p.amount == null) { toast('💳 New card SMS, but we couldn\'t read the amount. Go to Add → Card to type it.'); return; }
      const hit = E.findShop(S.shops, S.aliases, p.shop, ''); const known = S.shops[hit.key];
      const shop = known ? known.name : (p.shop || 'Credit card');
      const cls = E.classify({ sender: '', shop, memo: '', owners: S.settings.owners, memory: known });
      const cat = cls.cat === 'income' || cls.cat === 'transfer' ? 'other' : cls.cat;
      S.txns.push({ id: uid(), day: todayIdx(), amount: p.amount, shop, cat, source: 'sample', origin: 'sms', extId: ext, memo: '', pay: 'card', ...(p.card4 ? { card4: p.card4 } : {}), raw: ev.text });
      save(); if (!draft) render();
      const left = leftToday();
      toast(`💳 Card ${baht(p.amount)} at ${shop} · ${left < 0 ? 'over today by ' + baht(-left) : baht(left) + ' left today'}`, left < 0 ? 'bad' : '');
    }
  }
  async function pollFeed() {
    try {
      const r = await fetch('/api/feed' + (feedLast === null ? '' : '?after=' + feedLast), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (feedLast !== null) (j.events || []).forEach(applyLive); // ครั้งแรกแค่จำตำแหน่ง ไม่ย้อนเล่นของเก่า
      feedLast = j.last;
    } catch (e) {}
  }
  let cfgNow = null; // ค่าจากเซิร์ฟเวอร์ (null = ยังไม่รู้)
  async function startFeed() {
    const cfg = await serverConfig();
    cfgNow = cfg; if (tab === 'add' && !draft) render();
    if (cfg.owner && !(S.settings.owners || []).some(o => E.Rules.isOwner(cfg.owner, [o]))) { S.settings.owners = [cfg.owner].concat(S.settings.owners || []); save(); }
    if (!cfg.feed) return;
    await pollFeed();
    feedTimer = setInterval(() => { if (!document.hidden) pollFeed(); }, 2000);
  }

  /* ---------- พูดบันทึกเงินสด: ไมค์ → voice_server.py (ElevenLabs) → ตัวแยกรายการ ---------- */
  let rec = null, voiceMsg = '', lastHeard = '';
  let voiceLang = (() => { try { return localStorage.getItem('meplan-lang') || 'auto'; } catch (e) { return 'auto'; } })();
  const LANGS = [['auto', 'Auto'], ['en', 'English'], ['th', 'ไทย']];
  function setVoice(t) { voiceMsg = t; const el = $('#voice-status'); if (el) { el.textContent = t; el.hidden = !t; } }
  async function startRec() {
    if (!canLiveMic()) { setVoice('This page can\'t use the mic directly (it needs https). Use the record button instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [], mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); sendVoice(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); };
      mr.start(); rec = mr; voiceMsg = ''; render();
    } catch (e) { setVoice('Can\'t open the mic. Allow the mic in your browser, or type instead.'); }
  }
  function stopRec() { if (rec) { const r = rec; rec = null; voiceMsg = 'Turning your voice into text…'; render(); r.stop(); } }
  // ไมค์ตรงในเบราว์เซอร์ใช้ได้เฉพาะ https หรือ localhost
  const canLiveMic = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  async function sendVoice(blob, name) {
    try {
      setVoice('Turning your voice into text…');
      const res = await fetch('/api/voice', { method: 'POST', headers: { 'X-App-Pin': PIN, 'X-Lang': voiceLang, 'Content-Type': blob.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(name || '') }, body: blob });
      if (res.status === 401) throw new Error('locked');
      if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('noserver');
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || 'http');
      handleCash(j.text || '', j.items);
    } catch (e) {
      setVoice(e.message === 'voice_off' ? 'Voice is turned off on this server (no ElevenLabs key). Tap "Type instead" below.' : e.message === 'locked' ? 'Voice is locked on this public demo. Open the link you were given (it ends with ?pin=…).' : e.message === 'noserver' || String(e.message).startsWith('http') || e instanceof TypeError ? 'Voice needs the MePlan voice server. On the computer, run: python voice_server.py --port 8001. For now, tap "Type instead".' : 'Voice failed: ' + e.message);
    }
  }
  // ใช้รายการจาก LLM ถ้ามี (ตรวจยอดกับข้อความก่อน) ไม่งั้นแยกด้วยโค้ด
  function handleCash(text, llmItems) {
    const items = llmItems && llmItems.length ? E.checkVoiceItems(llmItems, text) : E.parseCashText(text).items;
    voiceMsg = '';
    if (!items.length) {
      lastHeard = text;
      voiceMsg = text ? 'We heard you, but found no amount. Fix the text below and tap Add, or say it again with the price.' : 'We didn\'t hear anything. Try again.';
      render(); return;
    }
    lastHeard = '';
    queue = items.map((it, i) => ({ it, text, n: i + 1, total: items.length }));
    nextQueued();
  }
  function nextQueued() {
    const q = queue.shift(); if (!q) return false;
    const msg = (q.total > 1 ? `Item ${q.n} of ${q.total} you said. ` : '') + (q.it.needs_review ? 'Not sure about this amount. Please check it.' : 'Check, then save.');
    openDraft({ amount: q.it.amount, shop: q.it.merchant, raw: q.text }, 'voice', msg, { pay: 'cash', forceCat: q.it.type === 'income' ? 'income' : '' });
    return true;
  }
  let addMode = 'voice';
  function viewAdd() {
    if (draft) return viewReview();
    const live = canLiveMic();
    const panels = {
      voice: `<section class="card panel">
        <p class="muted center">Paid cash? Just say it. You can say a few at once, like “coffee 50 and taxi 80”, “mom gave me 500” or “ข้าวมันไก่ 50”.</p>
        <div class="seg2 lang3" role="group" aria-label="Language you speak">${LANGS.map(([k, t]) => `<button type="button" class="${voiceLang === k ? 'on' : ''}" data-act="voice-lang" data-l="${k}" aria-pressed="${voiceLang === k}">${t}</button>`).join('')}</div>
        ${cfgNow && !cfgNow.voice ? `<p class="note">Voice isn't on for this link${cfgNow.feed ? ' (no ElevenLabs key on the server)' : ' (the voice server isn\'t running)'}. Type what you spent below instead.</p>` : ''}
        ${live ? `<button class="mic ${rec ? 'on' : ''}" data-act="voice-rec" aria-label="${rec ? 'Stop' : 'Start speaking'}">${rec ? '<span aria-hidden="true">■</span>' : icon('voice')}</button>
          <p class="center strong">${rec ? 'Listening… tap again when you finish' : 'Tap and speak'}</p>`
        : `<label class="mic" for="voice-file" aria-label="Record">${icon('voice')}<input id="voice-file" type="file" accept="audio/*" capture data-act="voice-file" hidden></label>
          <p class="center strong">Tap to record</p><p class="muted small center">Opens your phone's recorder. Tap done when you finish. To speak right here, open the app with an https link.</p>`}
        <p class="status center" id="voice-status" aria-live="polite" ${voiceMsg ? '' : 'hidden'}>${esc(voiceMsg)}</p>
        <details class="sub-more" ${(cfgNow && !cfgNow.voice) || lastHeard ? 'open' : ''}><summary>${lastHeard ? 'What we heard (you can fix it)' : 'Type instead'}</summary>
          <div class="row"><input id="cash-text" class="grow" value="${esc(lastHeard)}" placeholder="e.g. coffee 50, taxi 80" autocomplete="off" aria-label="What you spent"><button class="btn" data-act="cash-read">Add</button></div>
        </details>
      </section>`,
      wallet: `<section class="card panel">
        <p class="muted">MePlan lives inside U-Wallet. It brings in what you paid and received, so you don't have to write anything down. (This version uses sample data.)</p>
        <button class="btn btn-big" data-act="wallet-sample">Bring in today's payments</button>
        <label class="btn btn-link" for="wallet-file">Import a JSON file<input id="wallet-file" type="file" accept=".json,application/json" data-act="wallet-file" hidden></label>
      </section>`,
      sms: `<section class="card panel">
        <p class="muted">Copy the card SMS from your bank and paste it here. Today's budget updates right away.</p>
        <textarea id="sms-text" rows="3" placeholder="บัตร x1234 ใช้จ่าย 300.00 บาท ที่ SHOPEE" aria-label="SMS text"></textarea>
        <div class="row"><button class="btn btn-ghost" data-act="sms-paste">Paste</button><button class="btn grow" data-act="sms-read">Read SMS</button></div>
        <details class="sub-more"><summary>Sample SMS (demo)</summary><div class="samples">${sampleSms().map((x, i) => `<button class="btn btn-ghost" data-act="sample-sms" data-i="${i}">${esc(x.label)}</button>`).join('')}</div></details>
      </section>`,
      slip: `<section class="card panel">
        <label class="drop" for="slip-file"><span class="drop-title">Choose a slip photo</span><span class="muted small">From your photos. One at a time. We don't keep the photo.</span>
          <input id="slip-file" type="file" accept="image/*" data-act="file"></label>
        <p class="status" id="ocr-status" aria-live="polite">${esc(flash)}</p>
        <details class="sub-more"><summary>Sample slips (demo)</summary><div class="samples">${sampleSlips().map((x, i) => `<button class="btn btn-ghost" data-act="sample-slip" data-i="${i}">${esc(x.label)}</button>`).join('')}</div>
          <button class="btn btn-link" data-act="warm-ocr">Get slip reader ready</button></details>
      </section>`,
    };
    return `${quickTiles(addMode)}${panels[addMode]}
    <button class="btn btn-link center" data-act="manual">Or type it all yourself</button>`;
  }
  // เดาว่าสลิปค่าคงที่นี้คือรายการไหนในค่าคงที่ที่ตั้งไว้ (กฎกลุ่มเดียวกัน)
  function fixedGuess(cls) {
    if (cls.cat !== 'fixed') return '';
    if (cls.rule === 'debt' && E.debtPay(S.settings) > 0) return 'debt';
    const i = S.settings.fixed.findIndex(f => { const m = E.Rules.matchRule(f.name); return m && m.id === cls.rule; });
    return i >= 0 ? String(i) : '';
  }
  function openDraft(p, source, msg, extra) {
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
      pay: (extra && extra.pay) || 'cash', card4: (extra && extra.card4) || '', ref: (extra && extra.ref) || '',
    };
    if (extra && extra.forceCat) { draft.cat = extra.forceCat; draft.cls = { cat: extra.forceCat, conf: 'high', source: source === 'slip' ? 'owner' : 'voice', label: source === 'slip' ? 'you are the receiver' : 'someone gave you money' }; }
    flash = '';
    tab = 'add';
    render();
  }
  function catOptions(sel) {
    return Object.keys(CAT_NAMES).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${CAT_NAMES[k]}</option>`).join('');
  }
  const SOURCE_TXT = { voice: 'what you said', owner: 'the sender and receiver', memo: 'the slip note', memory: 'a shop you taught us', shop: 'the shop name', person: 'a person, not a shop', none: 'no rule matched' };
  function reasonBox(d) {
    const c = d.cls; if (!c) return '';
    const me = d.sender && E.Rules.isOwner(d.sender, S.settings.owners);
    return `<div class="reason conf-${c.conf}">
      ${d.sender ? `<p><span class="muted">From</span> ${esc(d.sender)}${me ? ' <span class="chip">you</span>' : ''}</p>` : ''}
      ${d.memo ? `<p><span class="muted">Note</span> “${esc(d.memo)}”</p>` : ''}
      <p><span class="muted">Based on ${SOURCE_TXT[c.source]}:</span> ${esc(c.label)} → <strong>${CAT_NAMES[c.cat]}</strong>${c.conf === 'low' ? '. Pick a category and we will remember it.' : c.conf === 'mid' ? '. Please double-check.' : ''}</p>
    </div>`;
  }
  function viewReview() {
    const d = draft, s = S.settings;
    const known = S.shops[E.shopKey(d.shop)];
    return `
    <form class="card review" data-form="review">
      <h2>Check and save</h2>
      ${d.msg ? `<p class="note">${esc(d.msg)}</p>` : ''}
      <div class="seg2" role="group" aria-label="Type"><button type="button" class="${d.cat === 'income' ? '' : 'on'}" data-act="set-type" data-t="expense" aria-pressed="${d.cat !== 'income'}">− Money out</button><button type="button" class="${d.cat === 'income' ? 'on' : ''}" data-act="set-type" data-t="income" aria-pressed="${d.cat === 'income'}">+ Money in</button></div>
      ${d.source === 'voice' ? `<p class="remember">${d.cat === 'income' ? 'Cash in' : 'Cash out'}, from your voice</p>` : ''}
      ${d.pay === 'card' ? `<p class="remember">Paid by card${d.card4 ? ` ending ${esc(d.card4)}` : ''}. Comes off today's budget now.</p>` : ''}
      <label for="rv-amount">Amount (baht)<input id="rv-amount" class="amount-in" name="amount" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(d.amount)}" required></label>
      <label for="rv-shop">${d.cat === 'income' ? 'From' : 'Shop or person'}<input id="rv-shop" name="shop" value="${esc(d.shop)}" required autocomplete="off"></label>
      ${!known && d.suggest && S.shops[d.suggest] ? `<div class="picks"><span class="muted small">You paid this account before. Same shop? Tap it. If not, just save as a new shop.</span>
        <button type="button" class="pick-chip" data-act="use-suggest">Yes, ${esc(S.shops[d.suggest].name)}</button></div>` : ''}
      ${!known && d.candidates.length ? `<div class="picks"><span class="muted small">Wrong name? Tap one we found:</span>
        ${d.candidates.map((c, i) => `<button type="button" class="pick-chip" data-act="pick-shop" data-i="${i}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${d.cat === 'income' || d.source === 'voice' ? '' : known ? `<p class="remember">We know this shop${d.via === 'acct' ? ' (from the account number)' : d.via === 'alias' ? ' (from a name you fixed)' : ''}: ${esc(known.note || CAT_NAMES[known.cat])} → ${CAT_NAMES[known.cat]}</p>` : `
      <label for="rv-note" class="first-note">New shop: what is it? (we only ask once)
        <input id="rv-note" name="note" value="${esc(d.note)}" placeholder="e.g. rice shop near home, coffee" autocomplete="off"></label>`}
      <label for="rv-cat">Category<select id="rv-cat" name="cat">${catOptions(d.cat)}</select></label>
      ${d.cat === 'fixed' ? `<label for="rv-fixed">Mark this bill as paid<select id="rv-fixed" name="fixedIdx">
        <option value="">None</option>${s.fixed.map((f, i) => `<option value="${i}" ${d.fixedIdx === String(i) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}${E.debtPay(s) > 0 ? `<option value="debt" ${d.fixedIdx === 'debt' ? 'selected' : ''}>Credit card payment</option>` : ''}</select></label>
        <p class="muted small">Bills don't come off your daily budget.</p>` : ''}
      ${d.cat === 'transfer' ? '<p class="muted small">Transfers and savings don\'t come off your daily budget.</p>' : d.cat === 'income' ? '<p class="muted small">Money in doesn\'t change today\'s budget.</p>' : ''}
      <details class="raw"><summary>Why this category? (${thDate(dayDate(d.day))})</summary>
        ${reasonBox(d)}
        <p class="muted small">From: ${SRC[d.source]}${d.day < 0 ? '. Before this month, not counted.' : ''}</p>
        ${d.raw ? `<p class="muted small">${d.pay === 'card' ? 'SMS text' : d.source === 'voice' ? 'What we heard' : 'Text we read'}</p><pre>${esc(d.raw)}</pre>
        <button type="button" class="btn btn-small btn-ghost" data-act="copy-raw">Copy text</button>` : ''}
      </details>
      <div class="sticky-actions"><button class="btn btn-ghost" type="button" data-act="cancel-draft">${queue.length ? 'Skip' : 'Cancel'}</button><button class="btn grow" type="submit">${queue.length ? 'Save and next' : 'Save'}</button></div>
    </form>`;
  }

  /* ---------- หน้าร้านที่จำ ---------- */
  function viewShops() {
    const list = Object.entries(S.shops);
    return `<section class="hello"><h1>Shops we remember</h1><p>Tell us about a shop once. Next time we sort it for you.</p></section>
      ${list.length ? `<section class="card"><ul class="shops">${list.map(([k, v]) => `
        <li data-shop="${esc(k)}"><span class="tx-ic">${icon(ICON_PATH[v.cat] ? v.cat : 'other')}</span>
          <div class="shop-name"><strong>${esc(v.name)}</strong><span class="sub">${esc(v.note || 'No note')}</span></div>
          <div class="shop-ctl"><select id="shop-${esc(k)}" data-act="shop-cat" data-k="${esc(k)}" aria-label="Category for ${esc(v.name)}">${catOptions(v.cat)}</select>
          <button class="btn btn-ghost btn-small" data-act="del-shop" data-k="${esc(k)}" aria-label="Forget ${esc(v.name)}">Forget</button></div></li>`).join('')}</ul></section>
        <button class="btn btn-link center" data-act="clear-aliases">Forget fixed names and account numbers (keep shops)</button>`
        : '<section class="card"><p class="empty">No shops yet. Add some spending and we will remember the shops.</p></section>'}`;
  }

  /* ---------- หน้าตั้งค่า ---------- */
  function viewSettings() {
    const s = S.settings;
    const f = (id, label, val, extra = '') => `<label for="${id}">${label}<input id="${id}" name="${id}" type="number" inputmode="numeric" min="0" step="1" value="${esc(val)}" ${extra}></label>`;
    return `
    <form class="block settings" data-form="settings">
      <h2>Your money setup</h2>
      <details class="card more" open><summary>Monthly income</summary><fieldset>
        <div class="grid2">${f('incomeMin', 'Lowest month', s.incomeMin)}${f('incomeNormal', 'Usual month', s.incomeNormal)}</div>
        <div class="seg" role="radiogroup" aria-label="Which income to use">
          <label><input type="radio" name="mode" value="careful" ${s.mode === 'careful' ? 'checked' : ''}> Careful (use lowest month)</label>
          <label><input type="radio" name="mode" value="normal" ${s.mode === 'normal' ? 'checked' : ''}> Usual</label>
        </div>
      </fieldset></details>
      <details class="card more"><summary>Monthly bills</summary><fieldset>
        <div id="fixed-list">${s.fixed.map((x, i) => `<div class="fx-row">
          <input id="fxn-${i}" name="fxn-${i}" value="${esc(x.name)}" aria-label="Bill name" required>
          <input id="fxa-${i}" name="fxa-${i}" type="number" inputmode="numeric" min="0" value="${esc(x.amount)}" aria-label="Amount">
          <button type="button" class="icon-btn" data-act="fx-del" data-i="${i}" aria-label="Delete ${esc(x.name)}">Delete</button></div>`).join('')}</div>
        <button type="button" class="btn btn-small btn-ghost" data-act="fx-add">+ Add a bill</button>
      </fieldset></details>
      <details class="card more"><summary>Credit card debt</summary><fieldset>
        <div class="grid2">${f('debtBalance', 'How much you owe', s.debt.balance)}
          <label for="debtApr">Interest % a year<input id="debtApr" name="debtApr" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(s.debt.apr)}"></label></div>
        <div class="grid2">${f('debtMin', 'Minimum payment', s.debt.minPay)}${f('debtPlan', 'Your plan payment', s.debt.planPay || '')}</div>
        <p class="muted small">Your plan payment is set aside before your daily budget. It can't be lower than the minimum. Leave it empty to pay the minimum. Find these numbers on your card statement.</p>
      </fieldset></details>
      <details class="card more"><summary>My name on bank slips</summary><fieldset>
        <label for="owners">Your name as it shows on slips, separated by commas (Thai and English)<input id="owners" name="owners" value="${esc((s.owners || []).join(', '))}" placeholder="สมชาย ใจดี, SOMCHAI JAIDEE" autocomplete="off"></label>
        <p class="muted small">We use this to tell money in from money out. If you are the receiver, it's money in. If you are both sender and receiver, it's a transfer between your own accounts.</p>
      </fieldset></details>
      <details class="card more"><summary>Safety money and dates</summary><fieldset>
        <div class="grid3">${f('reserve', 'Safety money', s.reserve)}${f('days', 'Days in the month', s.days, 'min="1" max="31"')}
          <label for="startDate">Start date<input id="startDate" name="startDate" type="date" value="${esc(s.startDate)}"></label></div>
        <div class="seg" role="radiogroup" aria-label="Money left at the end of the day">
          <label><input type="radio" name="leftoverMode" value="bucket" ${s.leftoverMode !== 'tomorrow' ? 'checked' : ''}> Put leftover money in the savings jar</label>
          <label><input type="radio" name="leftoverMode" value="tomorrow" ${s.leftoverMode === 'tomorrow' ? 'checked' : ''}> Add leftover money to tomorrow</label>
        </div>
      </fieldset></details>
      <details class="card more"><summary>Spending categories (top ones get cut first)</summary><fieldset>
        <div class="cat-head muted small"><span>Category</span><span>Share of daily budget</span><span>Can cut %</span><span></span></div>
        ${s.cats.map((c, i) => `<div class="cat-row"><span>${CAT_NAMES[c.id]}</span>
          <input id="cw-${c.id}" name="cw-${c.id}" type="number" min="0" value="${esc(c.weight)}" aria-label="Share for ${CAT_NAMES[c.id]}">
          <input id="cc-${c.id}" name="cc-${c.id}" type="number" min="0" max="100" value="${Math.round(c.cap * 100)}" aria-label="Can cut % for ${CAT_NAMES[c.id]}">
          <span class="ord"><button type="button" class="icon-btn" data-act="cat-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="icon-btn" data-act="cat-down" data-i="${i}" ${i === s.cats.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></span></div>`).join('')}
        <p class="muted small">Tip: keep Food last and let it be cut by 50% at most.</p>
      </fieldset></details>
      <div class="row"><button class="btn" type="submit">Save and update</button></div>
      <p class="status" aria-live="polite">${esc(flash)}</p>
    </form>
    <section class="block">
      <h2>How we sort spending <span class="muted num">${E.Rules.RULES.length} groups</span></h2>
      <p class="muted small">We check in this order: sender and receiver → slip note → shops you taught us → shop name → Other (you choose).</p>
      <details class="rules"><summary>See all groups</summary><ol>${E.Rules.RULES.map(r => `<li><strong>${esc(r.label)}</strong> → ${CAT_NAMES[r.cat]}<span class="sub">${esc(r.terms.slice(0, 8).join(', '))}${r.terms.length > 8 ? ` and ${r.terms.length - 8} more` : ''}</span></li>`).join('')}</ol></details>
    </section>
    <section class="block">
      <h2>Budget math checks</h2>
      <ul class="tests">${runTests().map(x => `<li class="${x.ok ? 'pass' : 'fail'}"><span>${x.ok ? 'Pass' : 'Fail'}</span> ${esc(x.name)}</li>`).join('')}</ul>
    </section>
    <section class="block">
      <h2>Data on this device</h2>
      <p class="muted small">Saved in this browser only. No account needed.</p>
      <p class="muted small">Both samples have the same daily spending. The only difference: card debt of 30,000 (paying 2,800 a month) and one 300 card purchase on day 3. The month started 5 days ago, so today is day 6.</p>
      <div class="row"><button class="btn btn-ghost" data-act="reset-sample" data-k="normal">Sample: no debt</button><button class="btn btn-ghost" data-act="reset-sample" data-k="debt">Sample: card debt</button></div>
      <div class="row"><button class="btn btn-ghost" data-act="clear-all">Start fresh</button></div>
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
    T('T1 First day budget = 333 (83/50/200)', () => { const r = E.replay(base(), { txns: [] }, 0); rs.push(r); return r.today.B === 333 && eq(r.today.cb, [83, 50, 200]); });
    T('T2 Overspend 100 → day 2 budget 233', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 433, cat: 'food' }] }, 1); rs.push(r); return r.today.T === 233 && eq(r.today.red, [83, 17, 0]); });
    T('T3 100 left over → savings jar 100', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 233, cat: 'food' }] }, 1); rs.push(r); return r.bucket === 100 && r.today.T === 333; });
    T('T4 Income drops to 17,000 on day 10 → 190 a day', () => { const tx = []; for (let d = 0; d < 9; d++) tx.push({ day: d, amount: 333, cat: 'food' }); const r = E.replay(base(), { txns: tx, incomes: [{ day: 9, amount: 17000 }] }, 9); rs.push(r); return r.today.B === 190 && r.D === 0; });
    T('T12 Card 300 → 33 left today', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 300, cat: 'shop', pay: 'card' }] }, 0); rs.push(r); return r.today.T - r.today.U === 33; });
    T('T13 Paying the card bill is not counted twice', () => { const r = E.replay(base(), { txns: [{ day: 0, amount: 1800, cat: 'fixed' }] }, 0); rs.push(r); return r.today.U === 0 && r.today.T === 333; });
    T('T14 Debt 30,000 at 16%: 1,500/month → 24 months, 3,000 → 11 months', () => E.payoff(30000, 16, 1500).months === 24 && E.payoff(30000, 16, 3000).months === 11 && E.payoff(30000, 16, 400) === null);
    T('T16 Card payment 1,500 → 283 a day (70/42/171)', () => { const s = base(); s.debt.minPay = 1500; const r = E.replay(s, { txns: [] }, 0); rs.push(r); return r.today.B === 283 && eq(r.today.cb, [70, 42, 171]); });
    T('T17 Plan below minimum → uses the minimum', () => { const s = base(); s.debt.minPay = 1500; s.debt.planPay = 1000; return E.debtPay(s) === 1500; });
    T('T8 Categories always add up to the daily budget', () => rs.every(r => r.hist.every(h => sumA(h.catT) === h.T)));
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
    if (!worker) { worker = await window.Tesseract.createWorker('tha+eng'); try { await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' }); } catch (e) {} }
    return worker;
  }
  function setStatus(t) { flash = t; const el = $('#ocr-status'); if (el) el.textContent = t; }
  // เตรียมรูปก่อน OCR: ขยายรูปเล็ก (สลิปจากแคปหน้าจอตัวหนังสือเล็ก) + ขาวดำ + ยืดคอนทราสต์
  async function prepImage(file, maxW) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
    const w0 = img.naturalWidth || 1;
    const k = maxW ? Math.min(1, maxW / w0) : Math.min(3, Math.max(1, 1800 / w0)); // ส่ง AI: ย่อ · OCR: ขยาย
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    if (maxW) return c; // สำหรับส่งให้ AI อ่าน ไม่ต้องแปลงสี
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data, hist = new Array(256).fill(0);
    for (let i = 0; i < px.length; i += 4) { const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0; px[i] = y; hist[y]++; }
    const tot = px.length / 4; let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc < tot * 0.02) lo = v; if (acc < tot * 0.98) hi = v; }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) { const y = Math.max(0, Math.min(255, (px[i] - lo) * 255 / span)); px[i] = px[i + 1] = px[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return c;
  }
  // ถ้าเซิร์ฟเวอร์ตั้งโมเดลอ่านรูปไว้ (SLIP_VISION_MODEL) ให้ AI อ่านก่อน ไม่งั้นใช้ OCR บนเครื่อง
  // ค่าจากเซิร์ฟเวอร์ (ถ้าเปิดผ่าน voice_server.py): อ่านสลิปบนเซิร์ฟเวอร์ได้ไหม, ฟีดรายการสด, ชื่อเจ้าของบัญชี
  let cfgP = null;
  function serverConfig() {
    if (!cfgP) cfgP = timeout(fetch('/api/config', { cache: 'no-store' }), 3000).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return cfgP;
  }
  async function readSlipServer(file, cfg) {
    const c = await prepImage(file, cfg.slipOcr ? 2000 : 1400);
    const url = c.toDataURL('image/jpeg', 0.85);
    const res = await timeout(fetch('/api/slip', { method: 'POST', headers: { 'X-App-Pin': PIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ image: url }) }), 90000);
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || 'http');
    return j;
  }
  async function readSlip(file) {
    const cfg = await serverConfig();
    if (cfg.slipOcr || cfg.slipVision) {
      try {
        setStatus(cfg.slipOcr ? (cfg.slipOcrReady === false ? 'Reading the slip (first time can be slow)…' : 'Reading the slip…') : 'AI is reading the slip…');
        const v = await readSlipServer(file, cfg);
        if (v.ref && S.txns.some(x => x.ref === v.ref)) { setStatus(`You already saved this slip (ref ${v.ref}).`); return; }
        const p = v.text ? E.parseSlip(v.text) : { candidates: [] };
        const amount = v.amount != null ? n(v.amount) : p.amount;
        // ตรวจไขว้: ยอดที่ AI บอกต้องมีอยู่ในข้อความที่ AI อ่านได้ ไม่งั้นให้ผู้ใช้ตรวจ
        const seen = v.engine === 'easyocr' || v.text && new RegExp('(^|[^\\d])' + String(amount).replace('.', '\\.') + '(\\.0+)?([^\\d]|$)').test(String(v.text).replace(/,/g, ''));
        // ผู้รับคือเรา (สลิปรับเงิน) → ชื่อที่ควรแสดงคือผู้โอน
        if (v.receiver && E.isBank(v.receiver)) v.receiver = ''; // ชื่อธนาคารไม่ใช่ผู้รับ
        if (v.sender && E.isBank(v.sender)) v.sender = '';
        const toMe = v.receiver && E.Rules.isOwner(v.receiver, S.settings.owners);
        const NOISE = /^(จาก|ถึง|ไปยัง|ไปที่|to|from)$|ธนาคาร|ออมสิน|กรุงไทย|กสิกร|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทย|ทีทีบี|ทรูมันนี|พร้อมเพย์|^ธ\./i;
        p.candidates = (p.candidates || []).filter(c => !NOISE.test(c.trim()) && !E.Rules.isOwner(c, S.settings.owners) && c !== v.receiver && c !== v.sender)
          .concat([v.receiver, v.sender].filter(x => x && !E.Rules.isOwner(x, S.settings.owners)));
        openDraft({ ...p, amount, shop: (toMe ? v.sender : v.receiver) || p.shop, sender: v.sender || p.sender, date: v.date || p.date, memo: v.memo || p.memo, raw: v.text || '' }, 'slip',
          amount == null ? 'Couldn\'t read the amount. Please fill it in.' : !seen ? 'Not sure about the amount. Check it against the slip.' : `Read your ${v.app ? v.app + ' ' : ''}slip${v.fee ? ` (fee ${baht(v.fee)} not included)` : ''}. Check the numbers, then save.`,
          { ref: v.ref || '', forceCat: toMe ? 'income' : '' });
        return;
      } catch (e) { setStatus('Server reading failed. Trying on this phone…'); }
    }
    setStatus('Reading the slip on this phone…');
    try {
      const w = await timeout(getWorker(), 60000);
      const img = await prepImage(file).catch(() => file);
      const { data } = await timeout(w.recognize(img), 45000);
      const p = E.parseSlip(data.text);
      const miss = [p.amount == null && 'the amount', !p.shop && 'the shop'].filter(Boolean);
      openDraft(p, 'slip', miss.length ? `Couldn't read ${miss.join(' or ')}. Please fill it in.` : 'Slip read. Check the numbers, then save.');
    } catch (e) {
      openDraft({}, 'slip', 'Couldn\'t read this slip. Please type the amount and shop.');
    }
  }

  /* ---------- การกระทำ ---------- */
  // PIN ของเดโมสาธารณะ: เปิดลิงก์ครั้งแรกด้วย ?pin=xxxx แล้วแอปจำไว้ในเครื่อง
  const PIN = (() => { try { const q = new URLSearchParams(location.search).get('pin'); if (q) localStorage.setItem('meplan-pin', q); return q || localStorage.getItem('meplan-pin') || ''; } catch (e) { return ''; } })();
  const uid = () => Math.random().toString(36).slice(2, 9);
  function act(a, el) {
    const s = S.settings;
    switch (a) {
      case 'go-add': tab = 'add'; break;
      case 'del-tx': S.txns = S.txns.filter(x => x.id !== el.dataset.id); break;
      case 'paid': s.fixed[+el.dataset.i].paid = el.checked; save(); return;
      case 'paid-debt': s.debt.paid = el.checked; save(); return;
      case 'cover': S.covers.push({ day: todayIdx() }); break;
      case 'next-day': S.offset = n(S.offset) + 1; break;
      case 'prev-day': S.offset = n(S.offset) - 1; break;
      case 'clear-income': S.incomes = []; break;
      case 'use-income': { const v = S.txns.filter(x => x.cat === 'income' && x.day >= 0 && x.day <= todayIdx()).reduce((a, x) => a + n(x.amount), 0); S.incomes = S.incomes.filter(e => e.day !== todayIdx()); S.incomes.push({ day: todayIdx(), amount: v }); break; }
      case 'manual': openDraft({}, 'manual'); return;
      case 'wallet-sample': importWallet(walletSample()); return;
      case 'add-mode': addMode = el.dataset.m; tab = 'add'; draft = null; queue = []; voiceMsg = ''; flash = ''; render(); window.scrollTo(0, 0); return;
      case 'quick-income': S.incomes = S.incomes.filter(e => e.day !== todayIdx()); S.incomes.push({ day: todayIdx(), amount: n(el.dataset.v) }); flash = `Income this month set to ${baht(n(el.dataset.v))}. Budget updated.`; break;
      case 'sms-paste': { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => { const el2 = $('#sms-text'); if (el2) el2.value = t; }, () => {}); return; }
      case 'set-type': {
        const f = el.form; draft.amount = f.elements.amount.value; draft.shop = f.elements.shop.value; if (f.elements.note) draft.note = f.elements.note.value;
        if (el.dataset.t === 'income') { draft.cat = 'income'; draft.cls = { cat: 'income', conf: 'high', source: 'voice', label: 'you marked it as money in' }; }
        else if (draft.cat === 'income') {
          const c = E.classify({ sender: '', shop: draft.shop, memo: draft.memo, owners: [], memory: S.shops[E.shopKey(draft.shop)] });
          draft.cls = c; draft.cat = c.cat === 'income' ? 'other' : c.cat;
        }
        render(); return;
      }
      case 'voice-rec': if (rec) stopRec(); else startRec(); return;
      case 'voice-lang': voiceLang = el.dataset.l; try { localStorage.setItem('meplan-lang', voiceLang); } catch (e) {} render(); return;
      case 'cash-read': { const v = ($('#cash-text') || {}).value || ''; if (!v.trim()) { setVoice('Type what you spent first.'); return; } handleCash(v.trim(), null); return; }
      case 'set-plan': s.debt.planPay = n(el.dataset.pay); flash = `Plan set to ${baht(s.debt.planPay)} a month. Budget updated.`; break;
      case 'sms-read': { const v = ($('#sms-text') || {}).value || ''; if (!v.trim()) { setStatus('Paste the SMS first.'); return; } readSms(v, 'sms'); return; }
      case 'sample-sms': { const x = sampleSms()[+el.dataset.i]; readSms(x.text, 'sample', 'Sample SMS, read the same way as a real one.'); return; }
      case 'sample-slip': { const x = sampleSlips()[+el.dataset.i]; openDraft(E.parseSlip(x.text), 'sample', 'Sample slip, read the same way as a real one.'); return; }
      case 'warm-ocr': setStatus('Getting the slip reader ready…'); timeout(getWorker(), 60000).then(() => setStatus('Slip reader is ready.'), () => setStatus('Couldn\'t load the slip reader here. Use a sample slip or type it.')); return;
      case 'cancel-draft': draft = null; if (queue.length) { nextQueued(); return; } break;
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
        try { navigator.clipboard.writeText(draft.raw).then(() => { el.textContent = 'Copied'; }, sel); } catch (e) { sel(); }
        return;
      }
      case 'shop-cat': {
        S.shops[el.dataset.k].cat = el.value; save();
        const li = el.closest('li'); if (li) { const ic = li.querySelector('.tx-ic'); if (ic) ic.innerHTML = icon(ICON_PATH[el.value] ? el.value : 'other'); }
        toast(`Saved: ${S.shops[el.dataset.k].name} is now ${CAT_NAMES[el.value]}`, 'in'); return;
      }
      case 'clear-aliases': S.aliases = {}; flash = ''; break;
      case 'del-shop': {
        const k = el.dataset.k, name = S.shops[k] ? S.shops[k].name : '';
        delete S.shops[k]; Object.keys(S.aliases).forEach(x => { if (x !== '__shared' && S.aliases[x] === k) delete S.aliases[x]; });
        save(); const li = el.closest('li');
        if (li && Object.keys(S.shops).length) { li.classList.add('leaving'); setTimeout(() => li.remove(), 200); } else render();
        toast(`Forgot ${name}`); return;
      }
      case 'fx-add': syncSettings(); s.fixed.push({ name: 'New bill', amount: 0, paid: false }); break;
      case 'fx-del': syncSettings(); s.fixed.splice(+el.dataset.i, 1); break;
      case 'cat-up': case 'cat-down': { syncSettings(); const i = +el.dataset.i, j = a === 'cat-up' ? i - 1 : i + 1; [s.cats[i], s.cats[j]] = [s.cats[j], s.cats[i]]; break; }
      case 'reset-sample': S = sampleState(el.dataset.k); flash = el.dataset.k === 'debt' ? 'Loaded sample: card debt.' : 'Loaded sample: no debt.'; tab = 'today'; break;
      case 'clear-all': { const st = sampleState(); st.sample = false; st.txns = []; st.shops = {}; st.settings.fixed.forEach(f => f.paid = false); S = st; tab = 'settings'; flash = 'All cleared. Set up your own numbers.'; break; }
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
    s.debt.balance = n(g('debtBalance')); s.debt.minPay = n(g('debtMin')); s.debt.apr = n(g('debtApr')); s.debt.planPay = n(g('debtPlan'));
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
      const d = S.settings.debt;
      if (n(d.planPay) > 0 && n(d.planPay) < n(d.minPay)) { d.planPay = n(d.minPay); flash = `Your plan can't be lower than the minimum, so we set it to ${baht(d.minPay)}. Budget updated.`; }
      else flash = 'Saved. Budget updated.';
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
      const edited = (draft.source === 'slip' || draft.source === 'sms' || draft.source === 'voice') && (draft.orig.amount !== amount || draft.orig.shop !== shop);
      S.txns.push({ id: uid(), day: draft.day, amount, shop, cat, source: draft.source, edited, memo: draft.memo || '', pay: draft.pay || 'cash', ...(draft.card4 ? { card4: draft.card4 } : {}), ...(draft.ref ? { ref: draft.ref } : {}) });
      draft = null; tab = 'today';
      if (queue.length) { save(); nextQueued(); return; }
    }
    save(); render();
  }

  /* ---------- วาดหน้า ---------- */
  const TABS = [['today', 'Today', '🏠'], ['add', 'Add', '➕'], ['shops', 'Shops', '🏪'], ['settings', 'Settings', '⚙️']];
  // วาดหน้าใหม่โดยไม่กระโดด: เก็บตำแหน่งเลื่อน หัวข้อที่เปิดอยู่ และช่องที่กำลังพิมพ์ ไว้เหมือนเดิม
  const detailsKey = d => d.classList.contains('why') ? 'why' : d.className + '|' + ((d.querySelector('summary') || {}).textContent || '').replace(/[\d,฿.()\-]+/g, '').trim().slice(0, 32);
  function render() {
    const views = { today: viewToday, add: viewAdd, shops: viewShops, settings: viewSettings };
    const v = $('#view'), same = v.dataset.tab === tab, y = window.scrollY;
    const open = same ? new Set([...v.querySelectorAll('details[open]')].map(detailsKey)) : null;
    const fid = same && document.activeElement && document.activeElement.id;
    v.innerHTML = views[tab]();
    v.dataset.tab = tab;
    if (open) v.querySelectorAll('details').forEach(d => { if (open.has(detailsKey(d))) d.open = true; });
    if (same) window.scrollTo(0, y);
    if (fid) { const f = document.getElementById(fid); if (f && f.focus) try { f.focus({ preventScroll: true }); } catch (e) {} }
    $('#view').className = tab === 'today' ? 'wide' : 'narrow';
    $('#date-line').textContent = `${thDate(dayDate(Math.max(0, Math.min(todayIdx(), S.settings.days - 1))))} · Day ${Math.min(Math.max(todayIdx(), 0), S.settings.days - 1) + 1} of ${S.settings.days}`;
    $('#sample-chip').hidden = !S.sample; $('#sample-chip').textContent = S.sampleKind === 'debt' ? 'Sample: card debt' : 'Sample: no debt';
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  }
  document.addEventListener('click', e => {
    const tb = e.target.closest('.tabs button');
    if (tb) { tab = tb.dataset.tab; if (tab !== 'add') { draft = null; queue = []; } flash = ''; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'file') { e.preventDefault(); act(el.dataset.act, el); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.act === 'file' && el.files && el.files[0]) { readSlip(el.files[0]); el.value = ''; return; }
    if (el.dataset.act === 'voice-file' && el.files && el.files[0]) { const f = el.files[0]; sendVoice(f, f.name); el.value = ''; return; }
    if (el.dataset.act === 'wallet-file' && el.files && el.files[0]) {
      el.files[0].text().then(txt => { const j = JSON.parse(txt); importWallet(Array.isArray(j) ? j : j.transactions || j.items || []); })
        .catch(() => setStatus('Couldn\'t read this file. It must be a U-Wallet JSON file.'));
      el.value = ''; return;
    }
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
  startFeed();
})();
