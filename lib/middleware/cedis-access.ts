import type { UserRole } from '@/types'

const ROLE_WEIGHT: Record<UserRole, number> = {
  owner: 3,
  admin: 2,
  viewer: 1,
}

// Returns true if actual role meets or exceeds required role
export function requireRole(required: UserRole, actual: UserRole): boolean {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required]
}
