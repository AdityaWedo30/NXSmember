import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/cron -> dipanggil Vercel Cron tiap 15 menit (grafik hanya NEXUS, baca per 15 menit)
// Autosave live NEXUS tiap 5 menit ditangani frontend polling (lihat page.tsx)
// Di local bisa tanpa key, di production set CRON_SECRET
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (secret && key !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const code = "6gk4e4";
  const serverId = "NEXUS/nexus";

  try {
    const res = await fetch(`https://frontend.cfx-services.net/api/servers/single/${code}`, {
      headers: { "User-Agent": "FiveM-Monitor/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `cfx ${res.status}` }, { status: 502 });
    const json = await res.json();
    const d = json.Data;

    // dedup: cron 15m + autosave jangan double-write (< 60s)
    const last = await prisma.serverSnapshot.findFirst({
      where: { code, serverId },
      orderBy: { createdAt: "desc" },
    });
    if (last && Date.now() - new Date(last.createdAt).getTime() < 60 * 1000 && searchParams.get("force") !== "1") {
      return NextResponse.json({ ok: true, skipped: true, reason: "too soon (<60s)", last });
    }

    const players: Array<{ id: number; name: string; ping: number }> = Array.isArray(d.players) ? d.players : [];
    const nexusPlayers = players.filter((p) => typeof p.name === "string" && p.name.toLowerCase().includes("nexus"));
    const nexusCount = nexusPlayers.length;

    const row = await prisma.serverSnapshot.create({
      data: {
        serverId,
        code,
        hostname: d.hostname,
        clients: d.clients,
        maxClients: d.sv_maxclients ?? d.svMaxclients ?? 2048,
        nexusCount,
        nexusPlayers: JSON.stringify(nexusPlayers),
      },
    });
    return NextResponse.json({ ok: true, row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
