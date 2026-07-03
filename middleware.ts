import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders } from '@/lib/middleware/cors'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // Handle OPTIONS preflight early
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: { ...corsHeaders, ...SECURITY_HEADERS } })
  }

  const response = NextResponse.next()

  Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v))
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => response.headers.set(k, v))

  // HSTS only in production — not safe to send over HTTP
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
