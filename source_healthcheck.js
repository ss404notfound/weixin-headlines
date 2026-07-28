/**
 * source_healthcheck.js — RSS 数据源健康检查
 * 每 2 小时检测 all feeds，超过半数失败时通过 Server酱 告警
 */

const https = require("https");
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || "";

const FEEDS = [
  { name: "虎嗅APP",         url: "https://plink.anyfeeder.com/weixin/huxiu_com" },
  { name: "人物",             url: "https://plink.anyfeeder.com/weixin/renwumag1980" },
  { name: "X博士",            url: "https://plink.anyfeeder.com/weixin/doctorx666" },
  { name: "张佳玮",           url: "https://plink.anyfeeder.com/weixin/zhangjiawei_1983" },
  { name: "新世相",           url: "https://plink.anyfeeder.com/weixin/thefair2" },
  { name: "六神磊磊读金庸",   url: "https://plink.anyfeeder.com/weixin/dujinyong6" },
  { name: "饭统戴老板",       url: "https://plink.anyfeeder.com/weixin/worldofboss" },
  { name: "差评X.PIN",        url: "https://wechat2rss.xlab.app/feed/8d839de8dd3290a1f1be7a94423cccb30c1b087d.xml" },
  { name: "呦呦鹿鸣",         url: "https://wechat2rss.xlab.app/feed/fa89f27259f903b92f5f133140dd3f641110f9fd.xml" },
];

function check(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => {
        const ok = res.statusCode === 200 && /<item>/.test(d);
        resolve({ ok });
      });
    }).on("error", () => resolve({ ok: false }));
  });
}

async function main() {
  console.log(`🔍 RSS 健康检查 — ${new Date().toISOString()}\n`);

  const results = [];
  for (const f of FEEDS) {
    const r = await check(f.url);
    results.push({ name: f.name, ...r });
    console.log(`  ${r.ok ? "✅" : "❌"} ${f.name}`);
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  if (failCount > FEEDS.length / 2 && SERVERCHAN_KEY) {
    const body = `⚠️ RSS 数据源大面积故障\n${okCount}/${FEEDS.length} 可用\n\n` +
      results.filter((r) => !r.ok).map((r) => `- ${r.name}`).join("\n");

    const postData = `title=${encodeURIComponent("⚠️ RSS数据源告警")}&desp=${encodeURIComponent(body)}`;
    const req = https.request({
      hostname: "sctapi.ftqq.com",
      path: `/${SERVERCHAN_KEY}.send`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
      timeout: 10000,
    }, () => {});
    req.write(postData);
    req.end();
    console.log("\n📤 已发送告警");
  }

  if (failCount > 0) process.exit(1);
}

main();
