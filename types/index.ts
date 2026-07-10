export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer'
export type StockLevel = 'ok' | 'warn' | 'low' | 'critical'
export type EntradaStatus = 'draft' | 'confirmed' | 'cancelled'
export type TicketStatus = 'draft' | 'confirmed' | 'delivered' | 'cancelled'
export type KardexTipo = 'entrada' | 'salida_venta' | 'ajuste_manual' | 'venta_declarada' | 'merma'
export type UoMTipo = 'peso' | 'volumen' | 'unidad'
export type NotificacionTipo = 'stock_bajo' | 'ticket_pendiente' | 'invitacion'

export interface AuthContext {
  userId: string
  cedisId: string
  role: UserRole
}

export interface ApiResponse<T> {
  data: T | null
  error: { code: string; message: string; details?: unknown } | null
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: { total: number; page: number; limit: number; pages: number }
}
