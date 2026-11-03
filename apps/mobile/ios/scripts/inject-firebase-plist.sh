#!/bin/sh
# Decode FIREBASE_IOS_PLIST_BASE64 into Runner/GoogleService-Info.plist (Codemagic).
# Never prints plist or secret contents.

set -eu

IOS_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
OUT="${IOS_DIR}/Runner/GoogleService-Info.plist"
EXPECTED_BUNDLE_ID="com.r2p.after.afterApp"

require_env=0
if [ -n "${CM_BUILD_ID:-}" ] || [ -n "${CM_PROJECT_ID:-}" ]; then
  require_env=1
fi

validate_plist() {
  if [ ! -f "$OUT" ]; then
    echo "inject-firebase-plist: arquivo não gerado em Runner/GoogleService-Info.plist" >&2
    return 1
  fi
  if ! /usr/bin/plutil -lint "$OUT" >/dev/null 2>&1; then
    echo "inject-firebase-plist: plist inválido após decodificação" >&2
    return 1
  fi
  bundle_id=$(/usr/libexec/PlistBuddy -c "Print :BUNDLE_ID" "$OUT" 2>/dev/null || true)
  if [ -z "$bundle_id" ]; then
    echo "inject-firebase-plist: chave BUNDLE_ID ausente no plist" >&2
    return 1
  fi
  if [ "$bundle_id" != "$EXPECTED_BUNDLE_ID" ]; then
    echo "inject-firebase-plist: BUNDLE_ID incorreto (esperado ${EXPECTED_BUNDLE_ID})" >&2
    return 1
  fi
  return 0
}

if [ -n "${FIREBASE_IOS_PLIST_BASE64:-}" ]; then
  tmp=$(mktemp "${TMPDIR:-/tmp}/firebase-plist.XXXXXX")
  trap 'rm -f "$tmp"' EXIT INT HUP
  if ! printf '%s' "$FIREBASE_IOS_PLIST_BASE64" | /usr/bin/base64 -D >"$tmp" 2>/dev/null; then
    if ! printf '%s' "$FIREBASE_IOS_PLIST_BASE64" | /usr/bin/base64 -d >"$tmp" 2>/dev/null; then
      echo "inject-firebase-plist: FIREBASE_IOS_PLIST_BASE64 inválido (Base64)" >&2
      exit 1
    fi
  fi
  mv "$tmp" "$OUT"
  trap - EXIT INT HUP
  validate_plist
  exit 0
fi

if [ "$require_env" -eq 1 ]; then
  echo "inject-firebase-plist: FIREBASE_IOS_PLIST_BASE64 obrigatória no Codemagic" >&2
  exit 1
fi

if [ -f "$OUT" ]; then
  validate_plist
  exit 0
fi

echo "inject-firebase-plist: plist ausente; defina FIREBASE_IOS_PLIST_BASE64 ou coloque o arquivo localmente" >&2
exit 1
