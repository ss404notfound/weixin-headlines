const http = require('http');

const AUTH = 'weworkbuddy2026';

function post(path, body = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 4000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH, 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: 'localhost', port: 4000, path, headers: { 'Authorization': AUTH } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
  });
}

async function main() {
  // Step 1: create login URL
  const create = await post('/trpc/platform.createLoginUrl');
  const uuid = create?.result?.data?.uuid || create?.uuid;
  if (!uuid) { console.log('ERROR: Failed to create login URL'); process.exit(1); }
  console.log(`UUID: ${uuid}`);
  console.log(`请在浏览器中打开 http://localhost:8765/qrcode_login.html 扫码`);

  // Step 2: poll for result
  for (let i = 1; i <= 120; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const input = encodeURIComponent(JSON.stringify({ id: uuid }));
    const result = await get(`/trpc/platform.getLoginResult?input=${input}`);
    
    const data = result?.result?.data || result;
    if (data?.vid && data?.token) {
      console.log(`\n✅ 扫描成功！vid=${data.vid}`);
      console.log(`TOKEN=${data.token.substring(0, 30)}...`);
      
      // Save
      const fs = require('fs');
      const content = `WEREAD_TOKEN=${data.token}\nWEREAD_VID=${data.vid}\nSERVERCHAN_KEY=SCT386332TbtNDfujIzU9B1hU71OKsWpnO\n`;
      fs.writeFileSync('/Users/404notfoundsunsi/WorkBuddy/2026-07-23-15-02-50/github_secrets.txt', content);
      console.log('已保存到 github_secrets.txt');
      process.exit(0);
    }
    
    if (i % 10 === 0) process.stdout.write(`${i}s `);
  }
  console.log('\n⏰ 超时');
}

main();
