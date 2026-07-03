import { DEFAULT_PAGE_LIMIT } from '@/lib/constants'

const MAX_LIMIT = 200

interface PaginationResult {
  from: number
  to: number
  page: number
  limit: number
}

export function parsePagination(searchParams: URLSearchParams): PaginationResult {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT)
  )
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { from, to, page, limit }
}
