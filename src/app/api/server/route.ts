import { NextResponse } from "next/server";

const CODE = "6gk4e4";
const SERVER_ID = "NEXUS/nexus";
const CFX_URL = `https://frontend.cfx-services.net/api/servers/single/${CODE}`;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(CFX_URL, {
      headers: { "User-Agent": "FiveM-Monitor/1.0" },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `CFX fetch failed: ${res.status}`, code: CODE, serverId: SERVER_ID },
        { status: 502 }
      );
    }
    const json = await res.json();
    const d = json.Data;

    // normalize
    const payload = {
      code: CODE,
      serverId: SERVER_ID,
      hostname: d.hostname as string,
      clients: d.clients as number,
      maxClients: (d.sv_maxclients ?? d.svMaxclients ?? 2048) as number,
      selfReportedClients: d.selfReportedClients as number,
      gametype: d.gametype,
      mapname: d.mapname,
      vars: d.vars,
      players: (d.players as Array<{ id: number; name: string; ping: number; identifiers: string[] }>) ?? [],
      ownerName: d.ownerName,
      iconVersion: d.iconVersion,
      lastSeen: d.lastSeen,
      fetchedAt: new Date().toISOString(),
      connectUrl: `https://cfx.re/join/${CODE}`,
      iconUrl: `https://frontend.cfx-services.net/api/servers/icon/${CODE}/${d.iconVersion}.png`,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, code: CODE, serverId: SERVER_ID }, { status: 500 });
  }
}
