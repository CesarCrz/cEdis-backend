const isDev = process.env.NODE_ENV === "development"

export const logger = {
  /** Debug/info — dev only. */
  dev: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  /** Sensitive data (emails, tokens, auth links) — dev only. */
  sensitive: (...args: unknown[]) => {
    if (isDev) console.log("[sensitive]", ...args)
  },
  /** Operational errors — always logged to Vercel/server logs. Never reaches browser. */
  error: (...args: unknown[]) => {
    console.error(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
}
