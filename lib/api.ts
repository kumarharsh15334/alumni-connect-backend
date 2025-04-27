// alumni-connect/lib/api.ts

/** 
 * Point this at your backend. 
 * In dev that’s http://localhost:4000 
 * In prod set NEXT_PUBLIC_BACKEND_URL in Vercel/Netlify env. 
 */
export const API =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:4000"
