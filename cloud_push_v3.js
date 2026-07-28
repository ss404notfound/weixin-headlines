/**
 * cloud_push_v3.js — 公众号头条 RSS 聚合推送
 * 
 * 数据源：
 *   - anyfeeder.com (7个号): 虎嗅/人物/X博士/张佳玮/新世相/六神磊磊/饭统戴老板
 *   - wechat2rss.xlab.app (2个号): 差评/呦呦鹿鸣
 * 
 * 推送：Server酱
 * 运行：node cloud_push_v3.js [--dry-run]
 */

const https = require("https");
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || "";

// ─── 公众号定义 ────────────────────────────────────────────
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

// ─── RSS 解析 ──────────────────────────────────────────────
function parseRSSItem(xml) {
  // 提取第一个 <item> 的 title, link, pubDate
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;

  const item = itemMatch[1];

  const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
  const linkMatch = item.match(/<link>\s*([^<]+?)\s*<\/link>/);
  const dateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);

  // anyfeeder 的 link 用的是搜狗 url，wechat2rss 用的是 mp.weixin.qq.com 直链
  const link = linkMatch ? linkMatch[1].trim() : "";

  return {
    title: titleMatch ? titleMatch[1].trim() : "(无标题)",
    link: link,
    pubDate: dateMatch ? dateMatch[1] : null,
  };
}

// ─── HTTP fetch ────────────────────────────────────────────
function fetchFeed(feed) {
  return new Promise((resolve) => {
    const url = new URL(feed.url);
    const proto = url.protocol === "https:" ? https : require("http");

    const req = proto.get(feed.url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve({ name: feed.name, ok: false, error: `HTTP ${res.statusCode}` });
          return;
        }
        const item = parseRSSItem(data);
        if (!item || !item.title) {
          resolve({ name: feed.name, ok: false, error: "解析失败" });
          return;
        }
        resolve({ name: feed.name, ok: true, ...item });
      });
    });

    req.on("error", (e) => {
      resolve({ name: feed.name, ok: false, error: e.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ name: feed.name, ok: false, error: "超时" });
    });
  });
}

// ─── Server酱 推送 ─────────────────────────────────────────
function pushViaServerChan(title, body) {
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
      timeout: 15000,
    }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(d);
          resolve(j.code === 0 || j.errno === 0);
        } catch {
          resolve(false);
        }
      });
    });

    req.on("error", () => resolve(false));
    req.write(postData);
    req.end();
  });
}

// ─── 日期格式化 ────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "未知";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.substring(0, 16);
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch {
    return dateStr.substring(0, 16);
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n📡 cloud_push_v3.js — ${todayStr()}${dryRun ? " [DRY RUN]" : ""}\n`);

  // 逐个抓取（不要并发，尊重源站）
  const results = [];
  for (const feed of FEEDS) {
    console.log(`  ➤ ${feed.name}...`);
    const r = await fetchFeed(feed);
    const icon = r.ok ? "✅" : "❌";
    const info = r.ok ? `[${formatDate(r.pubDate)}] ${r.title.substring(0, 35)}` : r.error;
    console.log(`    ${icon} ${info}`);
    results.push(r);
    // 间隔 1 秒
    await new Promise((r) => setTimeout(r, 1000));
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`\n📊 成功 ${okCount}/${results.length}，失败 ${failCount}`);

  // 构建推送内容
  const dateHeader = todayStr();
  let body = `## 📰 公众号头条速览 | ${dateHeader}\n\n`;

  for (const r of results) {
    if (r.ok) {
      body += `### ${r.name}\n`;
      body += `> ${r.title}\n`;
      if (r.link) {
        body += `🔗 [阅读原文](${r.link})\n`;
      }
      body += `📅 ${formatDate(r.pubDate)}\n\n`;
    } else {
      body += `### ${r.name}\n`;
      body += `> ⚠️ 抓取失败：${r.error}\n\n`;
    }
  }

  body += `---\n🤖 自动推送 | ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;

  if (dryRun) {
    console.log("\n📝 [DRY RUN] 推送内容预览:\n");
    console.log(body);
    console.log("\n[DRY RUN 结束，未实际推送]");
    return;
  }

  // 实际推送
  console.log("\n📤 正在推送到 Server酱...");
  const title = `${dateHeader} 公众号头条速览 (${okCount}/${results.length})`;
  const pushed = await pushViaServerChan(title, body);
  console.log(pushed ? "✅ 推送成功！" : "❌ 推送失败");
}

main().catch((e) => {
  console.error("💥 异常:", e.message);
  process.exit(1);
});
