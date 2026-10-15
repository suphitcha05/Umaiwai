/* บ้านรอด AI — ชุดกฎจัดหมวดจากสลิป
   อ่าน 3 ช่อง: ผู้ส่ง, ผู้รับ/ร้าน, บันทึกช่วยจำ
   ลำดับการตัดสิน (ข้อแรกที่เข้าได้ชนะ):
     1. ทิศทางเงินจากชื่อผู้ส่ง/ผู้รับเทียบกับชื่อเจ้าของ → โอนระหว่างบัญชีตัวเอง / รายรับ
     2. บันทึกช่วยจำที่ระบุหมวดตรงๆ (เช่น "ค่ากิน", "#เดินทาง")
     3. บันทึกช่วยจำที่เข้ากฎคำหลัก
     4. ร้านที่ผู้ใช้เคยสอนแอปไว้ (ความจำร้าน / ชื่อที่เคยแก้ / เลขบัญชี)
     5. ชื่อร้านที่เข้ากฎคำหลัก (ข้ามถ้าผู้รับเป็นบุคคล เพราะชื่อคนมักชนคำหลัก)
     6. ผู้รับเป็นบุคคลและไม่มีบันทึกช่วยจำ → อื่นๆ ให้ผู้ใช้เลือก
     7. ไม่เข้ากฎใดเลย → อื่นๆ ให้ผู้ใช้เลือก
   เพิ่มกฎได้ที่ RULES: กฎบนชนะกฎล่าง คำภาษาอังกฤษจับเป็นคำทั้งคำ คำไทยจับเป็นส่วนของข้อความ */
(function (root) {
  const R = (id, cat, label, terms, extra) => ({ id, cat, label, terms, extra: extra || null });

  // หมวดที่ผู้ใช้พิมพ์ชื่อตรงๆ ในบันทึกช่วยจำ
  const EXPLICIT = [
    ['food', ['ค่ากิน', 'ค่าอาหาร', '#กิน', '#อาหาร']],
    ['coffee', ['กาแฟ', '#กาแฟ', 'ค่ากาแฟ']],
    ['travel', ['เดินทาง', 'ค่าเดินทาง', '#เดินทาง']],
    ['shop', ['ช้อปปิ้ง', '#ช้อป', '#ช้อปปิ้ง']],
    ['fixed', ['ค่าคงที่', '#คงที่', '#บิล']],
    ['transfer', ['#ออม', '#โอนตัวเอง', 'ไม่นับ']],
    ['other', ['อื่นๆ', '#อื่น']],
  ];

  const RULES = [
    // --- ไม่นับเป็นรายจ่าย ---
    R('saving', 'transfer', 'ออม/ลงทุน', ['ออมเงิน', 'เงินออม', 'เก็บเงิน', 'ฝากเงิน', 'ฝากประจำ', 'บัญชีตัวเอง', 'บัญชีออม', 'saving', 'savings', 'ลงทุน', 'กองทุน', 'ซื้อหุ้น', 'ออมทอง', 'ซื้อทอง', 'dime', 'finnomena', 'bitkub', 'binance', 'คริปโต', 'crypto']),
    R('lend', 'transfer', 'ยืม/คืนเงิน', ['ให้ยืม', 'ยืมเงิน', 'คืนเงิน', 'ใช้หนี้', 'คืนหนี้', 'ผ่อนเพื่อน']),
    R('wallet', 'transfer', 'เติมกระเป๋าเงิน', ['truemoney', 'true money', 'ทรูมันนี่', 'ทรูมันนี', 'rabbit line pay', 'แรบบิทไลน์เพย์', 'เป๋าตัง', 'paotang', 'เติมวอลเล็ท', 'เติม wallet']),
    R('family', 'other', 'ส่งเงินให้ครอบครัว', ['ให้แม่', 'ให้พ่อ', 'ส่งเงินให้', 'เงินให้ที่บ้าน', 'ค่าใช้จ่ายบ้าน', 'ค่าขนมลูก', 'ค่าขนมน้อง']),

    // --- ค่ากิน / กาแฟ ---
    R('delivery', 'food', 'สั่งอาหารเดลิเวอรี', ['grabfood', 'grab food', 'แกร็บฟู้ด', 'line man', 'lineman', 'ไลน์แมน', 'foodpanda', 'ฟู้ดแพนด้า', 'robinhood', 'โรบินฮู้ด', 'shopeefood', 'shopee food', 'ช้อปปี้ฟู้ด']),
    R('cafe', 'coffee', 'ร้านกาแฟ/ชา', ['กาแฟ', 'coffee', 'cafe', 'café', 'คาเฟ่', 'amazon', 'อเมซอน', 'starbucks', 'สตาร์บัคส์', 'inthanin', 'อินทนิล', 'black canyon', 'แบล็คแคนยอน', 'doi chaang', 'ดอยช้าง', 'wawee', 'วาวี', 'punthai', 'พันธุ์ไทย', 'chao doi', 'ชาวดอย', 'arabica', 'kudsan', 'ชานม', 'ชาไทย', 'ชาเขียว', 'ชาไข่มุก', 'ไข่มุก', 'bubble tea', 'boba', 'ชาตรามือ', 'cha tra mue', 'tiger sugar', 'koi', 'mixue', 'มิกซ์เซ่อ', 'tea']),
    R('restaurant', 'food', 'ร้านอาหาร/ของกิน', ['ค่าข้าว', 'ข้าว', 'กิน', 'อาหาร', 'มื้อ', 'กับข้าว', 'ก๋วยเตี๋ยว', 'ตามสั่ง', 'ส้มตำ', 'หมูกระทะ', 'ชาบู', 'สุกี้', 'โจ๊ก', 'บะหมี่', 'ราเมง', 'ซูชิ', 'หมูปิ้ง', 'ไก่ทอด', 'ไก่ย่าง', 'ข้าวมันไก่', 'ข้าวขาหมู', 'ผัดไทย', 'ขนม', 'ผลไม้', 'น้ำดื่ม', 'น้ำแข็ง', 'ของสด', 'ตลาดสด', 'ครัว', 'food', 'meal', 'lunch', 'dinner', 'breakfast', 'restaurant', 'kitchen', 'mk', 'เอ็มเค', 'fuji', 'ฟูจิ', 'yayoi', 'ยาโยอิ', 'sizzler', 'ซิซซ์เลอร์', 'kfc', 'เคเอฟซี', "mcdonald's", 'mcdonalds', 'แมคโดนัลด์', 'burger king', 'เบอร์เกอร์คิง', 'pizza', 'พิซซ่า', "swensen's", 'สเวนเซ่นส์', 'dairy queen', 'bonchon', 'บอนชอน', 'shabushi', 'ชาบูชิ', 'bar b q plaza', 'บาร์บีคิวพลาซ่า', 'สุกี้ตี๋น้อย', 'after you', 'อาฟเตอร์ยู', 's&p', "chester's", 'เชสเตอร์', 'texas chicken', 'subway', 'sukishi', 'โอ้กะจู๋', 'zen', 'hachiban', 'ฮะจิบัง', 'yoshinoya', 'โยชิโนยะ']),
    R('grocery', 'food', 'สะดวกซื้อ/ซูเปอร์ฯ (ส่วนใหญ่ของกิน)', ['7-eleven', '7-11', 'seven eleven', 'เซเว่น', 'familymart', 'family mart', 'แฟมิลี่มาร์ท', "lotus's", 'lotus', 'โลตัส', 'big c', 'บิ๊กซี', 'tops', 'ท็อปส์', 'makro', 'แม็คโคร', 'villa market', 'gourmet market', 'กูร์เมต์', 'cj express', 'ซีเจ', 'foodland', 'ฟู้ดแลนด์', 'maxvalu', 'แม็กซ์แวลู', 'lawson', 'ลอว์สัน', 'ร้านขายของชำ', 'ร้านชำ', 'มินิมาร์ท', 'minimart'], { conf: 'mid' }),

    // --- เดินทาง ---
    R('fuel', 'travel', 'น้ำมัน/ทางด่วน/จอดรถ', ['น้ำมัน', 'เติมน้ำมัน', 'ptt', 'ปตท', 'pt station', 'พีที', 'bangchak', 'บางจาก', 'shell', 'เชลล์', 'esso', 'เอสโซ่', 'caltex', 'คาลเท็กซ์', 'susco', 'ซัสโก้', 'ngv', 'lpg', 'ทางด่วน', 'การทางพิเศษ', 'easy pass', 'm-flow', 'จอดรถ', 'parking']),
    R('transit', 'travel', 'ขนส่งสาธารณะ', ['เดินทาง', 'bts', 'บีทีเอส', 'mrt', 'เอ็มอาร์ที', 'rabbit', 'แรบบิท', 'airport rail link', 'แอร์พอร์ตเรลลิงก์', 'การรถไฟ', 'รถไฟ', 'srt', 'ขสมก', 'รถเมล์', 'รถตู้', 'เรือด่วน', 'ค่าเรือ', 'สองแถว']),
    R('ride', 'travel', 'เรียกรถ/แท็กซี่/วิน', ['grab', 'แกร็บ', 'bolt', 'โบลท์', 'indrive', 'แท็กซี่', 'taxi', 'วินมอเตอร์ไซค์', 'มอเตอร์ไซค์รับจ้าง', 'ค่าวิน', 'ค่ารถ', 'ค่าแท็กซี่']),
    R('trip', 'travel', 'ตั๋ว/สายการบิน/จองเดินทาง', ['airasia', 'แอร์เอเชีย', 'thai lion', 'ไทยไลออนแอร์', 'nok air', 'นกแอร์', 'thai airways', 'การบินไทย', 'vietjet', 'เวียตเจ็ท', 'bangkok airways', 'บางกอกแอร์เวย์ส', 'บขส', 'นครชัยแอร์', 'สมบัติทัวร์', 'ตั๋วเครื่องบิน', 'ตั๋วรถ', 'ตั๋วรถไฟ', 'agoda', 'อโกด้า', 'booking.com', 'traveloka', 'trip.com']),
    R('car', 'travel', 'ดูแลรถ', ['ล้างรถ', 'ซ่อมรถ', 'เปลี่ยนยาง', 'ยางรถ', 'เปลี่ยนน้ำมันเครื่อง', 'b-quik', 'บี-ควิก', 'cockpit', 'ค็อกพิท', 'ต่อภาษีรถ', 'พ.ร.บ.']),

    // --- ค่าใช้จ่ายคงที่ ---
    R('housing', 'fixed', 'ค่าที่พัก', ['ค่าเช่า', 'ค่าห้อง', 'หอพัก', 'อพาร์ทเมนท์', 'อพาร์ตเมนต์', 'apartment', 'คอนโด', 'condo', 'นิติบุคคลอาคาร', 'ค่าส่วนกลาง', 'rent']),
    R('utility', 'fixed', 'ค่าไฟ/ค่าน้ำ', ['ค่าไฟ', 'การไฟฟ้า', 'กฟน', 'กฟภ', 'mea', 'pea', 'ค่าน้ำประปา', 'การประปา', 'กปน', 'กปภ', 'mwa', 'pwa'], { re: /ค่าน้ำ(?!มัน|ดื่ม|แข็ง|เต้าหู้|หวาน)/ }),
    R('telco', 'fixed', 'มือถือ/อินเทอร์เน็ต', ['ais', 'เอไอเอส', 'true', 'ทรูมูฟ', 'truemove', 'true online', 'ทรูออนไลน์', 'dtac', 'ดีแทค', '3bb', 'ทรีบีบี', 'nt', 'tot', 'internet', 'อินเทอร์เน็ต', 'เน็ตบ้าน', 'ค่าเน็ต', 'ค่าโทรศัพท์', 'ค่ามือถือ', 'เติมเงินมือถือ', 'เติมเงินโทรศัพท์']),
    R('insurance', 'fixed', 'ประกัน/ภาษี', ['ประกัน', 'เบี้ยประกัน', 'aia', 'เอไอเอ', 'เมืองไทยประกัน', 'allianz', 'อลิอันซ์', 'fwd', 'ไทยประกันชีวิต', 'กรุงเทพประกันภัย', 'ทิพยประกัน', 'วิริยะ', 'ประกันสังคม', 'ภาษี', 'สรรพากร']),
    R('debt', 'fixed', 'ผ่อน/บัตรเครดิต/สินเชื่อ', ['บัตรเครดิต', 'credit card', 'ktc', 'เคทีซี', 'first choice', 'เฟิร์สช้อยส์', 'aeon', 'อิออน', 'citi', 'ซิตี้แบงก์', 'ผ่อน', 'ค่างวด', 'งวดรถ', 'ไฟแนนซ์', 'finance', 'ลีสซิ่ง', 'leasing', 'สินเชื่อ', 'loan', 'เงินกู้', 'กยศ', 'เงินติดล้อ', 'ศรีสวัสดิ์', 'เมืองไทยแคปปิตอล']),
    R('subscription', 'fixed', 'สมาชิกรายเดือน', ['netflix', 'spotify', 'youtube premium', 'youtube', 'icloud', 'apple.com/bill', 'google one', 'disney', 'viu', 'wetv', 'iqiyi', 'prime video', 'openai', 'chatgpt', 'ค่าสมาชิก', 'subscription', 'ฟิตเนส', 'fitness', 'gym', 'ยิม']),
    R('education', 'fixed', 'การศึกษา', ['ค่าเทอม', 'ค่าเรียน', 'tuition', 'มหาวิทยาลัย', 'โรงเรียน', 'กวดวิชา']),

    // --- ช้อปปิ้ง ---
    R('online', 'shop', 'ช้อปออนไลน์', ['shopee', 'ช้อปปี้', 'shopeepay', 'lazada', 'ลาซาด้า', 'tiktok shop', 'tiktok', 'ติ๊กต็อก', 'temu', 'aliexpress', 'ซื้อของออนไลน์']),
    R('retail', 'shop', 'ห้าง/แฟชั่น/ความงาม/ของใช้', ['ช้อปปิ้ง', 'ซื้อของ', 'ของใช้', 'central', 'เซ็นทรัล', 'robinson', 'โรบินสัน', 'the mall', 'เดอะมอลล์', 'paragon', 'พารากอน', 'emporium', 'emquartier', 'terminal 21', 'mbk', 'uniqlo', 'ยูนิโคล่', 'h&m', 'zara', 'watsons', 'วัตสัน', 'boots', 'บู๊ทส์', 'eve and boy', 'beautrium', 'sephora', 'konvy', 'power buy', 'banana it', 'studio 7', 'jib', 'advice', 'homepro', 'โฮมโปร', 'index living', 'ikea', 'อิเกีย', 'thai watsadu', 'ไทวัสดุ', 'global house', 'โกลบอลเฮ้าส์', 'daiso', 'ไดโซ', 'mr. diy', 'mr.diy', 'miniso', 'muji', 'มูจิ', 'decathlon', 'supersports', 'nike', 'adidas', 'b2s', 'se-ed', 'ซีเอ็ด', 'kinokuniya', 'เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'เครื่องสำอาง', 'สกินแคร์', 'shopping', 'mall', 'store']),

    // --- อื่นๆ (ระบุชนิดไว้ในเหตุผล) ---
    R('health', 'other', 'สุขภาพ', ['โรงพยาบาล', 'รพ.', 'hospital', 'คลินิก', 'clinic', 'ร้านยา', 'ขายยา', 'เภสัช', 'pharmacy', 'ค่ายา', 'ทันตกรรม', 'ทำฟัน', 'ค่าหมอ', 'ตรวจสุขภาพ']),
    R('fun', 'other', 'บันเทิง', ['major cineplex', 'เมเจอร์', 'sf cinema', 'เอสเอฟ', 'ดูหนัง', 'ตั๋วหนัง', 'โรงหนัง', 'คอนเสิร์ต', 'concert', 'ticketmelon', 'thaiticketmajor', 'เติมเกม', 'steam', 'playstation', 'garena', 'การีน่า', 'คาราโอเกะ', 'โบว์ลิ่ง']),
    R('merit', 'other', 'ทำบุญ/งานสังคม', ['ทำบุญ', 'บริจาค', 'มูลนิธิ', 'ซองงาน', 'งานแต่ง', 'งานบวช', 'งานศพ', 'ของขวัญ', 'ใส่ซอง']),
    R('service', 'other', 'บริการส่วนตัว', ['ตัดผม', 'ร้านทำผม', 'ทำเล็บ', 'เสริมสวย', 'นวด', 'สปา', 'spa', 'ซักผ้า', 'ซักรีด', 'laundry', 'otteri']),
    R('parcel', 'other', 'ส่งพัสดุ', ['ไปรษณีย์', 'ems', 'kerry', 'เคอรี่', 'flash express', 'แฟลช', 'j&t', 'best express', 'ส่งของ', 'ค่าส่ง']),
  ];

  /* ---------- ตัวจับคำ ---------- */
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isLatin = s => /^[a-z0-9 .&'/:+-]+$/i.test(s);
  function compile(terms) {
    const parts = terms.map(t => (isLatin(t) ? `(?:^|[^a-z0-9])${escRe(t.toLowerCase())}(?![a-z0-9])` : escRe(t.toLowerCase())));
    return new RegExp(parts.join('|'), 'i');
  }
  RULES.forEach(r => { r.re = compile(r.terms); });
  const EXPL = EXPLICIT.map(([cat, terms]) => ({ cat, re: new RegExp('^\\s*(' + terms.map(escRe).join('|') + ')\\s*$', 'i'), re2: new RegExp('(?:^|\\s)(' + terms.filter(t => t.startsWith('#')).map(escRe).join('|') + ')(?:\\s|$)', 'i') }));

  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function matchRule(text) {
    const t = norm(text);
    if (!t) return null;
    const tNo = t.replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1');
    for (const r of RULES) {
      if (r.re.test(' ' + t) || r.re.test(tNo) || (r.extra && r.extra.re && r.extra.re.test(t))) return r;
    }
    return null;
  }
  function matchExplicit(memo) {
    const t = norm(memo);
    if (!t) return null;
    for (const e of EXPL) if (e.re.test(t) || e.re2.test(t)) return e.cat;
    return null;
  }

  /* ---------- ชื่อคน / ชื่อเจ้าของ ---------- */
  const TITLE_RE = /^(นาย|นางสาว|นาง|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
  const ORG_RE = /บจก|บริษัท|หจก|ห้างหุ้นส่วน|ร้าน|จำกัด|มหาชน|co\.|ltd|limited|inc\b|shop|store|สาขา|มูลนิธิ|โรงพยาบาล|การไฟฟ้า|การประปา|ธนาคาร/i;
  // 'title' = มีคำนำหน้าชื่อ (แน่ใจ), 'shape' = หน้าตาเหมือนชื่อ-นามสกุล (ใช้เมื่อไม่เข้ากฎร้าน)
  function personKind(name) {
    const n = (name || '').trim();
    if (!n || ORG_RE.test(n)) return '';
    if (TITLE_RE.test(n)) return 'title';
    return /^[\u0E00-\u0E7F]{2,}\s[\u0E00-\u0E7F]{1,}\.?$/.test(n) || /^[a-z]{2,}\s[a-z]{1,}\.?$/i.test(n) ? 'shape' : '';
  }
  const isPerson = name => !!personKind(name);
  const nameToks = s => (s || '').toLowerCase().replace(TITLE_RE, '').replace(/[.()]/g, ' ').split(/\s+/).filter(Boolean);
  // ทนชื่อที่ธนาคารปิดบางส่วน เช่น "สมชาย ใ" หรือ "somchai j"
  function sameName(a, b) {
    const x = nameToks(a), y = nameToks(b);
    if (!x.length || !y.length) return false;
    const f1 = x[0], f2 = y[0];
    if (!(f1 === f2 || (f1.length >= 3 && f2.length >= 3 && (f1.startsWith(f2) || f2.startsWith(f1))))) return false;
    if (x.length < 2 || y.length < 2) return true;
    return x[1].startsWith(y[1]) || y[1].startsWith(x[1]);
  }
  function isOwner(name, owners) { return !!name && (owners || []).some(o => sameName(name, o)); }

  /* ---------- ตัวตัดสิน ---------- */
  // ctx: { sender, shop, memo, owners: [], memory: {cat} | null }
  function classify(ctx) {
    const { sender = '', shop = '', memo = '', owners = [], memory = null } = ctx || {};
    const meSend = isOwner(sender, owners), meRecv = isOwner(shop, owners);
    if (meSend && meRecv) return { cat: 'transfer', source: 'owner', rule: 'self', label: 'โอนระหว่างบัญชีตัวเอง', conf: 'high' };
    if (meRecv) {
      const m = matchRule(memo);
      if (!sender && ((m && m.cat === 'transfer') || matchExplicit(memo) === 'transfer')) return { cat: 'transfer', source: 'owner', rule: 'self', label: 'โอนเข้าบัญชีตัวเอง (จากบันทึกช่วยจำ)', conf: 'mid' };
      return { cat: 'income', source: 'owner', rule: 'incoming', label: sender ? 'มีคนโอนเข้าบัญชีคุณ' : 'ผู้รับคือคุณ (ไม่เห็นชื่อผู้ส่ง)', conf: sender ? 'high' : 'mid' };
    }
    const ex = matchExplicit(memo);
    if (ex) return { cat: ex, source: 'memo', rule: 'explicit', label: 'ระบุหมวดในบันทึกช่วยจำ', conf: 'high' };
    const mr = matchRule(memo);
    if (mr) return { cat: mr.cat, source: 'memo', rule: mr.id, label: mr.label, conf: (mr.extra && mr.extra.conf) || 'high' };
    if (memory && memory.cat) return { cat: memory.cat, source: 'memory', rule: 'memory', label: 'ร้านที่คุณสอนไว้', conf: 'high' };
    const pk = personKind(shop);
    if (pk !== 'title') {
      const sr = matchRule(shop);
      if (sr) return { cat: sr.cat, source: 'shop', rule: sr.id, label: sr.label, conf: (sr.extra && sr.extra.conf) || (pk ? 'mid' : 'high') };
    }
    if (pk) return { cat: 'other', source: 'person', rule: 'person', label: 'โอนให้บุคคล ไม่มีบันทึกช่วยจำ', conf: 'low' };
    return { cat: 'other', source: 'none', rule: 'none', label: 'ไม่เข้ากฎใด', conf: 'low' };
  }
  function guessCat(text) { const r = matchRule(text); return r ? r.cat : 'other'; }

  const api = { RULES, EXPLICIT, classify, guessCat, matchRule, isPerson, isOwner, sameName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BanRodRules = api;
})(this);
