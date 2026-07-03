// Convert a quantity from one unit to another (same tipo)
// Uses factor relative to base unit (g for peso, mL for volumen, pza for unidad)
// Returns null if units are incompatible (different tipo)
export function convertUnits(
  cantidad: number,
  fromFactor: number,
  toFactor: number,
  fromTipo: string,
  toTipo: string
): number | null {
  if (fromTipo !== toTipo) return null
  // Convert to base then to target
  return (cantidad * fromFactor) / toFactor
}

// Convert to base unit (g, mL, or pza)
export function toBaseUnits(cantidad: number, factor: number): number {
  return cantidad * factor
}
