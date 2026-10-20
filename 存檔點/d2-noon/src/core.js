// D2 中午存檔點（門市客服、接單員、內勤小幫手、廚房排產都上線（D2 午餐前的狀態；老闆日報與劇本是下午的事））。由課程維護者從參考解答切出來；學員不必讀它，叫 CC 從存檔點接著做即可。
// 里歐烘焙坊｜五個工位的參考解答（講師用，不進學員 repo）
// 原則：能用程式判斷的不交給小模型。產能、前置天數、加價、退訂比例、誰能做什麼，全寫在這裡的程式裡；
//       小模型（Workers AI）只在「規則文字問答」查不到時才被叫來，而且只准依規則文字回答。
// 不依賴 Cloudflare：只吃 env.DB（D1 介面）與 env.AI（可有可無）。本機 mock-server 用 node:sqlite 假裝 D1 跑同一份。
import { parseCsv } from './csv.js';

// ───────────── 規則（阿珠姨的筆記的程式版；改規則兩邊都要改） ─────────────
const SIZE = { '6吋': { price: 680, pts: 2 }, '8吋': { price: 980, pts: 3 }, '10吋': { price: 1380, pts: 5 } };
const FLAVOR = { '香草': 0, '巧克力': 0, '芒果': 100, '抹茶紅豆': 80 };
const SHAPE = { '一般': { add: 0, lead: 2, rushMin: 1 }, '進階': { add: 400, lead: 4, rushMin: 2 }, '師傅確認級': { add: 1000, lead: 7, rushMin: null } };
const BOX = { '彌月禮盒': 880, '喜餅禮盒': 1200 };
const DEPOSIT = { cake: 0.3, box: 0.5 };
const RUSH_FEE = 0.3;
const OVEN_PTS = 15, CHEF_PTS = 5, MIN_CHEFS = 2;
const CHANGE_DEADLINE_DAYS = 3;
const MATERIAL = { // 每 1 點的備料
  cake: { 麵粉kg: 0.3, 奶油kg: 0.15, 雞蛋顆: 4, 鮮奶油L: 0.2 },
  box: { 麵粉kg: 0.25, 奶油kg: 0.12, 雞蛋顆: 2, 鮮奶油L: 0 },
};
const ACTIVE = ['待收訂金', '已收訂金', '排產中'];
const STATIONS = { service: '門市客服', intake: '接單員', kitchen: '廚房排產', desk: '內勤小幫手', report: '老闆日報' };

const boxLead = (qty) => (qty <= 30 ? 5 : 10);
const boxRushMin = (qty) => (qty <= 30 ? 3 : null);
const groupFactor = (qty) => (qty >= 50 ? 0.85 : qty >= 20 ? 0.9 : 1);
const factorLabel = (f) => ({ 1: '無折扣', 0.9: '9 折', 0.85: '85 折' }[f] || `${Math.round(f * 100) / 10} 折`);

// ───────────── 小工具 ─────────────
const nt = (n) => 'NT$ ' + Number(n).toLocaleString('en-US');
const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const CN = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : CN[s] ?? NaN);
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

function parseDate(t, today) {
  if (/大後天/.test(t)) return addDays(today, 3);
  if (/後天/.test(t)) return addDays(today, 2);
  if (/明天/.test(t)) return addDays(today, 1);
  if (/今天|今日/.test(t)) return today;
  let m = t.match(/(20\d\d)-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${today.slice(0, 4)}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}
const parseSize = (t) => { const m = t.match(/(10|[68]|六|八|十)\s*(?:吋|寸)/); if (!m) return null; const n = num(m[1]); return n + '吋'; };
const parseFlavor = (t) => (t.includes('抹茶') ? '抹茶紅豆' : Object.keys(FLAVOR).find((f) => t.includes(f)) || null);
function parseShape(t) {
  if (/師傅確認|3D|人物|動物|公仔|多層|貓咪|玩偶/.test(t)) return '師傅確認級';
  if (/進階|翻糖|立體/.test(t)) return '進階';
  return '一般';
}
const parseQty = (t, units) => { const m = t.match(new RegExp('(\\d+|[一二兩三四五六七八九十])\\s*(?:' + units + ')')); return m ? num(m[1]) : null; };
const parsePhone = (t) => { const m = t.match(/09\d{2}[- ]?\d{3}[- ]?\d{3}/); if (!m) return null; const d = m[0].replace(/\D/g, ''); return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`; };
function parseName(t) {
  let m = t.match(/(?:我是|我叫|我姓)\s*([一-鿿]{1,5})/);
  if (m) { let n = m[1]; for (const stop of ['要', '想', '訂', '的', '電話', '手機']) { const i = n.indexOf(stop); if (i > 0) n = n.slice(0, i); } return n; }
  m = t.match(/([一-鿿])(小姐|先生|太太|媽媽)/);
  return m ? m[1] + m[2] : null;
}
function parseDiscount(t) {
  let m = t.match(/(\d(?:\.\d)?)\s*折/);
  if (m) { const v = Number(m[1]); return v >= 10 ? v / 100 : v >= 1 ? v / 10 : null; }
  m = t.match(/([一二兩三四五六七八九])\s*([一二三四五六七八九])?\s*折/);
  if (m) return (num(m[1]) * 10 + (m[2] ? num(m[2]) : 0)) / (m[2] ? 100 : 10);
  m = t.match(/(\d{2})\s*%/); return m ? Number(m[1]) / 100 : null;
}

// 報價（純計算，不碰資料庫）
export function quoteCake({ size, flavor = '香草', shape = '一般', qty = 1 }) {
  const s = SIZE[size]; if (!s) return null;
  const unit = s.price + (FLAVOR[flavor] ?? 0) + SHAPE[shape].add;
  const amount = unit * qty;
  return { unit, qty, amount, deposit: Math.round(amount * DEPOSIT.cake), points: s.pts * qty, lead: SHAPE[shape].lead, rushMin: SHAPE[shape].rushMin, type: 'cake', rate: DEPOSIT.cake };
}
export function quoteBox({ kind, qty }) {
  const p = BOX[kind]; if (!p) return null;
  const f = groupFactor(qty); const amount = Math.round(p * qty * f);
  return { unit: p, qty, factor: f, list: p * qty, amount, deposit: Math.round(amount * DEPOSIT.box), points: qty, lead: boxLead(qty), rushMin: boxRushMin(qty), type: 'box', rate: DEPOSIT.box };
}

// ───────────── 資料庫 ─────────────
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, type TEXT, customer_id TEXT, item TEXT, size TEXT, flavor TEXT, shape TEXT, qty INTEGER, points INTEGER, amount INTEGER, deposit INTEGER, status TEXT, order_date TEXT, due_date TEXT, rush INTEGER DEFAULT 0, note TEXT DEFAULT \'\', refund INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, name TEXT, phone TEXT, kind TEXT, note TEXT)',
  'CREATE TABLE IF NOT EXISTS requests (request_id TEXT PRIMARY KEY, customer_name TEXT, phone TEXT, type TEXT, item TEXT, size TEXT, flavor TEXT, shape TEXT, qty INTEGER, due_date TEXT, status TEXT, chef_ok INTEGER DEFAULT 0, order_id TEXT, day TEXT)',
  'CREATE TABLE IF NOT EXISTS approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target TEXT, summary TEXT, detail TEXT, status TEXT, requested_by TEXT, day TEXT, decided_at TEXT)',
  'CREATE TABLE IF NOT EXISTS equipment (equipment_id TEXT PRIMARY KEY, name TEXT, kind TEXT, status TEXT, fault_date TEXT, note TEXT DEFAULT \'\')',
  'CREATE TABLE IF NOT EXISTS shifts (date TEXT, staff_id TEXT, status TEXT, PRIMARY KEY (date, staff_id))',
  'CREATE TABLE IF NOT EXISTS clock (date TEXT, staff_id TEXT, clock_in TEXT, clock_out TEXT, PRIMARY KEY (date, staff_id))',
  'CREATE TABLE IF NOT EXISTS work_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, station TEXT, actor TEXT, action TEXT, target TEXT, result TEXT, summary TEXT, data TEXT)',
];

export function createApp(data) {
  const products = parseCsv(data.products);
  const staff = parseCsv(data.staff);
  const csvOrders = parseCsv(data.orders), csvCustomers = parseCsv(data.customers);
  const csvEquip = parseCsv(data.equipment), csvShifts = parseCsv(data.shifts);
  const staffByName = (n) => { if (!n) return null; n = String(n).trim(); return staff.find((s) => s.name === n || (n === '店長' && s.role === '店長')) || null; };
  const chefs = staff.filter((s) => s.role === '師傅');

  const today = (env) => env.SHOP_TODAY || '2026-10-21';
  const P = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
  const one = (env, sql, ...a) => P(env, sql, ...a).first();
  const all = async (env, sql, ...a) => (await P(env, sql, ...a).all()).results || [];
  const run = (env, sql, ...a) => P(env, sql, ...a).run();

  let ready = false;
  async function ensure(env) {
    if (ready) return;
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    const { n } = await one(env, 'SELECT COUNT(*) AS n FROM orders');
    if (n === 0) await reset(env);
    ready = true;
  }
  async function reset(env) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    const st = ['orders', 'customers', 'requests', 'approvals', 'equipment', 'shifts', 'clock', 'work_log'].map((t) => P(env, `DELETE FROM ${t}`));
    for (const o of csvOrders) st.push(P(env, 'INSERT INTO orders (order_id,type,customer_id,item,size,flavor,shape,qty,points,amount,deposit,status,order_date,due_date,rush,note,refund) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)',
      o.order_id, o.type, o.customer_id, o.item, o.size, o.flavor, o.shape, Number(o.qty), Number(o.points), Number(o.amount), Number(o.deposit), o.status, o.order_date, o.due_date, Number(o.rush), o.note));
    for (const c of csvCustomers) st.push(P(env, 'INSERT INTO customers VALUES (?,?,?,?,?)', c.customer_id, c.name, c.phone, c.kind, c.note));
    for (const e of csvEquip) st.push(P(env, 'INSERT INTO equipment (equipment_id,name,kind,status,fault_date,note) VALUES (?,?,?,?,NULL,\'\')', e.equipment_id, e.name, e.kind, e.status));
    for (const s of csvShifts) st.push(P(env, 'INSERT INTO shifts VALUES (?,?,?)', s.date, s.staff_id, s.status));
    await env.DB.batch(st);
  }

  // ───────────── 工作日誌（五個工位每個動作都記） ─────────────
  async function log(env, station, actor, action, target, result, summary, d = {}) {
    await run(env, 'INSERT INTO work_log (ts,day,station,actor,action,target,result,summary,data) VALUES (?,?,?,?,?,?,?,?,?)',
      new Date().toISOString(), today(env), station, actor || '', action, target || '', result, summary, JSON.stringify(d));
  }
  const ok = async (env, st, actor, action, target, summary, d) => log(env, st, actor, action, target, 'ok', summary, d);
  const blocked = async (env, st, actor, action, target, summary, d) => log(env, st, actor, action, target, 'blocked', summary, d);

  // ───────────── 產能與排產 ─────────────
  async function capacity(env, date) {
    const ovens = (await all(env, "SELECT * FROM equipment WHERE kind='烤箱'"));
    const ovensOk = ovens.filter((e) => !(e.status === '報修中' && e.fault_date && e.fault_date <= date)).length;
    const off = new Set((await all(env, "SELECT staff_id FROM shifts WHERE date=? AND status='休'", date)).map((r) => r.staff_id));
    const present = chefs.filter((c) => !off.has(c.staff_id));
    return { date, ovens_total: ovens.length, ovens_ok: ovensOk, chefs_present: present.length, chef_names: present.map((c) => c.name), capacity: ovensOk * OVEN_PTS + present.length * CHEF_PTS };
  }
  async function usedPoints(env, date, exceptId) {
    const r = await one(env, `SELECT COALESCE(SUM(points),0) AS n FROM orders WHERE due_date=? AND status IN ('待收訂金','已收訂金','排產中') AND order_id<>?`, date, exceptId || '');
    return r.n;
  }
  async function schedule(env, date) {
    const cap = await capacity(env, date);
    const lines = await all(env, `SELECT o.order_id, o.type, o.item, o.qty, o.points, o.status, c.name AS customer FROM orders o LEFT JOIN customers c ON c.customer_id=o.customer_id WHERE o.due_date=? AND o.status IN ('待收訂金','已收訂金','排產中') ORDER BY o.order_id`, date);
    const used = lines.reduce((a, l) => a + l.points, 0);
    const mat = {};
    for (const l of lines) for (const [k, v] of Object.entries(MATERIAL[l.type])) mat[k] = Math.round(((mat[k] || 0) + v * l.points) * 100) / 100;
    return { ...cap, used, over: Math.max(0, used - cap.capacity), is_over: used > cap.capacity, lines, materials: mat };
  }
  async function nextFreeDate(env, from, need) {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(from, i); const c = await capacity(env, d);
      if (c.capacity - (await usedPoints(env, d)) >= need) return d;
    }
    return null;
  }

  // ───────────── 共用查詢 ─────────────
  const getOrder = (env, id) => one(env, 'SELECT o.*, c.name AS customer FROM orders o LEFT JOIN customers c ON c.customer_id=o.customer_id WHERE o.order_id=?', id);
  async function nextId(env, table, col, prefix, width) {
    const r = await all(env, `SELECT ${col} AS id FROM ${table} WHERE ${col} LIKE ?`, prefix + '%');
    const mx = r.reduce((a, x) => Math.max(a, Number(String(x.id).slice(prefix.length)) || 0), 0);
    return prefix + String(mx + 1).padStart(width, '0');
  }
  async function addApproval(env, kind, target, summary, d, who, station) {
    const dup = await one(env, "SELECT id FROM approvals WHERE kind=? AND target=? AND status='待核准'", kind, target);
    if (dup) return { dup: dup.id };
    const r = await run(env, 'INSERT INTO approvals (kind,target,summary,detail,status,requested_by,day) VALUES (?,?,?,?,?,?,?)', kind, target, summary, JSON.stringify(d), '待核准', who || '', today(env));
    const id = r.meta?.last_row_id;
    await log(env, station, who, 'request_approval', target, 'pending', `${kind}申請：${summary}`, { approval_id: id, kind, ...d });
    return { id };
  }
  const orderText = (o) => `${o.order_id}（${o.customer || o.customer_id}，${o.item}${o.type === 'box' ? ' ×' + o.qty : o.qty > 1 ? ' ×' + o.qty : ''}）`;

  // ═════════════ 工位一：門市客服（對外） ═════════════
  const FAQ = [
    [/營業|開門|幾點|地址|門市在哪|哪裡買/, () => '中山店、大安店每天 08:00–20:00 營業。定做的蛋糕與禮盒到門市取貨，取貨日以訂單約定為準。'],
    [/團購|團訂|折扣|優惠|折數/, () => '禮盒團購折扣：20 盒以上 9 折、50 盒以上 85 折。客製蛋糕沒有折扣。表外的折扣我不能答應，需要店長核准。'],
    [/退訂|退款|退錢|取消|不要了/, () => '退訂規則：離交期 7 天（含）以上，退全額訂金；3–6 天，退訂金的一半；2 天內，訂金不退。取消要由接單員送出申請、店長核准後才生效。'],
    [/改單|改訂單|更改|換口味|改口味|改日期|改尺寸/, () => `改單截止是交期前 ${CHANGE_DEADLINE_DAYS} 天（含當天往前算）；過了截止就不能改，請改由退訂重訂處理。`],
    [/訂金|預付|付多少/, () => '訂金：客製蛋糕 3 成，團訂禮盒 5 成，成立訂單後收取。'],
    [/加急|趕單|來不及|急單|趕時間/, () => `前置天數不足就算加急：加急費 ${RUSH_FEE * 100}%，要店長核准。一般造型最短 1 天、進階造型最短 2 天、禮盒（30 盒以內）最短 3 天；師傅確認級造型與超過 30 盒的禮盒不收加急。`],
    [/提前|前置|多久|幾天|多早|什麼時候要訂|要訂多久/, () => `前置天數：一般造型 ${SHAPE['一般'].lead} 天、進階造型 ${SHAPE['進階'].lead} 天、師傅確認級造型 ${SHAPE['師傅確認級'].lead} 天；禮盒 30 盒以內 5 天、超過 30 盒 10 天。少於前置天數就是加急。`],
    [/尺寸|口味|造型|選項|客製有什麼|可以選/, () => '客製蛋糕選項：尺寸 6 吋 NT$ 680、8 吋 NT$ 980、10 吋 NT$ 1,380；口味 香草、巧克力（+0）、芒果（+100，季節限定）、抹茶紅豆（+80）；造型 一般（+0）、進階（+400）、師傅確認級（+1,000，例如 3D 人物動物，要師傅確認才接）。'],
  ];

  async function aiAsk(env, question) {
    if (!env.AI) return null;
    const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: '你是里歐烘焙坊的門市客服。只能依下面「店的規則」用繁體中文一句話回答，並沿用規則裡的用詞；規則沒提到就說「這個我查不到，請洽門市」。不准答應折扣、不准查別人的訂單。\n\n店的規則：\n' + data.rules },
        { role: 'user', content: question },
      ],
      max_tokens: 200,
    });
    return String(out.response || '').trim() || null;
  }

  async function takeRequest(env, t, actor) {
    const name = parseName(t), phone = parsePhone(t), due = parseDate(t, today(env));
    const isBox = /禮盒/.test(t);
    const size = parseSize(t), qty = parseQty(t, isBox ? '盒|份' : '個|顆|份|盒');
    const miss = [];
    if (!isBox && !size) miss.push('尺寸（6 吋、8 吋或 10 吋）');
    if (isBox && !qty) miss.push('要幾盒');
    if (!due) miss.push('取貨日期');
    if (!name) miss.push('怎麼稱呼');
    if (!phone) miss.push('聯絡電話');
    if (miss.length) { await ok(env, 'service', actor, 'ask_missing', '', `需求還缺：${miss.join('、')}`); return `想幫你記下需求，還需要：${miss.join('、')}。`; }
    let spec, q;
    if (isBox) {
      const kind = /喜餅/.test(t) ? '喜餅禮盒' : '彌月禮盒'; q = quoteBox({ kind, qty });
      spec = { type: 'box', item: kind, size: '', flavor: '', shape: '', qty };
    } else {
      const flavor = parseFlavor(t) || '香草', shape = parseShape(t), n = qty || 1;
      q = quoteCake({ size, flavor, shape, qty: n });
      if (!q) return `我們沒有 ${size} 的尺寸，客製蛋糕有 6 吋、8 吋、10 吋。`;
      spec = { type: 'cake', item: `${size}${flavor}蛋糕（${shape}造型）`, size, flavor, shape, qty: n };
    }
    const id = await nextId(env, 'requests', 'request_id', 'R-', 3);
    await run(env, 'INSERT INTO requests (request_id,customer_name,phone,type,item,size,flavor,shape,qty,due_date,status,chef_ok,order_id,day) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,\'\',?)',
      id, name, phone, spec.type, spec.item, spec.size, spec.flavor, spec.shape, spec.qty, due, '待轉單', today(env));
    await ok(env, 'service', actor, 'take_request', id, `收下需求 ${id}：${name} ${spec.item}×${spec.qty} 取貨 ${due}，報價 ${nt(q.amount)}`, { request_id: id, amount: q.amount, due });
    const need = spec.shape === '師傅確認級' ? '這個造型要師傅確認才接，確認前不會成立訂單。' : '';
    return `已收下需求 ${id}：${name}，${spec.item}×${spec.qty}，${md(due)} 取貨，報價 ${nt(q.amount)}（訂金 ${nt(q.deposit)}）。接單員會確認產能與交期，成立訂單後再通知你付訂金。${need}`;
  }

  async function serviceChat(env, t, actor) {
    // 1. 擋：折扣、查別人的訂單／個資、替店裡做決定
    if (/(算我|給我|幫我|可以|能不能|能否|打個|打|殺價|再|少算|便宜).{0,6}(折|便宜|優惠)|殺價|算便宜/.test(t) && !/有.{0,3}(折扣|優惠)嗎|折扣是|團購折扣/.test(t)) {
      await blocked(env, 'service', actor, 'refuse_discount', '', `客人要折扣，客服不能答應：「${t.slice(0, 40)}」`);
      return '折扣我沒辦法答應：只有禮盒團購折扣（20 盒以上 9 折、50 盒以上 85 折）可以直接算，其他折扣要店長核准，我可以幫你記下，由店長決定。';
    }
    if (/LEO-\d{4}-\d{3}|(查|看|問).{0,6}(訂單|電話|客人|資料)|別人的|誰訂的/.test(t)) {
      await blocked(env, 'service', actor, 'refuse_lookup', '', `客人要查訂單／個資，客服沒有這個能力：「${t.slice(0, 40)}」`);
      return '為了保護客人資料，我不能查或透露任何訂單內容與電話。訂單進度請洽門市，由店員確認你的身分後協助。';
    }
    if (/(刪除|刪掉|直接核准|核准|幫我改價|改價格)/.test(t)) {
      await blocked(env, 'service', actor, 'refuse_action', '', `客服沒有這個能力：「${t.slice(0, 40)}」`);
      return '這個我不能做：客服只能回答問題、報價、收下需求。刪除、核准、改價都不在我的權限內。';
    }
    // 2. 報價（有尺寸或說到禮盒，且在問價）
    const asksPrice = /多少錢|價格|價錢|報價|幾元|費用|怎麼算|多少/.test(t);
    if (/禮盒/.test(t) && asksPrice) {
      const kind = /喜餅/.test(t) ? '喜餅禮盒' : '彌月禮盒'; const qty = parseQty(t, '盒|份') || 1; const q = quoteBox({ kind, qty });
      await ok(env, 'service', actor, 'quote_box', kind, `${kind}×${qty} 報價 ${nt(q.amount)}`, { qty, amount: q.amount });
      const disc = q.factor < 1 ? `，已套用團購 ${factorLabel(q.factor)}（原價 ${nt(q.list)}）` : '';
      return `${kind} 每盒 ${nt(q.unit)}，${qty} 盒共 ${nt(q.amount)}${disc}；訂金 5 成 ${nt(q.deposit)}；前置 ${q.lead} 天。`;
    }
    const size = parseSize(t);
    if (size && asksPrice && !/禮盒/.test(t)) {
      const flavor = parseFlavor(t) || '香草', shape = parseShape(t), qty = parseQty(t, '個|顆') || 1;
      const q = quoteCake({ size, flavor, shape, qty });
      if (!q) return `我們沒有 ${size} 的尺寸，客製蛋糕有 6 吋、8 吋、10 吋。`;
      await ok(env, 'service', actor, 'quote_cake', size, `${size}${flavor}${shape}報價 ${nt(q.amount)}`, { amount: q.amount, shape });
      const extra = shape === '師傅確認級' ? '這個造型要師傅確認才接，確認後才能下單；' : '';
      return `${size} ${flavor}蛋糕、${shape}造型，每個 ${nt(q.unit)}（尺寸 ${nt(SIZE[size].price)}${FLAVOR[flavor] ? `＋口味 ${FLAVOR[flavor]}` : ''}${SHAPE[shape].add ? `＋造型 ${SHAPE[shape].add}` : ''}）${qty > 1 ? `，${qty} 個共 ${nt(q.amount)}` : ''}。${extra}訂金 3 成 ${nt(q.deposit)}；前置 ${q.lead} 天。`;
    }
    // 3. 下單（收下需求）
    if (/(要訂|想訂|幫我訂|預訂|訂一個|訂兩個|下單|我要.{0,6}(蛋糕|禮盒))/.test(t)) return takeRequest(env, t, actor);
    // 4. 品項、過敏原
    // 品項比對：全名，或「別名」前面沒有別的修飾字（「原味可頌」不是「可頌」，不能答成巧克力可頌）
    const aliasAt = (p) => { if (!p.alias) return -1; let i = t.indexOf(p.alias); while (i >= 0) { const prev = t[i - 1]; if (!prev || !/[一-鿿]/.test(prev) || /[的個塊片吃買有賣要訂這那款種]/.test(prev)) return i; i = t.indexOf(p.alias, i + 1); } return -1; };
    const hit = products.filter((p) => t.includes(p.name) || aliasAt(p) >= 0);
    const near = hit.length ? [] : products.filter((p) => p.alias && t.includes(p.alias));
    if (near.length) {
      const p = near[0]; const i = t.indexOf(p.alias); const phrase = (t.slice(Math.max(0, i - 2), i).match(/[一-鿿]*$/)?.[0] || '') + p.alias;
      await ok(env, 'service', actor, 'not_found', phrase, `客人問「${phrase}」，店裡沒有，近似品項：${p.name}`);
      return `我們沒有「${phrase}」。最接近的是「${p.name}」（NT$ ${p.price}，含：${p.allergens}）。要問它的話再告訴我。`;
    }
    const allergy = /過敏|含有|堅果|麩質|芝麻|大豆|成分|吃素|蛋奶/.test(t);
    if (hit.length && (allergy || !asksPrice)) {
      await ok(env, 'service', actor, 'allergen', hit.map((p) => p.name).join('、'), `查品項過敏原：${hit.map((p) => p.name).join('、')}`);
      return hit.map((p) => `「${p.name}」含：${p.allergens}。NT$ ${p.price}，每天 ${p.daily_output} 個。`).join('\n');
    }
    if (hit.length) {
      await ok(env, 'service', actor, 'price', hit.map((p) => p.name).join('、'), `查品項價格：${hit.map((p) => p.name).join('、')}`);
      return hit.map((p) => `「${p.name}」NT$ ${p.price}，每天 ${p.daily_output} 個。`).join('\n');
    }
    const kw = ['堅果', '芝麻', '大豆', '麩質', '蛋', '乳'].find((k) => t.includes(k));
    if (allergy && kw) {
      const list = products.filter((p) => p.allergens.includes(kw));
      await ok(env, 'service', actor, 'allergen_search', kw, `查含「${kw}」的品項`);
      return list.length ? `含「${kw}」的門市品項：${list.map((p) => p.name).join('、')}。` : `門市品項裡沒有含「${kw}」的。`;
    }
    if (/有什麼|有哪些|品項|賣什麼|菜單/.test(t)) {
      await ok(env, 'service', actor, 'menu', '', '列門市品項');
      return '門市每天出爐：' + products.map((p) => `${p.name} NT$ ${p.price}`).join('、') + '。另有客製蛋糕、彌月禮盒與喜餅禮盒可預訂。';
    }
    // 5. 規則問答：先用程式查固定答案，查不到才問小模型
    for (const [re, f] of FAQ) if (re.test(t)) { await ok(env, 'service', actor, 'faq', '', `回答規則問題：「${t.slice(0, 30)}」`); return f(); }
    const ai = await aiAsk(env, t).catch(() => null);
    if (ai) { await ok(env, 'service', actor, 'ai_answer', '', `小模型依規則回答：「${t.slice(0, 30)}」`); return ai; }
    await ok(env, 'service', actor, 'not_found', '', `查不到：「${t.slice(0, 30)}」`);
    return '這個我查不到，請洽門市，或換個方式問我（品項、過敏原、客製報價、前置天數、退訂規則）。';
  }

  // ═════════════ 工位二：接單員（內部） ═════════════
  async function leadCheck(env, q, due) {
    const earliest = addDays(today(env), q.lead);
    return due >= earliest ? { ok: true } : { ok: false, earliest };
  }

  async function convertRequest(env, t, actor) {
    const rid = (t.match(/R-\d{3,}/i) || [])[0]?.toUpperCase();
    const r = rid && (await one(env, 'SELECT * FROM requests WHERE request_id=?', rid));
    if (!r) return rid ? `查不到需求 ${rid}。` : '請告訴我要轉哪一張需求（例如 R-001）。';
    if (r.status === '已轉單') return `需求 ${rid} 已經轉成訂單 ${r.order_id}。`;
    const due = parseDate(t.replace(rid, ''), today(env)) || r.due_date;
    const q = r.type === 'box' ? quoteBox({ kind: r.item, qty: r.qty }) : quoteCake({ size: r.size, flavor: r.flavor, shape: r.shape, qty: r.qty });
    if (r.shape === '師傅確認級' && !r.chef_ok) {
      await blocked(env, 'intake', actor, 'convert_order', rid, `${rid} 是師傅確認級造型，師傅還沒確認，不能轉單`);
      return `${rid} 是「師傅確認級」造型，要師傅確認做得出來才能成立訂單。請師傅看過後說「師傅確認過 ${rid} 了」，我再轉單。`;
    }
    const lead = await leadCheck(env, q, due);
    if (!lead.ok) {
      await blocked(env, 'intake', actor, 'convert_order', rid, `${rid} 前置天數不夠：要 ${md(due)} 交，最快 ${md(lead.earliest)}`);
      return `前置天數不夠：${r.item} 要 ${q.lead} 天，最快 ${md(lead.earliest)} 才交得了，你要的是 ${md(due)}。可以改成「把 ${rid} 轉成訂單，交期 ${md(lead.earliest)}」；要提早，先成立訂單，再用「訂單 ○○ 提前到 ${md(due)} 加急」送店長核准。`;
    }
    const cap = await capacity(env, due), used = await usedPoints(env, due);
    if (used + q.points > cap.capacity) {
      const alt = await nextFreeDate(env, due, q.points);
      await blocked(env, 'intake', actor, 'convert_order', rid, `${rid} ${md(due)} 產能不夠：已排 ${used}＋這張 ${q.points} > 產能 ${cap.capacity}`);
      return `${md(due)} 產能不夠：產能 ${cap.capacity} 點，已排 ${used} 點，這張要 ${q.points} 點。${alt ? `最近有空的日子是 ${md(alt)}，要改成那天嗎？` : '兩週內都排滿了。'}`;
    }
    let cust = await one(env, 'SELECT * FROM customers WHERE phone=?', r.phone);
    if (!cust) {
      const cid = await nextId(env, 'customers', 'customer_id', 'C', 2);
      await run(env, 'INSERT INTO customers VALUES (?,?,?,?,?)', cid, r.customer_name, r.phone, '個人', '');
      cust = { customer_id: cid };
    }
    const oid = await nextId(env, 'orders', 'order_id', 'LEO-2610-', 3);
    await run(env, 'INSERT INTO orders (order_id,type,customer_id,item,size,flavor,shape,qty,points,amount,deposit,status,order_date,due_date,rush,note,refund) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0)',
      oid, r.type, cust.customer_id, r.item, r.size, r.flavor, r.shape, r.qty, q.points, q.amount, q.deposit, '待收訂金', today(env), due, `由需求 ${rid} 轉入`);
    await run(env, "UPDATE requests SET status='已轉單', order_id=? WHERE request_id=?", oid, rid);
    await ok(env, 'intake', actor, 'convert_order', oid, `需求 ${rid} 轉成訂單 ${oid}，${nt(q.amount)}，交期 ${due}`, { order_id: oid, request_id: rid, amount: q.amount, deposit: q.deposit, due });
    return `已成立訂單 ${oid}（${r.customer_name}，${r.item}×${r.qty}），交期 ${md(due)}，金額 ${nt(q.amount)}，訂金 ${nt(q.deposit)}（${q.rate * 100}%），狀態「待收訂金」。收到訂金後請說「訂單 ${oid} 收到訂金」。`;
  }

  async function intakeChat(env, t, actor) {
    const oid = (t.match(/LEO-\d{4}-\d{3}/i) || [])[0]?.toUpperCase();
    const rid = (t.match(/R-\d{3,}/i) || [])[0]?.toUpperCase();
    // 擋：接單員沒有刪除、核准、改價的能力
    if (/刪除|刪掉|移除訂單|作廢/.test(t)) {
      await blocked(env, 'intake', actor, 'refuse_delete', oid, `接單員沒有刪除訂單的能力：「${t.slice(0, 40)}」`);
      return '我不能刪除訂單：接單員只能查單、轉單、送出加急／取消／折扣申請。不要的單請用取消申請，由店長核准。';
    }
    if (/(直接|幫我|自己|我來).{0,4}(核准|批准)|核准.{0,4}(吧|掉|它)|跳過.{0,4}(店長|核准)|不用.{0,4}(店長|核准)/.test(t)) {
      await blocked(env, 'intake', actor, 'refuse_approve', oid, `接單員不能核准：「${t.slice(0, 40)}」`);
      return '核准只有店長能按，我沒有這個能力。我可以送出申請，請店長在訂單頁核准。';
    }
    if (/改(價|金額|價格|訂金)|(價格|金額).{0,3}改|直接.{0,4}(降|減).{0,3}(價|錢)/.test(t)) {
      await blocked(env, 'intake', actor, 'refuse_price', oid, `接單員不能改價：「${t.slice(0, 40)}」`);
      return '我不能直接改價格。金額由規則算出；要特別折扣請說「訂單 ○○ 客人想算 ○ 折」，我送店長核准。';
    }
    if (rid && /師傅.{0,4}確認(過|好|了)/.test(t)) {
      if (staffByName(actor)?.role !== '師傅') {
        await blocked(env, 'intake', actor, 'chef_confirm', rid, `${actor || '不明身分'} 不是師傅，不能代師傅確認 ${rid}`);
        return '只有師傅可以確認造型做不做得出來。請師傅自己跟我說。';
      }
      await run(env, 'UPDATE requests SET chef_ok=1 WHERE request_id=?', rid);
      await ok(env, 'intake', actor, 'chef_confirm', rid, `${actor} 確認 ${rid} 的造型做得出來`);
      return `好，已記下 ${actor} 確認 ${rid} 的造型。現在可以說「把 ${rid} 轉成訂單」。`;
    }
    if (rid && /轉.{0,3}(訂單|單)/.test(t)) return convertRequest(env, t, actor);
    if (!oid) {
      if (/需求/.test(t) && !rid) {
        const list = await all(env, "SELECT * FROM requests WHERE status='待轉單' ORDER BY request_id");
        await ok(env, 'intake', actor, 'list_requests', '', `列待轉單需求 ${list.length} 筆`);
        return list.length ? '待轉單的需求：\n' + list.map((r) => `${r.request_id} ${r.customer_name} ${r.item}×${r.qty} ${md(r.due_date)} 取貨`).join('\n') : '目前沒有待轉單的需求。';
      }
      await ok(env, 'intake', actor, 'help', '', '請對方給訂單編號');
      return '我是接單員，可以：把需求轉成訂單（「把 R-001 轉成訂單」）、查訂單、送加急／取消／折扣申請、收訂金、改口味。請給我訂單編號（LEO-2610-○○○）。';
    }
    const o = await getOrder(env, oid);
    if (!o) { await ok(env, 'intake', actor, 'lookup', oid, `查無訂單 ${oid}`); return `查不到訂單 ${oid}，沒有這張單。`; }
    const todayD = today(env);

    if (/收到.{0,3}訂金|已收.{0,3}訂金|訂金.{0,3}(收到|付了|已付)/.test(t)) {
      if (o.status !== '待收訂金') return `${oid} 目前是「${o.status}」，不是待收訂金。`;
      await run(env, "UPDATE orders SET status='已收訂金' WHERE order_id=?", oid);
      await ok(env, 'intake', actor, 'deposit', oid, `${oid} 收到訂金 ${nt(o.deposit)}`, { deposit: o.deposit });
      return `已記下 ${oid} 收到訂金 ${nt(o.deposit)}，狀態改為「已收訂金」。`;
    }
    if (/加急|提前|提早|趕/.test(t)) {
      const nd = parseDate(t.replace(oid, ''), todayD);
      if (o.status === '已取消' || o.status === '已完成') return `${oid} 是「${o.status}」，不能加急。`;
      if (!nd) return '要提前到幾號？請說日期（例如 10/22）。';
      const q = o.type === 'box' ? quoteBox({ kind: o.item, qty: o.qty }) : quoteCake({ size: o.size, flavor: o.flavor, shape: o.shape, qty: o.qty });
      if (q.rushMin == null) {
        await blocked(env, 'intake', actor, 'rush', oid, `${oid} 不收加急（${o.shape === '師傅確認級' ? '師傅確認級造型' : '超過 30 盒的禮盒'}）`);
        return `${oid} 不收加急：${o.shape === '師傅確認級' ? '師傅確認級造型要 7 天前置，師傅沒辦法趕' : '超過 30 盒的禮盒量太大'}。請客人維持原交期 ${md(o.due_date)}。`;
      }
      const floor = addDays(todayD, q.rushMin);
      if (nd >= o.due_date) return `加急是把交期提前。${oid} 目前交期 ${md(o.due_date)}，你說的 ${md(nd)} 沒有比較早。`;
      if (nd < floor) {
        await blocked(env, 'intake', actor, 'rush', oid, `${oid} 提前到 ${nd} 太趕，最早 ${floor}`);
        return `太趕了：這個品項加急最短也要 ${q.rushMin} 天，最早 ${md(floor)}，你說的是 ${md(nd)}。`;
      }
      const cap = await capacity(env, nd), used = await usedPoints(env, nd, oid);
      if (used + o.points > cap.capacity) {
        await blocked(env, 'intake', actor, 'rush', oid, `${oid} 提前到 ${nd} 產能不夠（已排 ${used}＋${o.points} > ${cap.capacity}）`);
        return `${md(nd)} 產能不夠：產能 ${cap.capacity} 點，已排 ${used} 點，這張要 ${o.points} 點，沒辦法再加。`;
      }
      const fee = Math.round(o.amount * RUSH_FEE);
      const a = await addApproval(env, '加急', oid, `${oid} 從 ${md(o.due_date)} 提前到 ${md(nd)}，加急費 ${nt(fee)}`, { new_due: nd, fee }, actor, 'intake');
      if (a.dup) return `${oid} 的加急申請已經在等店長核准了（申請 #${a.dup}）。`;
      return `已送出加急申請（#${a.id}）：${oid} 從 ${md(o.due_date)} 提前到 ${md(nd)}，加急費 ${nt(fee)}（${RUSH_FEE * 100}%）。要店長核准後才算數，核准前交期不變。`;
    }
    if (/取消|退訂|不要了/.test(t)) {
      if (o.status === '已取消') return `${oid} 已經是取消的。`;
      if (o.status === '已完成') { await blocked(env, 'intake', actor, 'cancel', oid, `${oid} 已完成，不能取消`); return `${oid} 已完成，不能取消。`; }
      const days = diffDays(todayD, o.due_date);
      const rate = days >= 7 ? 1 : days >= 3 ? 0.5 : 0;
      const refund = Math.round(o.deposit * rate);
      const a = await addApproval(env, '取消', oid, `${oid} 取消，離交期 ${days} 天，退訂金 ${nt(refund)}`, { days, refund }, actor, 'intake');
      if (a.dup) return `${oid} 的取消申請已經在等店長核准了（申請 #${a.dup}）。`;
      return `已送出取消申請（#${a.id}）：${oid}，離交期還有 ${days} 天，依規則退訂金${rate === 1 ? '全額' : rate === 0.5 ? '一半' : '：不退'} ${nt(refund)}。要店長核准後才取消，核准前訂單照常。`;
    }
    if (/折|優惠/.test(t)) {
      const f = parseDiscount(t);
      if (!f) return '請說要幾折（例如「算 8 折」）。';
      const table = o.type === 'box' ? groupFactor(o.qty) : 1;
      if (f >= table) return `${oid} 表內折扣已經是${factorLabel(table)}，客人要的 ${Math.round(f * 100) / 10} 折沒有比較低，不用申請。`;
      const list = o.type === 'box' ? BOX[o.item] * o.qty : o.amount;
      const newAmt = Math.round(list * f);
      const a = await addApproval(env, '折扣', oid, `${oid} 超額折扣：${Math.round(f * 100) / 10} 折，金額 ${nt(o.amount)} → ${nt(newAmt)}`, { factor: f, new_amount: newAmt }, actor, 'intake');
      if (a.dup) return `${oid} 的折扣申請已經在等店長核准了（申請 #${a.dup}）。`;
      return `已送出超額折扣申請（#${a.id}）：${oid} 算 ${Math.round(f * 100) / 10} 折，金額 ${nt(o.amount)} → ${nt(newAmt)}。表外的折扣要店長核准，核准前金額不變。`;
    }
    if (/(改成|改為|換成).{0,6}(口味|香草|巧克力|芒果|抹茶)|口味.{0,3}(改|換)/.test(t)) {
      const fl = parseFlavor(t.replace(oid, ''));
      if (o.type !== 'cake') return `${oid} 是禮盒，沒有口味可改。`;
      if (!fl) return '要改成哪個口味？（香草、巧克力、芒果、抹茶紅豆）';
      const deadline = addDays(o.due_date, -CHANGE_DEADLINE_DAYS);
      if (todayD > deadline || !['待收訂金', '已收訂金'].includes(o.status)) {
        await blocked(env, 'intake', actor, 'change_flavor', oid, `${oid} 已過改單截止（${md(deadline)}）或狀態是${o.status}`);
        return `${oid} 不能改了：改單截止是交期前 ${CHANGE_DEADLINE_DAYS} 天（${md(deadline)}），現在是 ${md(todayD)}，狀態「${o.status}」。`;
      }
      const q = quoteCake({ size: o.size, flavor: fl, shape: o.shape, qty: o.qty });
      await run(env, 'UPDATE orders SET flavor=?, item=?, amount=?, deposit=? WHERE order_id=?', fl, `${o.size}${fl}蛋糕（${o.shape}造型）`, q.amount, q.deposit, oid);
      await ok(env, 'intake', actor, 'change_flavor', oid, `${oid} 口味 ${o.flavor} → ${fl}，金額 ${nt(o.amount)} → ${nt(q.amount)}`);
      return `已把 ${oid} 的口味從 ${o.flavor} 改成 ${fl}，金額 ${nt(q.amount)}，訂金 ${nt(q.deposit)}。`;
    }
    await ok(env, 'intake', actor, 'lookup', oid, `查訂單 ${oid}`);
    const ap = await all(env, "SELECT kind FROM approvals WHERE target=? AND status='待核准'", oid);
    return `${orderText(o)}：交期 ${md(o.due_date)}，金額 ${nt(o.amount)}，訂金 ${nt(o.deposit)}，狀態「${o.status}」${o.rush ? '（已加急）' : ''}${ap.length ? `；等店長核准：${ap.map((a) => a.kind).join('、')}` : ''}。`;
  }

  // ═════════════ 工位三：廚房排產（工廠） ═════════════
  async function kitchenChat(env, t, actor) {
    if (/(改|移|換|調|取消|刪|新增|加).{0,6}訂單|訂單.{0,8}(改|移|取消|刪|換|調)|LEO-\d{4}-\d{3}.{0,10}(改|移|取消|刪)|核准/.test(t)) {
      await blocked(env, 'kitchen', actor, 'refuse_change', '', `排產員不能動訂單：「${t.slice(0, 40)}」`);
      return '我只負責算排產單和備料，不能改、移、取消訂單，也不能核准。訂單的事請找接單員，要核准請店長。';
    }
    const date = parseDate(t, today(env)) || addDays(today(env), 1);
    const s = await schedule(env, date);
    await ok(env, 'kitchen', actor, 'schedule', date, `排 ${date}：產能 ${s.capacity}、已排 ${s.used}${s.is_over ? `，超出 ${s.over}` : ''}`, { date, capacity: s.capacity, used: s.used, over: s.over, ovens_ok: s.ovens_ok, chefs: s.chefs_present });
    const head = `${md(date)} 產能 ${s.capacity} 點（可用烤箱 ${s.ovens_ok}／${s.ovens_total} 台、到班師傅 ${s.chefs_present} 位：${s.chef_names.join('、') || '無'}）；已排 ${s.used} 點。`;
    const flag = s.is_over ? `【標紅】超出產能 ${s.over} 點，要店長決定哪幾張改期。` : `沒超出產能，還剩 ${s.capacity - s.used} 點。`;
    const body = s.lines.length ? '\n排產單：\n' + s.lines.map((l) => `${l.order_id} ${l.customer}｜${l.item}${l.type === 'box' || l.qty > 1 ? '×' + l.qty : ''}｜${l.points} 點`).join('\n') : '\n這天沒有排定的訂單。';
    const mat = Object.keys(s.materials).length ? '\n備料：' + Object.entries(s.materials).map(([k, v]) => `${k.replace(/(kg|顆|L)$/, '')} ${v}${k.match(/(kg|顆|L)$/)[1]}`).join('、') + '（門市固定品項走另一條線，不佔這裡的點數）' : '';
    return head + flag + body + mat;
  }

  // ═════════════ 工位四：內勤小幫手（給員工用） ═════════════
  const EQUIP = { A: 'E01', B: 'E02', C: 'E03', 一: 'E01', 二: 'E02', 三: 'E03', 1: 'E01', 2: 'E02', 3: 'E03' };
  async function deskChat(env, t, actor) {
    const me = staffByName(actor);
    const todayD = today(env);
    const named = staff.filter((s) => s.name !== me?.name && t.includes(s.name));
    if (/誰.{0,3}(上班|休)|排班|班表/.test(t)) {
      const d = parseDate(t, todayD) || todayD;
      const rows = await all(env, 'SELECT staff_id,status FROM shifts WHERE date=?', d);
      await ok(env, 'desk', actor, 'shifts', d, `查 ${d} 排班`);
      const on = staff.filter((s) => rows.find((r) => r.staff_id === s.staff_id)?.status !== '休').map((s) => s.name);
      const off = staff.filter((s) => rows.find((r) => r.staff_id === s.staff_id)?.status === '休').map((s) => s.name);
      return `${md(d)} 上班：${on.join('、')}${off.length ? `；休假：${off.join('、')}` : ''}。`;
    }
    if (/打卡|上班|下班/.test(t)) {
      if (named.length) {
        await blocked(env, 'desk', actor, 'clock_for_other', named[0].staff_id, `${actor || '不明身分'} 想替 ${named[0].name} 打卡，被擋下`);
        return `不能替別人打卡：打卡只能本人自己來。請 ${named[0].name} 自己跟我說。`;
      }
      if (!me) { await blocked(env, 'desk', actor, 'clock', '', `不明身分想打卡：「${t.slice(0, 30)}」`); return '請先告訴我你是誰（登入的名字），我才能幫你打卡。'; }
      const out = /下班/.test(t) && !/上班/.test(t);
      const row = await one(env, 'SELECT * FROM clock WHERE date=? AND staff_id=?', todayD, me.staff_id);
      const hhmm = new Date().toISOString().slice(11, 16);
      if (out) {
        if (!row) return `${me.name} 今天還沒有上班打卡，不能下班打卡。`;
        await run(env, 'UPDATE clock SET clock_out=? WHERE date=? AND staff_id=?', hhmm, todayD, me.staff_id);
        await ok(env, 'desk', actor, 'clock_out', me.staff_id, `${me.name} 下班打卡`);
        return `${me.name} 下班打卡完成。辛苦了。`;
      }
      if (row) return `${me.name} 今天已經打過上班卡了。`;
      const off = await one(env, "SELECT 1 AS x FROM shifts WHERE date=? AND staff_id=? AND status='休'", todayD, me.staff_id);
      await run(env, 'INSERT INTO clock (date,staff_id,clock_in) VALUES (?,?,?)', todayD, me.staff_id, hhmm);
      await ok(env, 'desk', actor, 'clock_in', me.staff_id, `${me.name} 上班打卡`);
      return `${me.name} 上班打卡完成（${md(todayD)}）。${off ? '提醒：排班表上你今天是休假。' : ''}`;
    }
    if (/請假|休假|排休|想休|請.{0,8}的假/.test(t)) {
      if (!me) { await blocked(env, 'desk', actor, 'leave', '', '不明身分想請假'); return '請先告訴我你是誰，我才能幫你送出請假申請。'; }
      if (named.length) {
        await blocked(env, 'desk', actor, 'leave_for_other', named[0].staff_id, `${actor} 想替 ${named[0].name} 請假，被擋下`);
        return `不能替別人請假：請假只能本人申請。請 ${named[0].name} 自己跟我說。`;
      }
      const d = parseDate(t, todayD);
      if (!d) return '你要請哪一天？請說日期（例如「明天」或 10/22）。';
      if (d < todayD) return '不能請過去的日期。';
      const sh = await one(env, 'SELECT status FROM shifts WHERE date=? AND staff_id=?', d, me.staff_id);
      if (sh?.status === '休') return `${md(d)} 你本來就排休，不用請假。`;
      const off = new Set((await all(env, "SELECT staff_id FROM shifts WHERE date=? AND status='休'", d)).map((r) => r.staff_id));
      const left = chefs.filter((c) => !off.has(c.staff_id) && c.staff_id !== me.staff_id);
      let warn = '';
      if (me.role === '師傅' && left.length < MIN_CHEFS) warn = `【人手不夠】${md(d)} 你請假後，到班師傅只剩 ${left.length} 位（${left.map((c) => c.name).join('、') || '無'}），低於最少 ${MIN_CHEFS} 位。`;
      const a = await addApproval(env, '請假', me.name, `${me.name} 請 ${md(d)} 的假${warn ? '（' + warn + '）' : ''}`, { date: d, staff_id: me.staff_id, warn: !!warn }, me.name, 'desk');
      if (a.dup) return `你的請假申請已經在等店長核准了（申請 #${a.dup}）。`;
      return `已送出請假申請（#${a.id}）：${me.name} 請 ${md(d)}。${warn}要店長核准後才算請假；核准前排班不變。`;
    }
    if (/壞了|故障|報修|不能用|沒辦法用|不熱|停了/.test(t)) {
      const m = t.match(/烤箱\s*([ABCabc一二三123])?/);
      const other = /攪拌機/.test(t) ? 'E04' : /冷藏/.test(t) ? 'E05' : null;
      let eid = other;
      if (m) { if (!m[1]) { return '是哪一台烤箱壞了？請說 A、B 或 C。'; } eid = EQUIP[m[1].toUpperCase()] || EQUIP[m[1]]; }
      if (!eid) { return '是哪一個設備？（烤箱 A／B／C、攪拌機、冷藏櫃）'; }
      const e = await one(env, 'SELECT * FROM equipment WHERE equipment_id=?', eid);
      if (e.status === '報修中') return `${e.name} 已經在報修中了。`;
      await run(env, "UPDATE equipment SET status='報修中', fault_date=?, note=? WHERE equipment_id=?", todayD, t.slice(0, 60), eid);
      await ok(env, 'desk', actor, 'report_fault', eid, `${e.name} 報修（${actor || '不明'} 回報）`, { equipment: e.name });
      if (e.kind === '烤箱') {
        const c = await capacity(env, addDays(todayD, 1));
        await ok(env, 'kitchen', 'desk', 'notified', eid, `內勤通知：${e.name} 停用，${md(todayD)} 起產能下修（明天產能 ${c.capacity} 點）`, { equipment: e.name, capacity_tomorrow: c.capacity });
        return `已報修${e.name}，並通知廚房排產：這台停用，${md(todayD)} 起每天少 ${OVEN_PTS} 點產能（明天產能變成 ${c.capacity} 點）。`;
      }
      return `已報修${e.name}（${e.kind}不影響排產點數），已記下。`;
    }
    const oid = (t.match(/LEO-\d{4}-\d{3}/i) || [])[0]?.toUpperCase();
    if (oid && /刪|改|取消|核准|加急/.test(t) && !/進度|做到哪|到哪/.test(t)) {
      await blocked(env, 'desk', actor, 'refuse_order_change', oid, `內勤不能動訂單：「${t.slice(0, 40)}」`);
      return '我只能查進度，不能改、取消、加急或核准訂單。訂單的事請找接單員。';
    }
    if (oid) {
      const o = await getOrder(env, oid);
      if (!o) { await ok(env, 'desk', actor, 'progress', oid, `查無 ${oid}`); return `查不到訂單 ${oid}。`; }
      await ok(env, 'desk', actor, 'progress', oid, `查 ${oid} 進度：${o.status}`);
      const sch = o.due_date === todayD ? '今天出爐' : o.due_date === addDays(todayD, 1) ? '明天出爐，已排入明天的排產單' : `${md(o.due_date)} 出爐`;
      const ap = await all(env, "SELECT kind FROM approvals WHERE target=? AND status='待核准'", oid);
      return `${oid}（${o.customer}，${o.item}）：狀態「${o.status}」，交期 ${md(o.due_date)}，${o.status === '已取消' ? '已取消' : o.status === '已完成' ? '已完成' : sch}${ap.length ? `；等店長核准：${ap.map((a) => a.kind).join('、')}` : ''}。`;
    }
    if (/刪|核准|批准|改.{0,3}(排班|紀錄|打卡)/.test(t)) {
      await blocked(env, 'desk', actor, 'refuse', '', `內勤沒有這個能力：「${t.slice(0, 40)}」`);
      return '這個我不能做：我只能幫員工打卡（本人）、送請假申請、報修設備、查訂單進度和排班。核准要店長按。';
    }
    await ok(env, 'desk', actor, 'help', '', '說明能做的事');
    return '我是內勤小幫手，可以：打卡（本人）、請假（送店長核准）、設備報修、查訂單進度（給我訂單編號）、查排班。';
  }

  // ═════════════ 店長核准（只有人按得到；五個工位都沒有這個能力） ═════════════
  async function decide(env, id, act) {
    const a = await one(env, 'SELECT * FROM approvals WHERE id=?', id);
    if (!a) return json({ error: '查無此申請' }, 404);
    if (a.status !== '待核准') return json({ error: `這張申請已經是「${a.status}」` }, 409);
    const d = JSON.parse(a.detail || '{}');
    if (act === 'reject') {
      await run(env, "UPDATE approvals SET status='已退回', decided_at=? WHERE id=?", new Date().toISOString(), id);
      await log(env, 'manager', '店長', 'reject', a.target, 'ok', `店長退回${a.kind}：${a.target}`, { kind: a.kind, decision: '已退回', date: d.date });
      return json({ approval: await one(env, 'SELECT * FROM approvals WHERE id=?', id) });
    }
    if (a.kind === '加急') {
      const o = await getOrder(env, a.target);
      const cap = await capacity(env, d.new_due), used = await usedPoints(env, d.new_due, a.target);
      if (used + o.points > cap.capacity) return json({ error: `${d.new_due} 現在產能不夠（產能 ${cap.capacity}，已排 ${used}，這張 ${o.points}），不能核准加急` }, 409);
      await run(env, 'UPDATE orders SET due_date=?, amount=amount+?, rush=1 WHERE order_id=?', d.new_due, d.fee, a.target);
    } else if (a.kind === '取消') {
      await run(env, "UPDATE orders SET status='已取消', refund=? WHERE order_id=?", d.refund, a.target);
    } else if (a.kind === '折扣') {
      const o = await getOrder(env, a.target);
      await run(env, 'UPDATE orders SET amount=?, deposit=? WHERE order_id=?', d.new_amount, Math.round(d.new_amount * (o.type === 'box' ? DEPOSIT.box : DEPOSIT.cake)), a.target);
    } else if (a.kind === '請假') {
      await run(env, 'INSERT INTO shifts (date,staff_id,status) VALUES (?,?,?) ON CONFLICT(date,staff_id) DO UPDATE SET status=excluded.status', d.date, d.staff_id, '休');
    }
    await run(env, "UPDATE approvals SET status='已核准', decided_at=? WHERE id=?", new Date().toISOString(), id);
    await log(env, 'manager', '店長', 'approve', a.target, 'ok', `店長核准${a.kind}：${a.summary}`, { kind: a.kind, decision: '已核准', date: d.date, ...d });
    return json({ approval: await one(env, 'SELECT * FROM approvals WHERE id=?', id), order: a.kind === '請假' ? undefined : await getOrder(env, a.target) });
  }

  const CHAT = { service: serviceChat, intake: intakeChat, kitchen: kitchenChat, desk: deskChat };

  return {
    async fetch(req, env) {
      const url = new URL(req.url); const p = url.pathname; const m = req.method;
      if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
      try {
        await ensure(env);
        const body = async () => req.json().catch(() => ({}));
        if (p === '/api/reset' && m === 'POST') { await reset(env); return json({ ok: true }); }
        if (p === '/api/orders' && m === 'GET') return json({ orders: await all(env, 'SELECT o.*, c.name AS customer FROM orders o LEFT JOIN customers c ON c.customer_id=o.customer_id ORDER BY o.order_id') });
        let mm = p.match(/^\/api\/orders\/([^/]+)$/);
        if (mm && m === 'GET') { const o = await getOrder(env, decodeURIComponent(mm[1])); return o ? json({ order: o }) : json({ error: '查無此訂單' }, 404); }
        if (p === '/api/approvals' && m === 'GET') return json({ approvals: await all(env, 'SELECT * FROM approvals ORDER BY id') });
        mm = p.match(/^\/api\/approvals\/(\d+)\/(approve|reject)$/);
        if (mm && m === 'POST') return decide(env, Number(mm[1]), mm[2]);
        if (p === '/api/schedule' && m === 'GET') return json(await schedule(env, url.searchParams.get('date') || addDays(today(env), 1)));
        if (p === '/api/logs' && m === 'GET') {
          const st = url.searchParams.get('station');
          const rows = st ? await all(env, 'SELECT * FROM work_log WHERE station=? ORDER BY id', st) : await all(env, 'SELECT * FROM work_log ORDER BY id');
          return json({ logs: rows });
        }
        mm = p.match(/^\/api\/(service|intake|kitchen|desk|report)\/chat$/);
        if (mm && m === 'POST') {
          if (!CHAT[mm[1]]) return json({ error: '這個工位還沒上班' }, 404);
          const b = await body(); const text = String(b.message || '').trim();
          if (!text) return json({ error: '沒有收到訊息' }, 400);
          return json({ station: mm[1], reply: await CHAT[mm[1]](env, text, b.user ? String(b.user) : '') });
        }
        return json({ error: '沒有這個網址' }, 404);
      } catch (e) { return json({ error: '後端出錯：' + e.message }, 500); }
    },
  };
}
