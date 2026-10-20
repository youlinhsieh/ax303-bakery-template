// D1 存檔點（知識庫已接好、門市客服上線並過了自己的驗收單（D1 收場的狀態））。由課程維護者從參考解答切出來；學員不必讀它，叫 CC 從存檔點接著做即可。
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

  const CHAT = { service: serviceChat };

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
