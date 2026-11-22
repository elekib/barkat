/** Security events go to the log with a fixed prefix. Never pass passwords or tokens. */
export const audit = (msg: string, fields: Record<string, unknown> = {}) =>
  console.warn(`[security] ${msg}`, JSON.stringify(fields));
