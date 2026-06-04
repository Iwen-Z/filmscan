#!/usr/bin/env bash
# 无头自检:在 vite preview(build 产物)上跑页内 selftest,grep 浮层文本判 PASS/FAIL。
#   流程:npm run build → vite preview(后台,固定端口) → 无头 Chrome dump DOM
#         → grep "SELFTEST PASS" → 杀 preview → 退出码 0(PASS)/ 1(FAIL)。
#   一键重跑:`npm run selftest:headless`。
#   macOS bash 3.2 兼容(无 mapfile / declare -A)。
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${SELFTEST_PORT:-4173}"
URL="http://localhost:${PORT}/?selftest"
PREVIEW_PID=""
CHROME_PID=""

# 本地回环不走代理(开发机可能全局设了 http_proxy/all_proxy,会把 localhost 劫持成 502)。
export NO_PROXY="localhost,127.0.0.1,::1${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"

cleanup() {
  if [ -n "$CHROME_PID" ] && kill -0 "$CHROME_PID" 2>/dev/null; then
    kill "$CHROME_PID" 2>/dev/null
  fi
  if [ -n "$PREVIEW_PID" ] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null
    wait "$PREVIEW_PID" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# —— 定位无头 Chrome:PATH 上的常见名 + macOS app 路径,可用 CHROME 覆盖 ——
find_chrome() {
  if [ -n "${CHROME:-}" ] && [ -x "${CHROME}" ]; then echo "$CHROME"; return 0; fi
  local c
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return 0; fi
  done
  for c \
    in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
       "/Applications/Chromium.app/Contents/MacOS/Chromium" \
       "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
    if [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

CHROME_BIN="$(find_chrome)" || {
  echo "FAIL: 找不到无头 Chrome。手动等价验证见 README「无头自检」一节:" >&2
  echo "      npm run build && npm run preview,浏览器访问 ${URL}" >&2
  exit 1
}
echo "[selftest-headless] chrome = $CHROME_BIN"

# —— 1) 构建产物 ——
echo "[selftest-headless] npm run build ..."
npm run build >/tmp/selftest-build.log 2>&1 || { echo "FAIL: build 失败" >&2; cat /tmp/selftest-build.log >&2; exit 1; }

# —— 2) 起 preview(固定端口、严格,避免端口漂移导致 URL 不对) ——
echo "[selftest-headless] vite preview :$PORT ..."
npx vite preview --port "$PORT" --strictPort >/tmp/selftest-preview.log 2>&1 &
PREVIEW_PID=$!

# 等服务器就绪(最多 ~20s)
up=""
i=0
while [ "$i" -lt 100 ]; do
  if curl -fsS --noproxy '*' "http://localhost:${PORT}/" >/dev/null 2>&1; then up=1; break; fi
  if ! kill -0 "$PREVIEW_PID" 2>/dev/null; then echo "FAIL: preview 进程提前退出" >&2; cat /tmp/selftest-preview.log >&2; exit 1; fi
  sleep 0.2
  i=$((i+1))
done
[ -n "$up" ] || { echo "FAIL: preview 未就绪" >&2; cat /tmp/selftest-preview.log >&2; exit 1; }

# —— 3) 无头 Chrome dump DOM ——
# 注意:新版(无 old headless 的)Chrome 在 --dump-dom 后**不会自行退出**——
#   它把 DOM 打到 stdout 就一直挂着。所以这里把 stdout 重定向到文件,
#   轮询文件出现 selftest 浮层文本即收工,再主动杀掉 Chrome(别等它自退)。
PROFILE="$(mktemp -d /tmp/selftest-chrome.XXXXXX)"
DOMFILE="$(mktemp /tmp/selftest-dom.XXXXXX)"
echo "[selftest-headless] headless chrome dump-dom $URL ..."
"$CHROME_BIN" \
  --headless --disable-gpu --no-sandbox \
  --no-proxy-server \
  --virtual-time-budget=3000 \
  --user-data-dir="$PROFILE" \
  --dump-dom "$URL" >"$DOMFILE" 2>/dev/null &
CHROME_PID=$!

# 轮询 DOM 文件出现 PASS/FAIL 浮层文本(最多 ~30s)
verdict=""
i=0
while [ "$i" -lt 60 ]; do
  if grep -q "SELFTEST PASS" "$DOMFILE" 2>/dev/null; then verdict="PASS"; break; fi
  if grep -q "SELFTEST FAIL" "$DOMFILE" 2>/dev/null; then verdict="FAIL"; break; fi
  if ! kill -0 "$CHROME_PID" 2>/dev/null; then break; fi   # chrome 自己退了(老行为也兼容)
  sleep 0.5
  i=$((i+1))
done

kill "$CHROME_PID" 2>/dev/null
wait "$CHROME_PID" 2>/dev/null
DOM="$(cat "$DOMFILE" 2>/dev/null)"
rm -rf "$PROFILE" "$DOMFILE"

# —— 4) grep 浮层文本判定 ——
if [ "$verdict" = "PASS" ]; then
  echo "[selftest-headless] SELFTEST PASS"
  exit 0
fi

echo "FAIL: 浮层未出现 SELFTEST PASS" >&2
# 把 FAIL 浮层(若有)摘出来帮排查
printf '%s' "$DOM" | grep -o "SELFTEST FAIL[^<]*" >&2 || echo "(DOM 中无 selftest 浮层,可能脚本未执行/虚拟时间不足)" >&2
exit 1
