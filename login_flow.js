const http = require('http');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const AUTH = 'weworkbuddy2026';

function apiPost(path, body = {}) {
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

function apiGet(path) {
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
  // Step 1: Create login URL
  console.log('正在生成登录二维码...');
  const create = await apiPost('/trpc/platform.createLoginUrl');
  const uuid = create?.result?.data?.uuid || create?.uuid;
  const scanUrl = create?.result?.data?.scanUrl || create?.scanUrl;
  
  if (!uuid || !scanUrl) {
    console.log('ERROR: 获取登录URL失败', JSON.stringify(create));
    process.exit(1);
  }
  console.log('UUID:', uuid);

  // Step 2: Generate QR code image using a public QR API
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(scanUrl);
  const qrPath = '/Users/404notfoundsunsi/WorkBuddy/2026-07-23-15-02-50/login_qr.png';
  
  await new Promise((resolve) => {
    const file = fs.createWriteStream(qrPath);
    https.get(qrUrl, (res) => { res.pipe(file); file.on('finish', resolve); });
  });
  console.log('二维码已生成:', qrPath);
  
  // Step 3: Open QR code image
  execSync('open "' + qrPath + '"');
  console.log('\n📱 请用微信扫描弹出的二维码');
  console.log('等待扫码中...\n');

  // Step 4: Poll for login result
  for (let i = 1; i <= 180; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const input = encodeURIComponent(JSON.stringify({ id: uuid }));
    const result = await apiGet('/trpc/platform.getLoginResult?input=' + input);
    
    const data = result?.result?.data || result;
    if (data?.vid && data?.token) {
      console.log('\n✅ 登录成功！vid=' + data.vid);
      console.log('TOKEN=' + data.token.substring(0, 30) + '...');
      
      fs.writeFileSync('/Users/404notfoundsunsi/WorkBuddy/2026-07-23-15-02-50/github_secrets.txt',
        'WEREAD_TOKEN=' + data.token + '\nWEREAD_VID=' + data.vid + '\nSERVERCHAN_KEY=SCT386332TbtNDfujIzU9B1hU71OKsWpnO\n');
      console.log('已保存到 github_secrets.txt');
      process.exit(0);
    }
    
    if (data?.message?.includes('expired')) {
      console.log('\n⚠️ 二维码已过期，请重新运行');
      process.exit(1);
    }
    
    if (i % 15 === 0) process.stdout.write('\n' + Math.round(i*1.5) + 's...');
  }
  console.log('\n⏰ 超时');
}

main();
