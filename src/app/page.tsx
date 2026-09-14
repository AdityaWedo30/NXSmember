"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ServerData = {
  code: string;
  serverId: string;
  hostname: string;
  clients: number;
  maxClients: number;
  players: { id: number; name: string; ping: number }[];
  fetchedAt: string;
  connectUrl: string;
  iconUrl: string;
};

type Hourly = { time: string; label: string; max: number };
type NexusPlayer = { id: number; name: string; ping: number };
// history DB tetap ada tapi tidak dipakai untuk tabel NEXUS live
type RawRow = {
  id: number;
  clients: number;
  nexusCount: number;
  nexusPlayersParsed: NexusPlayer[] | null;
  nexusPlayers: string | null;
  createdAt: string;
};

const POLL_LIVE_MS = 5 * 60 * 1000; // tabel NEXUS live refresh 5 menit
const POLL_GRAPH_MS = 15 * 60 * 1000; // grafik NEXUS: baca/sample + simpan history tiap 15 menit

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function Home() {
  const [server, setServer] = useState<ServerData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hourly, setHourly] = useState<Hourly[]>([]);
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [stats, setStats] = useState<{ current: number; peak: number; avg: number } | null>(null);
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("24h");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [nextLiveAt, setNextLiveAt] = useState<number>(Date.now() + POLL_LIVE_MS);
  const [nextGraphAt, setNextGraphAt] = useState<number>(Date.now() + POLL_GRAPH_MS);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const fetchServer = useCallback(async () => {
    try {
      const r = await fetch("/api/server", { cache: "no-store" });
      if (!r.ok) throw new Error(`server ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setServer(j);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/history?range=${range}&serverId=NEXUS/nexus&code=6gk4e4`, { cache: "no-store" });
      const j = await r.json();
      setHourly(j.hourly ?? []);
      setRaw(j.raw ?? []);
      setStats(j.stats ?? null);
    } catch {}
  }, [range]);

  const saveSnapshot = async () => {
    setSaving(true);
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: "NEXUS/nexus", code: "6gk4e4" }),
      });
      await fetchHistory();
    } finally {
      setSaving(false);
    }
  };

  const saveAndRefresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: "NEXUS/nexus", code: "6gk4e4" }),
      });
      await fetchHistory();
    } catch {}
  }, [fetchHistory]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchServer(), fetchHistory()]).finally(() => setLoading(false));

    // countdown init
    const now = Date.now();
    setNextLiveAt(now + POLL_LIVE_MS);
    setNextGraphAt(now + POLL_GRAPH_MS);

    // live NEXUS 5m, grafik NEXUS 15m (history hanya NEXUS)
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;
    const loopServer = () => {
      t1 = setTimeout(async () => {
        await fetchServer();
        setNextLiveAt(Date.now() + POLL_LIVE_MS);
        loopServer();
      }, POLL_LIVE_MS);
    };
    const loopHistory = () => {
      t2 = setTimeout(async () => {
        await fetchHistory();
        loopHistory();
      }, POLL_GRAPH_MS);
    };
    const loopSave = () => {
      t3 = setTimeout(async () => {
        await saveAndRefresh();
        setNextGraphAt(Date.now() + POLL_GRAPH_MS);
        await fetchHistory();
        loopSave();
      }, POLL_GRAPH_MS);
    };
    // save awal untuk isi grafik jika kosong, lalu polling (live 5m, grafik 15m)
    saveAndRefresh().then(() => setNextGraphAt(Date.now() + POLL_GRAPH_MS));
    fetchServer().then(() => setNextLiveAt(Date.now() + POLL_LIVE_MS));
    loopServer();
    loopHistory();
    loopSave();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchServer().then(() => setNextLiveAt(Date.now() + POLL_LIVE_MS));
        fetchHistory();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchServer, fetchHistory, saveAndRefresh]);

  const pct = server ? Math.round((server.clients / server.maxClients) * 100) : 0;
  const filteredPlayers = useMemo(() => {
    if (!server?.players) return [];
    const s = q.trim().toLowerCase();
    if (!s) return server.players;
    return server.players.filter((p) => p.name.toLowerCase().includes(s));
  }, [server?.players, q]);

  // Tabel Snapshot = live NEXUS saja (bukan history DB), refresh tiap 5 menit via fetchServer
  const nexusLive = useMemo(() => {
    if (!server?.players) return [];
    return server.players.filter((p) => p.name.toLowerCase().includes("nexus"));
  }, [server?.players]);

  return (
    <div className="min-h-screen bg-[#061a29] text-slate-100">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-[#061a29]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 font-bold text-white">N</div>
            <div>
              <div className="text-sm font-semibold tracking-wide">NEXUS / nexus — FiveM Monitor</div>
              <div className="text-xs text-slate-400">
                connect: <a className="text-sky-400 hover:underline" href="https://cfx.re/join/6gk4e4" target="_blank">cfx.re/join/6gk4e4</a> • live {fmtCountdown(nextLiveAt - nowTick)} • grafik {fmtCountdown(nextGraphAt - nowTick)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${err ? "bg-red-500" : "bg-emerald-400 animate-pulse"}`} />
            <span className="text-xs text-slate-400">{err ? "offline" : "live"}</span>
            <button onClick={saveSnapshot} disabled={saving} className="ml-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50">
              {saving ? "Saving..." : "Simpan snapshot"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {loading && <div className="text-sm text-sky-200/70">Loading...</div>}
        {err && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{err}</div>}

        {/* indikator */}
        <section className="grid gap-4 md:grid-cols-4">
          <Card title="Player Online" value={server ? `${server.clients} / ${server.maxClients}` : "-"} sub={`${pct}% capacity`} accent />
          <Card title="NEXUS Peak (15m)" value={stats ? String(stats.peak) : "-"} sub="max NEXUS tercatat" />
          <Card title="NEXUS Avg (range)" value={stats ? String(stats.avg) : "-"} sub={`range ${range} • NEXUS only`} />
          <Card title="Hostname" value={server?.hostname ?? "-"} sub={server ? new Date(server.fetchedAt).toLocaleString("id-ID") : ""} />
        </section>

        <section className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-4">
          <div className="mb-1 text-sm font-semibold">Occupancy bar</div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-gradient-to-r from-sky-600 to-cyan-400 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-400">{server?.clients ?? 0} player • slot {server?.maxClients ?? 2048}</div>
        </section>

        {/* grafik hanya NEXUS per 15 menit */}
        <section className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Grafik NEXUS — jumlah player NEXUS per 15 menit (kode 6gk4e4) <span className="font-mono text-xs font-normal text-slate-400">• refresh {fmtCountdown(nextGraphAt - nowTick)}</span></h2>
            <div className="flex gap-1">
              {(["24h", "7d", "30d", "all"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setRange(k)}
                  className={`rounded-lg px-3 py-1 text-xs ${range === k ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[320px] w-full">
            {hourly.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Belum ada history NEXUS. Grafik mencatat jumlah NEXUS per 15 menit. Endpoint: <code className="mx-1 rounded bg-slate-800 px-1">/api/cron</code> (Vercel Cron */15) + autosave frontend 15m.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4a" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis domain={[1, 35]} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#0c2a3d", border: "1px solid #1e4a5f", borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="max" name="PLAYER" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 5, fill: "#ef4444", stroke: "#061a29", strokeWidth: 1.5 }} activeDot={{ r: 7, fill: "#ef4444", stroke: "#061a29" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

        </section>

        {/* tabel NEXUS live — bukan history DB, refresh tiap 5 menit + saat kembali ke tab */}
        <section className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">NEXUS Aktif — live (nama mengandung &quot;nexus&quot;) <span className="font-mono text-xs font-normal text-slate-400">• {fmtCountdown(nextLiveAt - nowTick)}</span></h2>
            <span className="text-xs text-slate-400">
              {server ? `${nexusLive.length} org` : "—"} {server?.fetchedAt ? `• ${new Date(server.fetchedAt).toLocaleString("id-ID")}` : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="pb-2">Nama</th>
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Ping</th>
                </tr>
              </thead>
              <tbody>
                {!server ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">Memuat…</td></tr>
                ) : nexusLive.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">Tidak ada player NEXUS yang aktif saat ini.</td></tr>
                ) : (
                  nexusLive.map((p) => (
                    <tr key={`${p.id}-${p.name}`} className="border-t border-sky-900/40">
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-400">#{p.id}</td>
                      <td className="py-2 text-xs text-slate-400">{p.ping} ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* players live */}
        <section className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Player List Live ({server?.players.length ?? 0}{q ? ` • hasil "${q}": ${filteredPlayers.length}` : ""})</h2>
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama... cth: nexus"
                className="w-56 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              {q && (
                <button onClick={() => setQ("")} className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-700">
                  Clear
                </button>
              )}
            </div>
          </div>

          {filteredPlayers.length ? (
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPlayers.slice(0, 200).map((p) => {
                const isMatch = q.trim() && p.name.toLowerCase().includes(q.trim().toLowerCase());
                return (
                  <div key={`${p.id}-${p.name}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isMatch ? "bg-sky-900/40 ring-1 ring-sky-600" : "bg-slate-800/60"}`}>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-slate-400">{p.ping} ms</span>
                  </div>
                );
              })}
            </div>
          ) : server?.players.length ? (
            <div className="text-sm text-slate-400">Tidak ada player dengan nama &quot;{q}&quot;. Coba kata kunci lain.</div>
          ) : (
            <div className="text-sm text-slate-400">Tidak ada data player atau server private.</div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-500">
        NEXUS/nexus • 6gk4e4 • Satu Mimpi Roleplay • Built with Next.js
      </footer>
    </div>
  );
}

function Card({ title, value, sub, accent }: { title: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-sky-700 bg-sky-900/30" : "border-sky-900/60 bg-sky-950/30"}`}>
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-1 truncate text-xl font-bold">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}
