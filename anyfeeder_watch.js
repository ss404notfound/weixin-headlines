/**
 * anyfeeder_watch.js — 监控 anyfeeder 微信爬虫恢复
 *
 * 所有 anyfeeder 微信源在 2026-07-30 16:30 左右全线停摆。
 * 本脚本每 N 小时检查最新文章是否在冻结日期之后。
 * 一旦检测到恢复，通过 Server酱 推送通知。
 *
 * 运行：node anyfeeder_watch.js
 */

const https = require("https");
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || "";

// ─── 冻结时间戳（北京时间 2026-07-30 16:30）─────────────
const FREEZE_TS = new Date("2026-07-30T08:30:00Z").getTime(); // UTC

// ─── 7 个 anyfeeder 源 ───────────────────────────────────
const FEEDS = [
  { name: "虎嗅APP",         id: "huxiu_com" },
  { name: "人物",             id: "renwumag1980" },
  { name: "X博士",            id: "doctorx666" },
  { name: "张佳玮",           id: "zhangjiawei_1983" },
  { name: "新世相",           id: "thefair2" },
  { name: "六神磊磊读金庸",   id: "dujinyong6" },
  { name: "饭统戴老板",       id: "worldofboss" },
];

// ─── HTTP fetch ──────────────────────────────────────────
function fetchRSS(id) {
  return new Promise((resolve) => {
    const url = `https://plink.anyfeeder.com/weixin/${id}`;
    https.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        // 提取第一个 <item> 的 <pubDate>
        const itemM = data.match(/<item>([\s\S]*?)<\/item>/);
        if (!itemM) { resolve(null); return; }
        const dateM = itemM[1].match(/<pubDate>([^<]+)<\/pubDate>/);
        if (!dateM) { resolve(null); return; }
        const ts = new Date(dateM[1]).getTime();
        // 提取标题用于展示
        const titleM = itemM[1].match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
        resolve({
          pubDate: dateM[1],
          timestamp: ts,
          title: titleM ? titleM[1].trim() : "(未知)",
        });
      });
    }).on("error", () => resolve(null));
  });
}

// ─── Server酱 推送 ───────────────────────────────────────
function notify(title, body) {
  return new Promise((resolve) => {
    if (!SERVERCHAN_KEY) {
      console.log("  ⚠️  未配置 SERVERCHAN_KEY，跳过推送");
      resolve(false);
      return;
    }
    const postData = `title=${encodeURIComponent(title)}&desp=${encodeURIComponent(body)}`;
    const req = https.request({
      hostname: "sctapi.ftqq.com",
      path: `/${SERVERCHAN_KEY}.send`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 10000,
    }, () => resolve(true));
    req.on("error", () => resolve(false));
    req.write(postData);
    req.end();
  });
}

// ─── 日期格式化 ──────────────────────────────────────────
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  const now = new Date();
  const nowStr = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  console.log(`\n🔍 anyfeeder 监控 — ${nowStr}\n`);

  const results = [];
  for (const f of FEEDS) {
    process.stdout.write(`  ➤ ${f.name}... `);
    const r = await fetchRSS(f.id);
    if (!r) {
      console.log("❌ 无数据");
      results.push({ ...f, ok: false, recovered: false });
    } else {
      const recovered = r.timestamp > FREEZE_TS;
      const icon = recovered ? "✅ 恢复！" : "⏸ 仍冻结";
      console.log(`${icon} [${fmtDate(r.timestamp)}] ${r.title.substring(0, 25)}`);
      results.push({ ...f, ok: true, recovered, ...r });
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const recovered = results.filter((r) => r.recovered);
  const stillFrozen = results.filter((r) => r.ok && !r.recovered);

  console.log(`\n📊 恢复 ${recovered.length} / 仍冻结 ${stillFrozen.length} / 无数据 ${results.length - recovered.length - stillFrozen.length}`);

  if (recovered.length > 0) {
    // 有号恢复了！推送通知
    const title = `✅ anyfeeder 微信爬虫已恢复！(${recovered.length}/${FEEDS.length})`;
    let body = `## 🎉 anyfeeder 微信爬虫恢复通知\n\n`;
    body += `**${recovered.length}** 个号已恢复更新：\n\n`;
    for (const r of recovered) {
      body += `- **${r.name}** → [${fmtDate(r.timestamp)}] ${r.title}\n`;
    }
    body += `\n`;
    if (stillFrozen.length > 0) {
      body += `**${stillFrozen.length}** 个号仍在等待恢复：\n`;
      for (const r of stillFrozen) {
        body += `- ${r.name} [${fmtDate(r.timestamp)}]\n`;
      }
    }
    body += `\n---\n🤖 ${nowStr}`;

    console.log(`\n📤 正在推送恢复通知...`);
    const sent = await notify(title, body);
    console.log(sent ? "✅ 通知已发送" : "❌ 推送失败");
  } else {
    console.log(`\n😴 全部 ${FEEDS.length} 个号仍在冻结中，继续等待...`);
  }
}

main().catch((e) => {
  console.error("💥 异常:", e.message);
  process.exit(1);
});
