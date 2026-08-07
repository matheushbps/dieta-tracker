/**
 * Credenciais do projeto Supabase (Settings → API).
 * Podem ficar no repositório: a chave `anon` é pública; a segurança vem do RLS.
 *
 * Redirect URLs (Auth → URL Configuration):
 *   https://matheushbps.github.io/dieta-tracker/
 *   http://localhost:5173/
 *
 * Alternativa: na tela de login, cole URL e chave (salvas só neste navegador).
 */
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

const LS_URL = "dieta-supabase-url";
const LS_KEY = "dieta-supabase-anon";

export function getSupabaseUrl() {
  try {
    return (localStorage.getItem(LS_URL) || SUPABASE_URL || "").trim();
  } catch {
    return SUPABASE_URL;
  }
}

export function getSupabaseAnonKey() {
  try {
    return (localStorage.getItem(LS_KEY) || SUPABASE_ANON_KEY || "").trim();
  } catch {
    return SUPABASE_ANON_KEY;
  }
}

export function saveSupabaseConfig(url, anonKey) {
  localStorage.setItem(LS_URL, String(url || "").trim());
  localStorage.setItem(LS_KEY, String(anonKey || "").trim());
}

export function isSupabaseConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(url && key && url.includes("http") && !url.includes("SEU_PROJETO"));
}
