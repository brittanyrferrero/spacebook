export const dynamic = 'force-dynamic'

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'dev'

export function GET() {
  return Response.json({ version: VERSION })
}
