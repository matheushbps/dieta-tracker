import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  isSupabaseConfigured,
} from "./config.js?v=17";

const META_KEY = "dieta-tracker-sync-meta";

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;
let pushTimer = null;
let syncing = false;
let remoteRevision = 0;
let applyingRemote = false;
let realtimeChannel = null;

/** Callbacks injetados pelo app */
const hooks = {
  getPayload: () => ({}),
  applyRemote: (_data) => {},
  onStatus: (_status, _detail) => {},
  onSession: (_session) => {},
  onAfterRemoteApply: () => {},
};

export function configureSync(options = {}) {
  Object.assign(hooks, options);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function isConfigured() {
  return isSupabaseConfigured();
}

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveMeta(patch) {
  const next = { ...loadMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

function setStatus(status, detail = "") {
  hooks.onStatus(status, detail);
}

export async function initAuth() {
  const sb = getSupabase();
  if (!sb) {
    setStatus("erro", "Configure SUPABASE_URL e SUPABASE_ANON_KEY em js/config.js");
    hooks.onSession(null);
    return null;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  hooks.onSession(session);
  if (session) setStatus(navigator.onLine ? "salvo" : "offline");

  sb.auth.onAuthStateChange(async (event, nextSession) => {
    hooks.onSession(nextSession);
    if (event === "SIGNED_IN" && nextSession) {
      setStatus("sincronizando", "Entrando…");
      await pullAndMerge();
      subscribeRealtime(nextSession.user.id);
    }
    if (event === "SIGNED_OUT") {
      unsubscribeRealtime();
      remoteRevision = 0;
      setStatus("offline", "Desconectado");
    }
  });

  if (session) {
    await pullAndMerge();
    subscribeRealtime(session.user.id);
  }

  window.addEventListener("online", () => {
    setStatus("sincronizando", "Reconectando…");
    schedulePush(0);
    pullAndMerge();
  });
  window.addEventListener("offline", () => setStatus("offline", "Sem conexão"));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session) pullAndMerge();
  });

  return session;
}

export async function signInWithEmail(email) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase não configurado");
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await sb.auth.signInWithOtp({
    email: String(email).trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  unsubscribeRealtime();
  await sb.auth.signOut();
}

export function schedulePush(delayMs = 600) {
  if (applyingRemote) return;
  if (!navigator.onLine) {
    setStatus("offline", "Alteração salva localmente");
    saveMeta({ pendingPush: true });
    return;
  }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToCloud().catch((err) => {
      console.error(err);
      setStatus("erro", err.message || "Falha ao sincronizar");
    });
  }, delayMs);
}

export async function pushToCloud(attempt = 0) {
  const sb = getSupabase();
  if (!sb || syncing) return false;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return false;
  if (!navigator.onLine) {
    setStatus("offline", "Alteração salva localmente");
    saveMeta({ pendingPush: true });
    return false;
  }

  syncing = true;
  setStatus("sincronizando", "Enviando…");
  try {
    const payload = hooks.getPayload();
    const nextRevision = Math.max(remoteRevision, loadMeta().revision || 0) + 1;
    const row = {
      user_id: session.user.id,
      data: payload,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await sb
      .from("user_state")
      .select("revision")
      .eq("user_id", session.user.id)
      .maybeSingle();

    let error;
    if (!existing) {
      ({ error } = await sb.from("user_state").insert(row));
    } else if (Number(existing.revision) > remoteRevision) {
      syncing = false;
      await pullAndMerge();
      return attempt < 2 ? pushToCloud(attempt + 1) : false;
    } else {
      const result = await sb
        .from("user_state")
        .update({ data: row.data, revision: row.revision, updated_at: row.updated_at })
        .eq("user_id", session.user.id)
        .eq("revision", existing.revision)
        .select("revision");
      error = result.error;
      if (!error && (!result.data || !result.data.length)) {
        syncing = false;
        await pullAndMerge();
        return attempt < 2 ? pushToCloud(attempt + 1) : false;
      }
    }

    if (error) throw error;
    remoteRevision = nextRevision;
    saveMeta({ revision: nextRevision, pendingPush: false, updatedAt: row.updated_at });
    setStatus("salvo", "Sincronizado");
    return true;
  } catch (err) {
    saveMeta({ pendingPush: true });
    setStatus("erro", err.message || "Falha ao salvar na nuvem");
    throw err;
  } finally {
    syncing = false;
  }
}

export async function pullAndMerge() {
  const sb = getSupabase();
  if (!sb) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;

  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }

  setStatus("sincronizando", "Baixando…");
  const { data, error } = await sb
    .from("user_state")
    .select("data, revision, updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    setStatus("erro", error.message);
    return;
  }

  if (!data) {
    // primeira vez: sobe o estado local
    remoteRevision = 0;
    await pushToCloud();
    saveMeta({ mergedOnce: true });
    return;
  }

  const meta = loadMeta();
  const isFirstMerge = !meta.mergedOnce;
  remoteRevision = Number(data.revision) || 0;
  applyingRemote = true;
  try {
    // 1ª vez: une local + nuvem. Depois: nuvem (revisão mais nova) é a fonte da verdade.
    hooks.applyRemote(data.data || {}, { replace: !isFirstMerge });
    saveMeta({
      revision: remoteRevision,
      updatedAt: data.updated_at,
      pendingPush: isFirstMerge ? true : false,
      mergedOnce: true,
    });
  } finally {
    applyingRemote = false;
  }
  hooks.onAfterRemoteApply();

  if (isFirstMerge || loadMeta().pendingPush) {
    await pushToCloud();
  } else {
    setStatus("salvo", "Sincronizado");
  }
}

function subscribeRealtime(userId) {
  const sb = getSupabase();
  if (!sb) return;
  unsubscribeRealtime();
  realtimeChannel = sb
    .channel(`user_state:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_state",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new;
        if (!row || applyingRemote || syncing) return;
        if (Number(row.revision) <= remoteRevision) return;
        remoteRevision = Number(row.revision) || remoteRevision;
        applyingRemote = true;
        try {
          hooks.applyRemote(row.data || {}, { replace: true });
          saveMeta({ revision: remoteRevision, updatedAt: row.updated_at });
        } finally {
          applyingRemote = false;
        }
        hooks.onAfterRemoteApply();
        setStatus("salvo", "Atualizado de outro dispositivo");
      },
    )
    .subscribe();
}

function unsubscribeRealtime() {
  if (realtimeChannel && client) {
    client.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
}

export function isApplyingRemote() {
  return applyingRemote;
}
