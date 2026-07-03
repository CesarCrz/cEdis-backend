import { NextRequest, NextResponse } from 'next/server'

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)
}

function getAllowedIps(): string[] {
  return (process.env.ALLOWED_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean)
}

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins()
  const isAllowed = origin !== null && allowed.includes(origin)

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-confirm-delete',
    'Access-Control-Max-Age': '86400',
  }

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }

  return headers
}

export async function withCors(
  req: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // IP allowlist: if ALLOWED_IPS is set, block requests from unlisted IPs
  const allowedIps = getAllowedIps()
  if (allowedIps.length > 0) {
    const requestIp = getRequestIp(req)
    if (!allowedIps.includes(requestIp)) {
      return new NextResponse(
        JSON.stringify({ error: 'FORBIDDEN', message: 'IP not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }
  }

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders })
  }

  const response = await handler()
  Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v))
  return response
}

export { getCorsHeaders }
