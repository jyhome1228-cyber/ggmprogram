#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT="ggmapi-e15be"
MALL="ggmspa"
echo "GGM Shipping | Firebase Functions one-time deployment"
echo "Project: $PROJECT | Cafe24 mall: $MALL"
echo "This script does not write secrets to GitHub or print entered values."
command -v gcloud >/dev/null || { echo "Run from Google Cloud Shell (gcloud is required)."; exit 1; }
gcloud config set project "$PROJECT" >/dev/null
if ! command -v firebase >/dev/null; then
  npm install -g firebase-tools
fi
if ! firebase projects:list --json >/dev/null 2>&1; then
  echo "Firebase CLI sign-in is needed. Follow the browser instructions."
  firebase login --no-localhost
fi
npm --prefix functions install --no-audit --no-fund
printf 'Firebase admin UID (from Authentication users): '
IFS= read -r admin_uid
if [[ ! "$admin_uid" =~ ^[A-Za-z0-9]{15,128}$ ]]; then
  echo "Invalid UID. Stop without deploying."
  exit 1
fi
printf 'CAFE24_MALL_ID=%s\nGGM_ADMIN_UID=%s\n' "$MALL" "$admin_uid" > "functions/.env.$PROJECT"
chmod 600 "functions/.env.$PROJECT"
echo "Enter the current Cafe24 Client ID in the Firebase CLI prompt (not in chat):"
firebase functions:secrets:set CAFE24_CLIENT_ID --project "$PROJECT"
echo "Enter the ROTATED Cafe24 Client Secret in the Firebase CLI prompt:"
firebase functions:secrets:set CAFE24_CLIENT_SECRET --project "$PROJECT"
node --check functions/index.js
firebase deploy --only functions --project "$PROJECT"
echo "Deployment completed. Register this redirect URI in Cafe24:"
echo "https://asia-northeast3-$PROJECT.cloudfunctions.net/cafe24Callback"
echo "Visit https://jyhome1228-cyber.github.io/ggmprogram/manage.html"
