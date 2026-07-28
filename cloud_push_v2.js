/**
 * 公众号头条推送 v2 — Server酱 + WeRead API
 *
 * 改进：
 * - 推送从 ClawBot 换成 Server酱（webhook，永不过期）
 * - token 失效时自动通过 Server酱 通知用户
 * - 纯 Node 内置模块，零依赖
 *
 * 凭据（环境变量）：
 *   WEREAD_TOKEN     — WeRead API token
 *   WEREAD_VID       — WeRead vid（默认 89668853）
 *   SERVERCHAN_KEY   — Server酱 SendKey
 *
 * 用法：node cloud_push_v2.js [--dry-run]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// ===== 20 个公众号 =====
const MPS = [
  { id: 'MP_WXS_1432156401', name: '虎嗅APP' },
  { id: 'MP_WXS_3019315517', name: 'X博士' },
  { id: 'MP_WXS_2391309580', name: '新闻哥' },
  { id: 'MP_WXS_2103095721', name: '人物' },
  { id: 'MP_WXS_2395028760', name: '视觉志' },
  { id: 'MP_WXS_3094757480', name: '差评X.PIN' },
  { id: 'MP_WXS_3926568365', name: '硅星人Pro' },
  { id: 'MP_WXS_3573460105', name: '兽楼处' },
  { id: 'MP_WXS_3091645629', name: '跳海大院' },
  { id: 'MP_WXS_3269071092', name: '新世相' },
  { id: 'MP_WXS_2398035764', name: '呦呦鹿鸣' },
  { id: 'MP_WXS_3513033996', name: '包邮区' },
  { id: 'MP_WXS_3573812266', name: '星球商业评论' },
  { id: 'MP_WXS_3084135320', name: '六神磊磊读金庸' },
  { id: 'MP_WXS_3584660330', name: '饭统戴老板' },
  { id: 'MP_WXS_3210821345', name: '互联网怪盗团' },
  { id: 'MP_WXS_3096665718', name: '张佳玮写字的地方' },
  { id: 'MP_WXS_3515168726', name: '张迷客厅' },
  { id: 'MP_WXS_3089351720', name: '三联生活实验室' },
  { id: 'MP_WXS_3572959446', name: '晚点LatePost' },
];

// ===== 凭据 =====
function loadCreds() {
  // 环境变量优先
  let wereadToken = process.env.WEREAD_TOKEN;
  let wereadVid = process.env.WEREAD_VID || '89668853';
  let scKey = process.env.SERVERCHAN_KEY;

  // 本地 fallback：从 github_secrets.txt 读
  if (!wereadToken || !scKey) {
    const secretsPath = path.join(__dirname, 'github_secrets.txt');
    try {
      const txt = fs.readFileSync(secretsPath, 'utf8');
      if (!wereadToken) {
        const m = txt.match(/WEREAD_TOKEN\s*=\s*(.+)/);
        if (m) wereadToken = m[1].trim();
      }
      if (!scKey) {
        const m2 = txt.match(/SERVERCHAN_KEY\s*=\s*(.+)/);
        if (m2) scKey = m2[1].trim();
      }
    } catch (e) {}
  }

  return { wereadToken, wereadVid, scKey };
}

// ===== WeRead API =====
function fetchArticles(mp, creds) {
  return new Promise((resolve) => {
    const url = `https://weread.111965.xyz/api/v2/platform/mps/${mp.id}/articles?page=1`;
    const req = https.get(url, {
      headers: { 'xid': creds.wereadVid, 'Authorization': `Bearer ${creds.wereadToken}` },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.statusCode === 401 || json.message?.includes('Token')) {
            resolve({ mp, ok: false, error: 'token_expired', raw: json });
          } else {
            const articles = Array.isArray(json) ? json : (json.data || []);
            resolve({ mp, ok: true, articles });
          }
        } catch (e) {
          resolve({ mp, ok: false, error: 'parse: ' + data.substring(0, 80) });
        }
      });
    });
    req.on('error', (e) => resolve({ mp, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ mp, ok: false, error: 'timeout' }); });
  });
}

async function fetchAllArticles(creds) {
  console.log(`[1/3] 并行抓取 ${MPS.length} 个公众号...`);
  const t0 = Date.now();
  const BATCH = 10;
  const all = [];

  for (let i = 0; i < MPS.length; i += BATCH) {
    const batch = MPS.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(mp => fetchArticles(mp, creds)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        all.push(r.value);
        process.stdout.write(r.value.ok && r.value.articles.length > 0 ? '.' : '!');
      } else {
        all.push({ ok: false, error: r.reason?.message });
        process.stdout.write('!');
      }
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  完成，耗时 ${elapsed}s`);
  return all;
}

// ===== 提取头条 =====
function extractHeadlines(responses) {
  const results = [];
  let tokenExpired = false;

  for (const resp of responses) {
    if (resp.error === 'token_expired') { tokenExpired = true; continue; }
    if (!resp.ok || resp.articles.length === 0) continue;

    const pushes = {};
    resp.articles.forEach(a => {
      const t = a.publishTime;
      if (!pushes[t]) pushes[t] = [];
      pushes[t].push(a);
    });

    const times = Object.keys(pushes).map(Number).sort((a, b) => b - a);
    const headline = pushes[times[0]][0];

    results.push({
      mpName: resp.mp.name,
      title: headline.title,
      url: 'https://mp.weixin.qq.com/s/' + headline.id,
      time: fmtTime(headline.publishTime),
      count: pushes[times[0]].length
    });
  }

  return { results, tokenExpired };
}

// ===== Server酱推送 =====
function sendServerChan(title, desp, scKey) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ title, desp }).toString();

    const req = https.request({
      hostname: 'sctapi.ftqq.com',
      path: `/${scKey}.send`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) resolve(json);
          else reject(new Error(`Server酱 code=${json.code}: ${json.message}`));
        } catch (e) {
          reject(new Error('Server酱 parse error: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===== 工具 =====
function fmtTime(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
  if (isToday) return '今天 ' + time;
  if (isYesterday) return '昨天 ' + time;
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + time;
}

// ===== 主流程 =====
async function main() {
  const t0 = Date.now();
  console.log('========================================');
  console.log('  公众号头条推送 v2 (Server酱)');
  console.log('========================================\n');

  const creds = loadCreds();
  if (!creds.wereadToken) throw new Error('缺少 WEREAD_TOKEN');
  if (!creds.scKey) throw new Error('缺少 SERVERCHAN_KEY（去 sct.ftqq.com 注册获取）');

  // 1. 抓取
  const responses = await fetchAllArticles(creds);
  const { results, tokenExpired } = extractHeadlines(responses);

  console.log(`\n[2/3] 提取头条: ${results.length} 个有内容`);

  // token 失效通知
  if (tokenExpired) {
    console.log('  ⚠️ WeRead token 已失效！');
    if (!DRY_RUN) {
      await sendServerChan(
        '⚠️ WeRead Token 已失效',
        '公众号头条推送失败：WeRead token 过期了。\n\n请尽快重新扫码登录，更新 token。',
        creds.scKey
      );
      console.log('  已通过 Server酱 发送失效通知');
    }
    return;
  }

  if (results.length === 0) {
    console.log('  没有可推送的内容');
    return;
  }

  // 格式化（Markdown 格式，Server酱支持）
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  let desp = `📰 **公众号头条速递** · ${now}\n\n---\n\n`;

  for (const r of results) {
    desp += `### 【${r.mpName}】\n`;
    desp += `${r.time}\n\n`;
    desp += `**${r.title}**\n`;
    desp += `🔗 [阅读原文](${r.url})\n`;
    if (r.count > 1) desp += `  _(本推送共${r.count}篇)_\n`;
    desp += '\n---\n\n';
  }

  desp += `\n共 ${results.length} 条头条 | 云端自动推送 ⚡`;

  const title = `📰 ${results.length}条头条 · ${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  // 3. 推送
  if (DRY_RUN) {
    console.log('\n[3/3] DRY RUN - 消息预览:\n');
    console.log(`标题: ${title}`);
    console.log(`内容:\n${desp}`);
    console.log('\n=== DRY RUN 结束 ===');
  } else {
    console.log(`\n[3/3] 推送到微信 (${desp.length} 字符)...`);
    await sendServerChan(title, desp, creds.scKey);
    console.log('  推送成功!');
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ 完成，总耗时 ${total}s`);
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error('\n❌ 错误:', err.message);
    process.exit(1);
  }
})();
