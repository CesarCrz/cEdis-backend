import { NextResponse } from 'next/server'
import type { ApiResponse, PaginatedResponse } from '@/types'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null } satisfies ApiResponse<T>, { status })
}

export function err(code: string, message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ data: null, error: { code, message, details } }, { status })
}

export function paginated<T>(data: T[], meta: { total: number; page: number; limit: number }): NextResponse {
  return NextResponse.json({
    data,
    error: null,
    meta: { ...meta, pages: Math.ceil(meta.total / meta.limit) }
  } satisfies PaginatedResponse<T>)
}
