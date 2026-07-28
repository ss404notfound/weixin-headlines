#!/bin/bash
# 获取新二维码 UUID 并轮询登录结果
UUID=$(curl -s -X POST http://localhost:4000/trpc/platform.createLoginUrl \
  -H "Content-Type: application/json" \
  -H "Authorization: weworkbuddy2026" \
  -d '{}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('data',{}).get('uuid',''))")

echo "UUID: $UUID"

for i in $(seq 1 90); do
  encoded=$(python3 -c "import urllib.parse,json; print(urllib.parse.quote(json.dumps({'id':'$UUID'})))")
  result=$(curl -s "http://localhost:4000/trpc/platform.getLoginResult?input=$encoded" -H "Authorization: weworkbuddy2026" 2>/dev/null)
  
  if echo "$result" | grep -q '"vid"'; then
    vid=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('data',{}).get('vid',''))")
    token=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('data',{}).get('token',''))")
    echo ""
    echo "SCAN_OK vid=$vid token=${token:0:30}..."
    
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    printf "WEREAD_TOKEN=%s\nWEREAD_VID=%s\nSERVERCHAN_KEY=SCT386332TbtNDfujIzU9B1hU71OKsWpnO\n" "$token" "$vid" > "$SCRIPT_DIR/github_secrets.txt"
    echo "SAVED"
    exit 0
  fi
  
  printf "."
  sleep 2
done
echo ""
echo "TIMEOUT"
