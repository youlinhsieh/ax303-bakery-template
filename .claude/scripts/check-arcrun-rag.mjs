#!/usr/bin/env node
// setup 第 7 步用：確認 Arcrun RAG「真的裝好、裝在學員自己的 Cloudflare 帳號、MCP 接得上」。
// 只用 Node 內建功能。絕不印出 token 的值。每項印「通過」或「失敗＋原因＋怎麼辦」；全過 exit 0。
// 需要的環境變數：ARCRUN_RAG_URL（以 /mcp 結尾）、ARCRUN_RAG_TOKEN；查帳號歸屬另需 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID。
const url = process.env.ARCRUN_RAG_URL || '', token = process.env.ARCRUN_RAG_TOKEN || '';
const cfTok = process.env.CLOUDFLARE_API_TOKEN || '', cfAcct = process.env.CLOUDFLARE_ACCOUNT_ID || '';
let bad = 0;
const pass = (what, extra = '') => console.log(`通過｜${what}${extra ? '：' + extra : ''}`);
const fail = (what, why, fix) => { bad++; console.log(`失敗｜${what}：${why}${fix ? '（' + fix + '）' : ''}`); };

// 1. 兩個變數有沒有、長得對不對
if (!url || !token) {
  fail('Arcrun RAG 變數', `${!url ? 'ARCRUN_RAG_URL ' : ''}${!token ? 'ARCRUN_RAG_TOKEN ' : ''}沒設`, '到環境設定補上，補完要開新的工作階段');
  process.exit(1);
}
let u; try { u = new URL(url); } catch { fail('ARCRUN_RAG_URL', '不是網址', '照安裝完成畫面給的網址貼，結尾加 /mcp'); process.exit(1); }
if (u.protocol !== 'https:') fail('ARCRUN_RAG_URL', '要是 https 開頭');
else if (!u.pathname.replace(/\/$/, '').endsWith('/mcp')) fail('ARCRUN_RAG_URL', '結尾要有 /mcp', '網址後面加上 /mcp');
else pass('ARCRUN_RAG_URL 格式', u.host);

// 2. MCP 接得上（initialize → tools/list → 讀一次地圖）
const H = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` };
let sid = '';
async function rpc(method, params, id) {
  const res = await fetch(url, { method: 'POST', headers: { ...H, ...(sid ? { 'mcp-session-id': sid } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) });
  sid = res.headers.get('mcp-session-id') || sid;
  const raw = await res.text();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  if (!id) return null;
  const line = raw.startsWith('{') ? raw : (raw.split('\n').find((l) => l.startsWith('data:')) || '').slice(5);
  const j = JSON.parse(line.trim()); if (j.error) throw new Error(j.error.message || 'MCP 錯誤'); return j.result;
}
let tools = [];
try {
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ax303-setup', version: '1' } }, 1);
  await rpc('notifications/initialized', {});
  tools = ((await rpc('tools/list', {}, 2)).tools || []).map((t) => t.name);
  const need = ['kbdb_get_map', 'kbdb_get_index', 'kbdb_get_card'];
  const miss = need.filter((n) => !tools.includes(n));
  if (miss.length) fail('Arcrun RAG 的工具', `少了 ${miss.join('、')}（連到的不像是 Arcrun RAG）`, '確認網址是安裝完成畫面給的那個');
  else pass('Arcrun RAG 的工具', `${tools.length} 個，含 地圖／目錄／整張卡`);
  const map = await rpc('tools/call', { name: 'kbdb_get_map', arguments: {} }, 3);
  if (map?.isError) fail('讀知識庫地圖', '工具回了錯誤', '請截圖寄講師');
  else pass('讀知識庫地圖', '能讀（內容有沒有放進去是下一步「實作一」的事）');
} catch (e) {
  if (e.status === 401 || e.status === 403) fail('Arcrun RAG 連線', `token 不對或沒權限（${e.status}）`, '重新複製安裝完成畫面的 MCP token，注意前後不要有空白');
  else if (e.status === 404) fail('Arcrun RAG 連線', '網址找不到（404）', '網址結尾要是 /mcp');
  else fail('Arcrun RAG 連線', String(e.message || e).slice(0, 80), '環境的 Network access 要選 Full，或網址打錯');
}

// 3. 是不是裝在學員「自己的」Cloudflare 帳號
if (u.host.endsWith('.workers.dev')) {
  const [script, sub] = u.host.split('.');
  if (!cfTok || !cfAcct) fail('確認裝在你自己的帳號', 'CLOUDFLARE_API_TOKEN／CLOUDFLARE_ACCOUNT_ID 沒設，沒辦法查', '先補好 Cloudflare 金鑰');
  else {
    const cf = async (p) => (await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAcct}${p}`, { headers: { authorization: `Bearer ${cfTok}` } })).json().catch(() => ({}));
    const s = await cf('/workers/subdomain');
    if (!s.success) fail('確認裝在你自己的帳號', 'Cloudflare 金鑰查不到帳號資料', '金鑰要有 Workers 的權限');
    else if (s.result?.subdomain !== sub) fail('確認裝在你自己的帳號', `這個網址屬於別人的 Cloudflare 帳號（${sub}.workers.dev），不是你的（${s.result?.subdomain}.workers.dev）`, '用你自己的帳號重裝 Arcrun RAG，README 的現場步驟 A');
    else {
      const l = await cf('/workers/scripts');
      if (l.success && !(l.result || []).some((x) => x.id === script)) fail('確認裝在你自己的帳號', `你的帳號底下沒有叫 ${script} 的 Worker`, '去 Cloudflare 的 Workers & Pages 看 Arcrun RAG 有沒有裝好');
      else pass('確認裝在你自己的帳號', `${script} 在你的帳號底下`);
    }
  }
} else console.log(`略過｜網址不是 workers.dev（${u.host}），沒辦法自動確認帳號；請到 Cloudflare 的 Workers & Pages 確認這個 Worker 在你的帳號底下`);

process.exit(bad ? 1 : 0);
