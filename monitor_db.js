const { execSync } = require('child_process');
const fs = require('fs');

const dbPath = '/Users/404notfoundsunsi/WorkBuddy/2026-07-23-15-02-50/wewe-rss/apps/server/data/wewe-rss.db';

function getAccounts() {
  try {
    return execSync('sqlite3 "' + dbPath + '" "SELECT id, token, name, updatedAt FROM Account ORDER BY updatedAt DESC LIMIT 5;"', {encoding:'utf8'}).trim();
  } catch(e) { return ''; }
}

async function main() {
  const before = getAccounts();
  console.log('当前账号:');
  console.log(before || '(无)');
  console.log('\n请在浏览器中扫描 qrcode_login.html 的二维码');
  console.log('扫描成功后自动保存...\n');
  
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const after = getAccounts();
    if (after !== before) {
      console.log('\n✅ 检测到新账号!');
      console.log(after);
      
      const latest = execSync('sqlite3 "' + dbPath + '" "SELECT id, token FROM Account ORDER BY updatedAt DESC LIMIT 1;"', {encoding:'utf8'}).trim();
      const parts = latest.split('|');
      const vid = parts[0];
      const token = parts[1];
      
      fs.writeFileSync('/Users/404notfoundsunsi/WorkBuddy/2026-07-23-15-02-50/github_secrets.txt',
        'WEREAD_TOKEN=' + token + '\nWEREAD_VID=' + vid + '\nSERVERCHAN_KEY=SCT386332TbtNDfujIzU9B1hU71OKsWpnO\n');
      console.log('已保存到 github_secrets.txt');
      process.exit(0);
    }
    if (i % 20 === 0 && i > 0) process.stdout.write('\n' + Math.round(i*1.5) + 's 等待中...');
  }
  console.log('\n超时');
}

main();
