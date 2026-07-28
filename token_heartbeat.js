/**
 * WeRead Token 心跳检测 v2
 * - 每 2 小时检测 token 是否有效
 * - 检测 3 个不同公众号（增加可靠性）
 * - 失效时通过 Server酱 发送通知（含恢复指引）
 */

const https = require('https');

const WEREAD_TOKEN = process.env.WEREAD_TOKEN;
const WEREAD_VID = process.env.WEREAD_VID || '89668853';
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY;

// 用 3 个不同公众号测试，避免单点误判
const TEST_MPS = [
  { id: 'MP_WXS_1432156401', name: '虎嗅APP' },
  { id: 'MP_WXS_2391309580', name: '人物' },
  { id: 'MP_WXS_2395028760', name: '视觉志' },
];

function checkOne(mp) {
  return new Promise((resolve) => {
    const url = `https://weread.111965.xyz/api/v2/platform/mps/${mp.id}/articles?page=1`;
    const req = https.get(url, {
      headers: { 'xid': WEREAD_VID, 'Authorization': `Bearer ${WEREAD_TOKEN}` },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.statusCode === 401 || (json.message && json.message.includes('Token'))) {
            resolve({ ok: false, expired: true, mp: mp.name });
          } else if (json.statusCode === 429 || (json.message && json.message.includes('WeReadError'))) {
            // 限流不算过期
            resolve({ ok: true, rateLimited: true, mp: mp.name });
          } else if (Array.isArray(json) && json.length > 0) {
            resolve({ ok: true, articles: json.length, mp: mp.name });
          } else {
            resolve({ ok: true, empty: true, mp: mp.name });
          }
        } catch (e) {
          resolve({ ok: true, parseError: true, mp: mp.name });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: true, networkError: e.message, mp: mp.name }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: true, timeout: true, mp: mp.name }); });
  });
}

function notifyExpired() {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      title: '⚠️ WeRead Token 已失效',
      desp: '公众号头条推送的 WeRead token 已过期。\n\n**恢复步骤：**\n1. 在 WorkBuddy 中运行扫码流程\n2. 获取新 token 后自动更新\n\n在更新之前，每日推送将暂停。'
    }).toString();

    const req = https.request({
      hostname: 'sctapi.ftqq.com',
      path: `/${SERVERCHAN_KEY}.send`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`[heartbeat] ${new Date().toISOString()} 检查 token...`);

  if (!WEREAD_TOKEN) {
    console.error('[heartbeat] 缺少 WEREAD_TOKEN');
    process.exit(1);
  }

  // 并行检查 3 个号
  const results = await Promise.all(TEST_MPS.map(mp => checkOne(mp)));

  for (const r of results) {
    const status = r.expired ? '❌ 过期' : r.articles ? `✅ ${r.articles}篇` : r.rateLimited ? '⏳ 限流' : '⚠️ 异常';
    console.log(`[heartbeat] ${r.mp}: ${status}`);
  }

  const expired = results.filter(r => r.expired);
  const good = results.filter(r => r.articles && r.articles > 0);

  if (expired.length >= 2) {
    // 至少 2 个号确认过期才发通知（避免误报）
    console.log('[heartbeat] ❌ Token 已失效，发送通知...');
    if (SERVERCHAN_KEY) {
      await notifyExpired();
      console.log('[heartbeat] 通知已发送');
    }
  } else if (good.length >= 2) {
    console.log('[heartbeat] ✅ Token 有效');
  } else {
    console.log('[heartbeat] ⚠️ 状态不明（可能限流），持续监控');
  }
})();
