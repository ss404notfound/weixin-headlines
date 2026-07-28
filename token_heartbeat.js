/**
 * WeRead Token 保活脚本
 * 每 6 小时调用一次 WeRead API，防止 token 因不活跃被失效
 * 如果 token 已失效，通过 Server酱 通知用户
 *
 * 用法：node token_heartbeat.js
 */

const https = require('https');

const WEREAD_TOKEN = process.env.WEREAD_TOKEN;
const WEREAD_VID = process.env.WEREAD_VID || '89668853';
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY;

// 用第一个公众号测试
const TEST_MP = { id: 'MP_WXS_1432156401', name: '虎嗅APP' };

function checkToken() {
  return new Promise((resolve) => {
    const url = `https://weread.111965.xyz/api/v2/platform/mps/${TEST_MP.id}/articles?page=1`;
    const req = https.get(url, {
      headers: { 'xid': WEREAD_VID, 'Authorization': `Bearer ${WEREAD_TOKEN}` },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.statusCode === 401 || json.message?.includes('Token')) {
            resolve({ ok: false, expired: true });
          } else {
            resolve({ ok: true });
          }
        } catch (e) {
          resolve({ ok: false, expired: false, error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, expired: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, expired: false, error: 'timeout' }); });
  });
}

function notifyExpired() {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      title: '⚠️ WeRead Token 已失效，请扫码更新',
      desp: '公众号头条推送的 WeRead token 已过期。\n\n**需要操作：**\n1. 打开 WorkBuddy\n2. 让助手重新扫码获取 token\n3. 更新 GitHub Secrets 中的 WEREAD_TOKEN\n\n在更新之前，头条推送将暂停。'
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
    console.error('缺少 WEREAD_TOKEN');
    process.exit(1);
  }

  const result = await checkToken();

  if (result.ok) {
    console.log('[heartbeat] ✅ Token 有效');
  } else if (result.expired) {
    console.log('[heartbeat] ❌ Token 已失效，发送通知...');
    if (SERVERCHAN_KEY) {
      await notifyExpired();
      console.log('[heartbeat] 通知已发送');
    } else {
      console.log('[heartbeat] 无 SERVERCHAN_KEY，跳过通知');
    }
  } else {
    console.log(`[heartbeat] ⚠️ 检查失败: ${result.error}`);
  }
})();
