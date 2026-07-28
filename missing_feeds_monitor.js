/**
 * missing_feeds_monitor.js — 缺号探测
 * 每天检查那 10 个暂未覆盖的公众号，一旦 anyfeeder 收录就告警
 * 
 * 运行：node missing_feeds_monitor.js
 * 环境变量：SERVERCHAN_KEY（可选，有告警时推送）
 */

const https = require("https");
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || "";

// 暂未覆盖的 10 个号（ID 已验证正确）
const MISSING = [
  { name: "新闻哥",             id: "newsbro" },
  { name: "跳海大院",           id: "meerjump" },
  { name: "三联生活实验室",     id: "LIFELAB2020" },
  { name: "晚点LatePost",       id: "postlate" },
  { name: "硅星人Pro",          id: "gh_c0bb185caa8d" },
  { name: "兽楼处",             id: "ishoulc" },
  { name: "视觉志",             id: "iiidaily" },
  { name: "包邮区",             id: "ibaoyouqu" },
  { name: "星球商业评论",       id: "xqnews" },
  { name: "互联网怪盗团",       id: "TMTphantom" },
];

// 额外 ID 变体尝试（有些号可能用 gh_ 原始ID 被收录）
const ALIASES = {
  "视觉志": ["iiidaily", "shijuezhi"],
  "新闻哥": ["newsbro"],
  "跳海大院": ["meerjump"],
};

function checkAnyfeeder(id) {
  return new Promise((resolve) => {
    const url = `https://plink.anyfeeder.com/weixin/${id}`;
    https.get(url, { timeout: 12000 }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => {
        const hasItem = /<item>/.test(d);
        const titleMatch = d.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
        const pubMatch = d.match(/<pubDate>([^<]+)<\/pubDate>/);
        resolve({
          ok: res.statusCode === 200 && hasItem,
          title: titleMatch ? titleMatch[1].trim() : null,
          date: pubMatch ? pubMatch[1] : null,
        });
      });
    }).on("error", () => resolve({ ok: false }));
  });
}

async function pushAlert(newFeeds) {
  if (!SERVERCHAN_KEY) {
    console.log("\n⚠️  未配置 SERVERCHAN_KEY，无法推送告警");
    return;
  }

  const names = newFeeds.map((f) => f.name).join("、");
  let body = `🎉 以下公众号已恢复 RSS 覆盖：\n\n`;
  for (const f of newFeeds) {
    body += `### ${f.name}\n`;
    body += `- 头条：${f.title || "?"}\n`;
    body += `- 日期：${f.date || "?"}\n`;
    body += `- ID：\`${f.id}\`\n\n`;
  }
  body += `可加入 cloud_push_v3.js 的 FEEDS 列表。`;

  const postData = `title=${encodeURIComponent(`🎉 ${names} RSS已恢复`)}&desp=${encodeURIComponent(body)}`;
  const req = https.request({
    hostname: "sctapi.ftqq.com",
    path: `/${SERVERCHAN_KEY}.send`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
    timeout: 10000,
  }, () => {});
  req.write(postData);
  req.end();
  console.log("  📤 已推送告警");
}

async function main() {
  console.log(`🔍 缺号探测 — ${new Date().toISOString().replace("T", " ").substring(0, 19)}\n`);

  const found = [];

  for (const m of MISSING) {
    // 尝试主 ID
    const r = await checkAnyfeeder(m.id);

    if (r.ok) {
      console.log(`  🟢 ${m.name} (${m.id}) → 已收录！${r.title?.substring(0, 35)}`);
      found.push({ name: m.name, id: m.id, title: r.title, date: r.date });
    } else {
      // 尝试别名
      const aliases = ALIASES[m.name] || [];
      let foundAlias = false;
      for (const alias of aliases) {
        if (alias === m.id) continue;
        const ar = await checkAnyfeeder(alias);
        if (ar.ok) {
          console.log(`  🟢 ${m.name} (${alias}) → 别名收录！${ar.title?.substring(0, 35)}`);
          found.push({ name: m.name, id: alias, title: ar.title, date: ar.date });
          foundAlias = true;
          break;
        }
      }
      if (!foundAlias) {
        console.log(`  🔴 ${m.name} (${m.id}) → 暂无数据`);
      }
    }

    // 间隔 1s
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n📊 已收录 ${found.length}/${MISSING.length}`);

  if (found.length > 0) {
    await pushAlert(found);
  }

  if (found.length === 0) {
    console.log("   （无变化，继续等待）");
  }
}

main().catch((e) => console.error("💥", e.message));
