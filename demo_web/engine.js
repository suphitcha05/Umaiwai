/* MePlan AI — เครื่องคำนวณงบ (กติกาสโคป 3) + ตัวอ่านข้อความสลิป
   ทุกตัวเลขคำนวณด้วยโค้ดล้วน ไม่ใช้ AI */
(function (root) {
  const floor = Math.floor;
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const sum = a => a.reduce((x, y) => x + num(y), 0);

  function incomeBase(s) { return s.mode === 'careful' ? num(s.incomeMin) : num(s.incomeNormal); }
  function debtMin(s) { return num((s.debt || {}).minPay); }
  // ยอดผ่อนบัตรต่อเดือน = ยอดตามแผน แต่ห้ามต่ำกว่าขั้นต่ำ (ไม่ได้ตั้งแผน = ใช้ขั้นต่ำ)
  function debtPay(s) { return Math.max(debtMin(s), num((s.debt || {}).planPay)); }
  // ยอดผ่อนบัตรนับเป็นค่าใช้จ่ายคงที่อีกรายการ
  // รูดบัตร (pay: 'card') หักงบวันที่รูดเหมือนเงินสด จ่ายบิลบัตรลงหมวด fixed จึงไม่หักซ้ำ
  function fixedTotal(s) { return sum((s.fixed || []).map(f => f.amount)) + debtPay(s); }
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

  /* ---------- เทียบการผ่อนหนี้บัตร (ประมาณการ จ่ายเท่ากันทุกเดือน ไม่รูดเพิ่ม) ---------- */
  function payoff(balance, apr, pay) {
    let b = num(balance); const r = num(apr) / 100 / 12; pay = num(pay);
    if (b <= 0) return { months: 0, interest: 0 };
    if (pay <= 0 || pay <= Math.round(b * r * 100) / 100) return null; // จ่ายไม่พอดอกเบี้ย หนี้ไม่ลด
    let months = 0, interest = 0;
    while (b > 0.005 && months < 600) {
      const it = Math.round(b * r * 100) / 100;
      interest += it; b = b + it - pay; months++;
    }
    return months >= 600 ? null : { months, interest: Math.round(interest) };
  }

  /* ---------- ตัวอ่าน SMS รูดบัตร ---------- */
  // ยอดเงิน: ตัวเลขทศนิยม 2 ตำแหน่งตัวแรกที่ไม่ใช่วงเงินคงเหลือ
  // ร้าน: ข้อความหลัง "ที่ / ร้าน / at" จนถึงวันที่ เวลา หรือคำว่าคงเหลือ
  // เลขบัตร: เก็บเฉพาะ 4 ตัวท้าย
  const SMS_STOP = '(?=\\s+(?:\\d{1,2}[\\/\\-]\\d{1,2}|\\d{1,2}:\\d{2}|วันที่|เวลา|on\\b|วงเงิน|คงเหลือ|avail|avl|bal|limit)|\\s*$)';
  function parseCardSms(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    let amount = null;
    const re = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g; let m;
    while ((m = re.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 16), m.index);
      if (/คงเหลือ|วงเงิน|avail|avl|bal|limit/i.test(before)) continue;
      amount = parseFloat(m[1].replace(/,/g, '')); break;
    }
    const sm = text.match(new RegExp('(?:(?<!วัน)ที่|ร้าน|\\bat\\b|@)\\s*(.+?)' + SMS_STOP, 'i'));
    let shop = sm ? sm[1].replace(/[\s.,:;]+$/, '').trim() : '';
    if (/^\d/.test(shop) && !/[A-Za-z฀-๿]{2}/.test(shop)) shop = '';
    const cm = text.match(/[xX*]+[\s-]?(\d{4})\b/) || text.match(/(?:บัตร|card)\D{0,10}(\d{4})\b/i);
    const card4 = cm ? cm[1] : '';
    return { amount, shop, date: parseDate(text), card4, raw: raw || '' };
  }


  /* ---------- พูดบันทึกเงินสด: ข้อความ → รายการ (โค้ดล้วน) ----------
     ฝั่งเซิร์ฟเวอร์ (text_cleaner.py) แปลงคำตัวเลขให้แล้ว แต่ข้อความที่พิมพ์เองยังอาจเป็นคำ จึงแปลงซ้ำได้ไม่เสียหาย */
  const NUM_DIGITS = { 'ศูนย์': 0, 'หนึ่ง': 1, 'เอ็ด': 1, 'สอง': 2, 'ยี่': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9 };
  const NUM_UNITS = { 'สิบ': 10, 'ร้อย': 100, 'พัน': 1000, 'หมื่น': 10000, 'แสน': 100000 };
  const NUM_WORDS = Object.keys(NUM_DIGITS).concat(Object.keys(NUM_UNITS), ['ล้าน']).sort((a, b) => b.length - a.length);
  const NUM_RUN_RE = new RegExp('(?:' + NUM_WORDS.join('|') + ')+', 'g');
  const NUM_TOK_RE = new RegExp(NUM_WORDS.join('|'), 'g');
  const NUM_PROTECT = ['เก้าอี้', 'ห้าง', 'ยี่ห้อ', 'ยี่สุ่น', 'สามี', 'สามารถ', 'เรียบร้อย', 'ร้อยเอ็ด', 'พันธุ์', 'พันธ', 'แสนดี', 'หกล้ม', 'ล้านนา', 'สองแถว', 'สิบล้อ', 'เจ็ดเซเว่น', 'สี่แยก', 'ห้าแยก', 'สามแยก', 'สามย่าน', 'สองสาม', 'สามสี่', 'สี่ห้า', 'ห้าหก'];
  function thaiWordsToInt(run) {
    let total = 0, cur = 0, digit = null;
    for (const tok of run.match(NUM_TOK_RE) || []) {
      if (tok in NUM_DIGITS) { if (digit !== null) return null; digit = NUM_DIGITS[tok]; }
      else if (tok in NUM_UNITS) { cur += (digit === null ? 1 : digit) * NUM_UNITS[tok]; digit = null; }
      else { total = ((total + cur + (digit || 0)) || 1) * 1000000; cur = 0; digit = null; }
    }
    return total + cur + (digit || 0);
  }
  function thaiNumbers(text) {
    const saved = [];
    let t = String(text || '').replace(new RegExp(NUM_PROTECT.sort((a, b) => b.length - a.length).join('|'), 'g'), m => { saved.push(m); return '\u0000' + (saved.length - 1) + '\u0000'; });
    t = t.replace(NUM_RUN_RE, (run, off, all) => {
      const after = all.slice(off + run.length);
      if (/^[\u0E30-\u0E3A\u0E45\u0E47-\u0E4E]/.test(after)) return run;
      const toks = run.match(NUM_TOK_RE) || [];
      if (!toks.some(x => x in NUM_DIGITS || x === 'สิบ') && !/^\s*บาท/.test(after)) return run;
      const n = thaiWordsToInt(run);
      return n === null ? run : ' ' + n + ' ';
    });
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[+i]).replace(/\s+/g, ' ').trim();
  }
  const INCOME_WORDS = /(ได้รับ|ได้เงิน|ได้ค่า|รับเงิน|ค่าจ้าง|ค่ารอบ|รายได้|ขายได้|ขายของได้|ทิป|เงินเดือน)/;
  // "แม่ให้เงิน 500" = รายรับ (มีคนให้เรา) · "ให้เงินแม่ 500" / "ซื้อของให้แม่" = รายจ่าย
  const PEOPLE = 'แม่|พ่อ|น้อง|พี่|ลูก|แฟน|ยาย|ตา|ปู่|ย่า|ป้า|ลุง|น้า|อา|เพื่อน|เขา|คุณ|ลูกค้า|เจ้านาย|หัวหน้า';
  const GIVE_RE = /(ให้เงิน|โอนเงินมา|โอนมา|ให้มา|โอนให้|คืนเงิน|ให้|คืน)/;
  const AFTER_PERSON_RE = new RegExp('^(เงิน)?\\s*(' + PEOPLE + ')');
  function giveIncome(seg) {
    const m = seg.match(GIVE_RE); if (!m) return null;
    const before = seg.slice(0, m.index).trim(), after = seg.slice(m.index + m[0].length).trim();
    if (!before || /^(ฉัน|ผม|หนู|เรา|ข้า|กู)/.test(before) || /(ซื้อ|จ่าย|กิน)/.test(before)) return null;
    if (AFTER_PERSON_RE.test(after)) return null;
    return before;
  }
  const LEAD_VERB = /^(และ|แล้วก็|แล้ว|ก็|ได้รับ|ได้|จ่าย|จ่ายค่า(?=\S)|ซื้อ|กิน|เติม|ค่า(?=\s))\s*/;
  const QTY_UNIT = /^\s*(กล่อง|ชิ้น|อัน|แก้ว|จาน|ขวด|ถุง|ห่อ|ซอง|ลูก|ตัว|ที่|ชาม|กิโล|โล|คู่|แพ็ค|แพค)/;
  // "ข้าวมันไก่ 50 บาท ค่าวิน 20" → [{ข้าวมันไก่ 50}, {ค่าวิน 20}]
  /* ---------- ภาษาอังกฤษ: "fifty baht", "mom gave me 500", "spent 45 on noodles" ---------- */
  const EN_ONES = { zero: 0, a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const EN_NUM_WORD = '(?:' + Object.keys(EN_ONES).concat(Object.keys(EN_TENS), ['hundred', 'thousand']).join('|') + ')';
  const EN_RUN_RE = new RegExp('\\b' + EN_NUM_WORD + '(?:[\\s-]+(?:and[\\s-]+)?' + EN_NUM_WORD + ')*\\b', 'gi');
  function englishNumbers(text) {
    let t = String(text || '').replace(/(\d+(?:\.\d+)?)\s*k\b/gi, (_, n) => String(Math.round(parseFloat(n) * 1000)));
    return t.replace(EN_RUN_RE, run => {
      const toks = run.toLowerCase().split(/[\s-]+/).filter(w => w && w !== 'and');
      if (toks.length === 1 && toks[0] === 'a') return run; // "a" อย่างเดียวไม่ใช่ตัวเลข
      let total = 0, cur = 0, any = false;
      for (const w of toks) {
        if (w in EN_ONES) { cur += EN_ONES[w]; any = true; }
        else if (w in EN_TENS) { cur += EN_TENS[w]; any = true; }
        else if (w === 'hundred') { cur = (cur || 1) * 100; any = true; }
        else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; any = true; }
      }
      return any ? String(total + cur) : run;
    });
  }
  const EN_INCOME = /\b(got paid|get paid|got money|received|receive|salary|earned|earn|income|refund(?:ed)?|tips?|paid me|pay me|gave me|give me|gives me|sent me|send me|sends me|transferred me|bonus|sold)\b/i;
  const EN_GIVE_ME = /^(.*?)\s*\b(gave me|give me|gives me|sent me|send me|sends me|paid me|pay me|transferred me|gave|give|gives|sent|send|sends)\b/i;
  const EN_PEOPLE = /^(my\s+)?(mom|mum|mother|dad|father|parents?|wife|husband|girlfriend|boyfriend|friend|brother|sister|son|daughter|grandma|grandpa|boss|him|her|them)\b/i;
  const EN_LEAD = /^(and|then|also|so|ok|okay|um|uh|today|yesterday|this morning|tonight|i am|i'm|im|i've|i have|i|am|is|are|was|were|just|bought|buy|buying|i buy|eat|ate|eating|drink|drank|had|have|paid for|paid|pay|spent on|spent|spend|for|on|at|a|an|the|some|my)\s+/i;
  function englishGiver(seg) {
    const m = seg.match(EN_GIVE_ME); if (!m) return null;
    const before = m[1].trim(), after = seg.slice(m[0].length).trim();
    if (!before || /^(i|we)\b/i.test(before) || (/^(gave|give|gives|sent|send|sends)$/i.test(m[2]) && EN_PEOPLE.test(after))) return null;
    return before.replace(/^my\s+/i, '');
  }
  // คำว่า "บาท" ที่ระบบถอดเสียงอังกฤษเขียนต่างกัน: baht, bath, bart, bahts, ฿50, 50 THB
  const BAHT_WORDS = /\b(baht|bahts|bath|baths|bart|barts|thb|bucks?)\b/gi;
  function prepText(raw) {
    let t = englishNumbers(thaiNumbers(raw));
    t = t.replace(/฿\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 บาท').replace(BAHT_WORDS, 'บาท').replace(/(\d)\s*-\s*บาท/g, '$1 บาท');
    // "spent 45 on noodles" / "paid 300 for rent" → "noodles 45"
    t = t.replace(/\b(?:spent|paid|pay|spend)\s+(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|b)?\s+(?:on|for)\s+([^\d,.;]+?)(?=\s*(?:,|;|\.|\band\b|\bthen\b|$|\d))/gi, '$2 $1');
    return t.replace(/\s+/g, ' ').trim();
  }
  // "ข้าวมันไก่ 50 บาท ค่าวิน 20" / "coffee 50 and taxi 80" → หลายรายการ
  function parseCashText(raw) {
    const text = prepText(raw);
    const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:บาท|บ\.|baht|thb|bucks)?/gi;
    const items = []; let last = 0, m;
    while ((m = re.exec(text))) {
      const hasUnit = /บาท|บ\.|baht|thb|bucks/i.test(m[0]);
      const rest = text.slice(re.lastIndex);
      // ตัวเลขที่ตามด้วยหน่วยนับ (2 กล่อง, 2 coffees แล้วมีราคาตามมา) คือจำนวนชิ้น ไม่ใช่ราคา
      const before = text.slice(last, m.index).replace(/[,;]+/g, ' ').trim().replace(/^((and|then|also|i|just|bought|buy|got|ซื้อ|และ)\b\s*)+/i, '');
      if (!hasUnit && (QTY_UNIT.test(rest) || (!before && /^\s*[a-z]+[^\d]{0,24}\d/i.test(rest) && !/^\s*(and|then|from|on|for)\b/i.test(rest)))) continue;
      const amount = parseFloat(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
      let name = text.slice(last, m.index).replace(/[,،:;.!?]+/g, ' ').replace(/\s+/g, ' ').trim();
      last = re.lastIndex;
      if (!amount) continue;
      // "got paid 1200 from delivery" → ชื่ออยู่หลังตัวเลข
      const tail = rest.match(/^\s*(from|for|on)\s+([^\d,.;]+?)(?=\s*(?:,|;|\.|\band\b|\bthen\b|$|\d))/i);
      const giver = giveIncome(name) || englishGiver(name);
      const type = INCOME_WORDS.test(name) || EN_INCOME.test(name) || giver ? 'income' : 'expense';
      if (giver) name = giver;
      name = name.replace(EN_INCOME, '').trim();
      for (let i = 0; i < 4; i++) name = name.replace(LEAD_VERB, '').replace(EN_LEAD, '');
      name = name.replace(/\s*ละ$/, '').replace(/\s+(from|for|on|at|was|is|are|cost|costs|costed|=)$/i, '').replace(/\s+(from|for|on|at|was|is|are)$/i, '').trim();
      if (!name && tail) { name = tail[2].trim(); last = re.lastIndex + tail[0].length; re.lastIndex = last; }
      // "50 บาท coffee" → ชื่ออยู่หลังตัวเลข
      if (!name) {
        const after = rest.match(/^\s*([^\d,.;]+?)(?=\s*(?:,|;|\.|\band\b|\bthen\b|$|\d))/i);
        if (after) {
          let nm = after[1].trim();
          for (let i = 0; i < 4; i++) nm = nm.replace(LEAD_VERB, '').replace(EN_LEAD, '');
          if (nm) { name = nm; last = re.lastIndex + after[0].length; re.lastIndex = last; }
        }
      }
      items.push({ type, amount, merchant: name, needs_review: !name });
    }
    return { text, items };
  }
  // ตรวจรายการที่ LLM แยกให้: ยอดต้องปรากฏในข้อความจริง ไม่งั้นให้ผู้ใช้ตรวจ
  // และถ้าโค้ดเห็นชัดว่าเป็นรายรับ (แม่ให้เงิน, ได้ค่ารอบ) แต่ LLM บอกรายจ่าย ใช้รายรับแล้วให้ตรวจ
  function checkVoiceItems(items, text) {
    const nums = new Set(((prepText(text).match(/\d[\d,]*(?:\.\d+)?/g)) || []).map(x => parseFloat(x.replace(/,/g, ''))));
    const mine = parseCashText(text).items;
    return (items || []).filter(it => it && num(it.amount) > 0).map(it => {
      let type = it.type === 'income' ? 'income' : 'expense';
      let review = !!it.needs_review || !nums.has(num(it.amount));
      const c = mine.find(x => x.amount === num(it.amount));
      if (c && c.type !== type) { type = c.type === 'income' ? 'income' : type; review = true; }
      return { type, amount: num(it.amount), merchant: String(it.merchant || '').trim() || (c ? c.merchant : ''), needs_review: review };
    });
  }

  /* ---------- แผนปลดหนี้บัตร ---------- */
  // ผ่อนเท่ากันทุกเดือนให้หมดใน n เดือน (ปัดขึ้นเป็นหลักร้อย)
  function payFor(balance, apr, months) {
    const b = num(balance), r = num(apr) / 100 / 12;
    if (b <= 0 || months <= 0) return 0;
    const p = r > 0 ? b * r / (1 - Math.pow(1 + r, -months)) : b / months;
    return Math.ceil(p / 100) * 100;
  }
  // ตัวเลือกแผน: ผ่อนเท่าไหร่ หมดเมื่อไหร่ ดอกรวมเท่าไหร่ และงบต่อวันเหลือเท่าไหร่
  function planOptions(s, income, monthsList) {
    const d = s.debt || {}, days = Math.max(1, num(s.days));
    const inc = income == null ? incomeBase(s) : num(income);
    const base = inc - sum((s.fixed || []).map(f => f.amount)) - num(s.reserve);
    return (monthsList || [12, 24, 36]).map(months => {
      const pay = Math.max(payFor(d.balance, d.apr, months), debtMin(s));
      const p = payoff(d.balance, d.apr, pay);
      return { months: p ? p.months : months, pay, payoff: p, daily: floor((base - pay) / days) };
    }).filter((o, i, a) => a.findIndex(x => x.pay === o.pay) === i);
  }
  // สถานะหนี้: จ่ายขั้นต่ำไหวไหมจากรายได้ที่ใช้คำนวณ
  function debtCheck(s, income) {
    const d = s.debt || {};
    if (num(d.balance) <= 0) return { level: 'none' };
    const inc = income == null ? incomeBase(s) : num(income);
    const room = inc - sum((s.fixed || []).map(f => f.amount)) - debtMin(s);
    if (room < 0) return { level: 'cannot-min', short: -room };
    if (debtPay(s) <= debtMin(s)) return { level: 'min-only' };
    return { level: 'on-plan' };
  }

  /* ---------- รายการจาก U-Wallet (ข้อมูลจำลอง) ----------
     รูปแบบที่สมมติไว้: { id, datetime, type, amount, merchant | counterparty, method }
     type: payment (จ่ายร้าน) · transfer_out (โอนออก) · transfer_in (รับเงิน) · topup (เติมเงินเข้ากระเป๋า)
     ถ้า U-topia ใช้ชื่อฟิลด์อื่น แก้ที่ฟังก์ชันนี้ที่เดียว */
  function fromWallet(rec) {
    rec = rec || {};
    const type = String(rec.type || '').toLowerCase();
    const amount = Math.abs(num(rec.amount));
    const name = String(rec.merchant || rec.counterparty || rec.name || '').trim();
    const dt = String(rec.datetime || rec.date || '');
    const date = /^\d{4}-\d{2}-\d{2}/.test(dt) ? dt.slice(0, 10) : parseDate(dt);
    const kind = type === 'transfer_in' ? 'income' : type === 'topup' ? 'transfer' : (type === 'payment' || type === 'transfer_out') ? 'spend' : '';
    return { id: rec.id ? 'uw:' + rec.id : '', date, amount, shop: name, kind, pay: rec.method === 'card' ? 'card' : 'cash', memo: String(rec.note || rec.memo || '').trim() };
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
  // บรรทัดที่เป็นแค่ชื่อธนาคาร/แอป (OCR มักอ่านออกมาเป็นบรรทัดเดี่ยว เช่น "กสิกรไทย", "Krungthai") ห้ามเอาไปเป็นชื่อผู้รับ
  const BANK_NAMES = ['กสิกรไทย', 'กสิกร', 'กรุงไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงศรีอยุธยา', 'กรุงศรี', 'ทหารไทยธนชาต', 'ทหารไทย', 'ธนชาต', 'ทีทีบี', 'ออมสิน', 'อาคารสงเคราะห์', 'ธอส', 'ธกส', 'เพื่อการเกษตรและสหกรณ์การเกษตร', 'ซีไอเอ็มบี', 'ยูโอบี', 'แลนด์แอนด์เฮ้าส์', 'เกียรตินาคินภัทร', 'เกียรตินาคิน', 'ทิสโก้', 'อิสลาม', 'ทรูมันนี่', 'ทรูมันนี', 'พร้อมเพย์', 'เป๋าตัง', 'วอลเล็ท',
    'kasikornbank', 'kasikorn', 'bangkok', 'krungthep', 'kbank', 'kplus', 'k+', 'makebykbank', 'krungthai', 'ktb', 'scb', 'siamcommercial', 'scbeasy', 'bangkokbank', 'bualuang', 'bbl', 'krungsri', 'kma', 'ttb', 'tmb', 'thanachart', 'gsb', 'mymo', 'baac', 'ghb', 'cimb', 'uob', 'lhbank', 'kkp', 'tisco', 'truemoney', 'truemoneywallet', 'promptpay', 'paotang'];
  function isBank(line) {
    const l = String(line || '');
    if (BANK_RE.test(l)) return true;
    let t = l.toLowerCase().replace(/ธนาคาร|ธ\.|bank|จำกัด|\(?มหาชน\)?|public company limited|pcl|plc|wallet|[\s.\-()|:]/g, '');
    if (!t) return false;
    let hit = false;
    for (const b of BANK_NAMES) if (t.includes(b)) { t = t.split(b).join(''); hit = true; }
    return hit && t.replace(/[^a-z\u0E00-\u0E7F]/g, '').length <= 2;
  }
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
  const nameLike = l => !/^(จาก|ถึง|ไปยัง|ไปที่|ผู้รับ|ผู้โอน|from|to)\s*[:：]?$/i.test(l.trim()) && !isBank(l) && !ACCT_RE.test(l) && !SKIP_RE.test(l) && !MERCH_ID_RE.test(l) && /[A-Za-z฀-๿]{2}/.test(l) && l.length <= 60;
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
      if (!isBank(lines[j])) break;
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
      if ((isBank(next) || ACCT_RE.test(next)) && !isBank(l) && !ACCT_RE.test(l) && !SKIP_RE.test(l) && /[A-Za-z\u0E00-\u0E7F]{2}/.test(l)) names.push(cleanName(l));
    });
    return names;
  }
  function parseSender(lines, shop) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(จาก|from|ผู้โอน|ผู้ส่ง|ผู้ชำระ)\s*[:：]?\s*(.*)$/i);
      if (m) { const v = m[2].trim() || (lines[i + 1] || '').trim(); if (v && !isBank(v) && !ACCT_RE.test(v)) return cleanName(v); }
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
        const nx = lines.slice(i + 1).find(l => l && !isBank(l) && !ACCT_RE.test(l));
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

  const api = { isBank, incomeBase, debtPay, payoff, parseCardSms, fromWallet, thaiNumbers, parseCashText, englishNumbers, checkVoiceItems, payFor, planOptions, debtCheck, fixedTotal, monthPot, monthlyInterest, splitCats, reduceCats, replay, parseSlip, shopKey, findShop, learnAlias, guessCat, classify, Rules, TH_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BanRod = api;
})(this);
