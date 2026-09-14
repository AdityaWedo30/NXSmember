import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "24h"; // 24h | 7d | 30d | all
  const serverId = searchParams.get("serverId") ?? "NEXUS/nexus";
  const code = searchParams.get("code") ?? "6gk4e4";

  const now = new Date();
  let since: Date | undefined;
  if (range === "24h") since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (range === "7d") since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (range === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { serverId, code };
  if (since) (where as Record<string, unknown>).createdAt = { gte: since };

  const rows = await prisma.serverSnapshot.findMany({
    where: where as never,
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  // Grafik HANYA NEXUS — max saja per 15 menit (baca/sampling tiap 15 menit)
  const buckets = new Map<string, { max: number; ts: string }>();
  for (const r of rows) {
    const v = (r as { nexusCount?: number }).nexusCount ?? 0;
    const d = new Date(r.createdAt);
    d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
    const key = d.toISOString();
    const b = buckets.get(key) ?? { max: -1, ts: key };
    b.max = Math.max(b.max, v);
    buckets.set(key, b);
  }
  const hourly = Array.from(buckets.values())
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((b) => ({
      time: b.ts,
      label: new Date(b.ts).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }),
      max: b.max,
    }));

  // stats — hanya NEXUS (bukan total clients)
  const nexusArr = rows.map((r: { nexusCount?: number }) => (r as { nexusCount?: number }).nexusCount ?? 0);
  const peak = nexusArr.length ? Math.max(...nexusArr) : 0;
  const current = nexusArr.length ? nexusArr[nexusArr.length - 1] : 0;
  const avg = nexusArr.length ? Math.round(nexusArr.reduce((a: number, b: number) => a + b, 0) / nexusArr.length) : 0;

  // parse nexusPlayers JSON per row untuk dikirim ke frontend
  const rawWithNexus = rows.map((r: { nexusPlayers?: string | null; nexusCount?: number }) => {
    let parsed: Array<{ id: number; name: string; ping: number }> | null = null;
    if (r.nexusPlayers) {
      try {
        parsed = JSON.parse(r.nexusPlayers as string);
      } catch {
        parsed = null;
      }
    }
    return { ...r, nexusPlayersParsed: parsed };
  });

  return NextResponse.json({
    serverId,
    code,
    range,
    total: rows.length,
    stats: { current, peak, avg },
    hourly,
    raw: rawWithNexus, // tabel detail per snapshot, termasuk nexusPlayersParsed & nexusCount
  });
}

// Manual trigger: POST {serverId, code} -> fetch + save snapshot (dipakai cron & tombol)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const serverId = body.serverId ?? "NEXUS/nexus";
    const code = body.code ?? "6gk4e4";
    const url = `https://frontend.cfx-services.net/api/servers/single/${code}`;
    const res = await fetch(url, { headers: { "User-Agent": "FiveM-Monitor/1.0" }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `fetch ${res.status}` }, { status: 502 });
    const json = await res.json();
    const d = json.Data;
    const players: Array<{ id: number; name: string; ping: number }> = Array.isArray(d.players) ? d.players : [];
    const nexusPlayers = players.filter((p) => typeof p.name === "string" && p.name.toLowerCase().includes("nexus"));
    const row = await prisma.serverSnapshot.create({
      data: {
        serverId,
        code,
        hostname: d.hostname ?? "unknown",
        clients: d.clients ?? 0,
        maxClients: d.sv_maxclients ?? d.svMaxclients ?? 2048,
        nexusCount: nexusPlayers.length,
        nexusPlayers: JSON.stringify(nexusPlayers),
      },
    });
    return NextResponse.json({ ok: true, row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
