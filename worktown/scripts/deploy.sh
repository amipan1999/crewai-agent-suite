#!/usr/bin/env bash
# AI WORK TOWN を AWS にデプロイする。
#   ./scripts/deploy.sh                       … 既定（スタック名 ai-work-town）
#   STACK=my-town NOTIFY_EMAIL=you@example.com ./scripts/deploy.sh
# 必要: AWS CLI v2, AWS SAM CLI, Node.js 20+
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${STACK:-ai-work-town}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"
MODEL_ID="${MODEL_ID:-anthropic.claude-opus-5-5}"
# CloudFront → Lambda の検証ヘッダー。毎回作り直し、両者を同時に更新する
ORIGIN_SECRET="$(openssl rand -hex 24)"

echo "▶ パビリオン定義を web/data に書き出し"
node scripts/build-web-data.mjs

# SAM は空の値（NotifyEmail= など）を受け付けないので、指定があるものだけ渡す
PARAMS=("OriginVerifySecret=${ORIGIN_SECRET}" "ModelId=${MODEL_ID}")
[ -n "$NOTIFY_EMAIL" ] && PARAMS+=("NotifyEmail=${NOTIFY_EMAIL}")

echo "▶ SAM build & deploy (${STACK} / ${REGION})"
sam build --template-file template.yaml
sam deploy \
  --stack-name "$STACK" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMS[@]}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(output SiteBucketName)"
DIST="$(output DistributionId)"
URL="$(output SiteUrl)"

echo "▶ 静的サイトをアップロード"
aws s3 sync web/ "s3://${BUCKET}/" --delete --region "$REGION" \
  --cache-control "public, max-age=300"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

echo "✅ 開園しました: ${URL}"
