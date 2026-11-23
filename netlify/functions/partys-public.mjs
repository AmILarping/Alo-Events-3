// ALÓ Events – öffentliche Party-Daten für die Website
// GET /api/partys        → { kommend: [...], vergangen: [...] } (nur sichtbare Partys)
// GET /api/bild/<key>    → das hochgeladene Bild

import { getStore } from "@netlify/blobs";

export const config = { path: ["/api/partys", "/api/bild/*"] };

const BILD_KEY = /^[a-z0-9-]{6,60}\.(webp|jpg|png|avif)$/;

const heuteBerlin = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const oeffentlich = (p) => ({
  id: p.id,
  titel: p.titel,
  reihe: p.reihe,
  datum: p.datum,
  zeit: p.zeit || "",
  stadt: p.stadt,
  location: p.location || "",
  beschreibung: p.beschreibung || "",
  ticketUrl: p.ticketUrl || "",
  ausverkauft: !!p.ausverkauft,
  bild: p.bild ? `/api/bild/${p.bild}` : "",
  bildAlt: p.bildAlt || "",
});

export default async (req) => {
  const pfad = new URL(req.url).pathname;

  if (pfad.startsWith("/api/bild/")) {
    const key = decodeURIComponent(pfad.slice("/api/bild/".length));
    if (!BILD_KEY.test(key)) return new Response("Nicht gefunden", { status: 404 });
    const treffer = await getStore("alo-partybilder").getWithMetadata(key, { type: "arrayBuffer" });
    if (!treffer) return new Response("Nicht gefunden", { status: 404 });
    return new Response(treffer.data, {
      headers: {
        "Content-Type": treffer.metadata?.typ || "image/webp",
        // Jeder Upload bekommt einen neuen Namen, daher darf das Bild dauerhaft gecacht werden.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Netlify-CDN-Cache-Control": "public, durable, max-age=31536000, immutable",
      },
    });
  }

  const alle = (await getStore("alo-partys").get("partys", { type: "json" })) || [];
  const heute = heuteBerlin();
  const sichtbar = alle.filter((p) => p.sichtbar !== false);
  const sortAuf = (a, b) => (a.datum + (a.zeit || "")).localeCompare(b.datum + (b.zeit || ""));

  const kommend = sichtbar.filter((p) => p.datum >= heute).sort(sortAuf).map(oeffentlich);
  const vergangen = sichtbar.filter((p) => p.datum < heute).sort((a, b) => sortAuf(b, a)).map(oeffentlich);

  return new Response(JSON.stringify({ kommend, vergangen, stand: heute }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=0, must-revalidate",
      // CDN hält die Liste 5 Min.; nach jeder Änderung im Admin wird sie sofort geleert (Tag alo-partys).
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=600",
      "Netlify-Cache-Tag": "alo-partys",
    },
  });
};
