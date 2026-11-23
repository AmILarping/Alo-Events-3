// ALÓ Events – Party-Verwaltung (Admin-API)
// Routen: /api/admin/login · /logout · /session · /partys · /bild
// Benötigt die Umgebungsvariable ADMIN_PASSWORD (in Netlify, nie im Code).

import { getStore } from "@netlify/blobs";
import { purgeCache } from "@netlify/cache";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export const config = { path: "/api/admin/*" };

const COOKIE = "alo_admin";
const SESSION_STUNDEN = 12;
const MAX_BILD_BYTES = 5 * 1024 * 1024;
const REIHEN = ["ALÓ", "Pasaporte", "Sonstige"];
const BILD_KEY = /^[a-z0-9-]{6,60}\.(webp|jpg|png|avif)$/;

const partyStore = () => getStore({ name: "alo-partys", consistency: "strong" });
const bildStore = () => getStore({ name: "alo-partybilder", consistency: "strong" });

// ---------- Hilfen ----------
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

const fehler = (msg, status = 400) => json({ fehler: msg }, status);

function geheimnis() {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  return s ? "alo-partys|" + s : null;
}

function signiere(wert) {
  return createHmac("sha256", geheimnis()).update(String(wert)).digest("base64url");
}

function gleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieAus(req, name) {
  const roh = req.headers.get("cookie") || "";
  for (const teil of roh.split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function eingeloggt(req) {
  if (!geheimnis()) return false;
  const token = cookieAus(req, COOKIE);
  if (!token) return false;
  const [ablauf, sig] = token.split(".");
  if (!ablauf || !sig || Number(ablauf) < Date.now()) return false;
  return gleich(sig, signiere(ablauf));
}

function gleicherUrsprung(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // gleiche Seite ohne Origin-Header (z. B. alte Browser)
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

const sessionCookie = (wert, maxAge) =>
  `${COOKIE}=${wert}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function ladePartys() {
  return (await partyStore().get("partys", { type: "json" })) || [];
}

async function speicherePartys(liste) {
  await partyStore().setJSON("partys", liste);
  try {
    await purgeCache({ tags: ["alo-partys"] });
  } catch (e) {
    console.warn("Cache-Purge fehlgeschlagen (nicht kritisch):", e.message);
  }
}

async function bildLoeschenWennFrei(key, liste) {
  if (!key || liste.some((p) => p.bild === key)) return;
  try {
    await bildStore().delete(key);
  } catch (e) {
    console.warn("Bild konnte nicht gelöscht werden:", key, e.message);
  }
}

function text(v, max) {
  return typeof v === "string" ? v.replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, max) : "";
}

function bereinige(e) {
  const titel = text(e.titel, 120);
  if (!titel) throw new Error("Bitte einen Titel eintragen.");
  const datum = text(e.datum, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || isNaN(Date.parse(datum))) throw new Error("Bitte ein gültiges Datum wählen.");
  const zeit = text(e.zeit, 5);
  if (zeit && !/^\d{2}:\d{2}$/.test(zeit)) throw new Error("Uhrzeit bitte als HH:MM.");
  const stadt = text(e.stadt, 80);
  if (!stadt) throw new Error("Bitte eine Stadt eintragen.");
  const ticketUrl = text(e.ticketUrl, 500);
  if (ticketUrl && !/^https?:\/\/[^\s]+$/i.test(ticketUrl)) throw new Error("Der Ticket-Link muss mit https:// beginnen.");
  const bild = text(e.bild, 80);
  if (bild && !BILD_KEY.test(bild)) throw new Error("Ungültiges Bild.");
  return {
    titel,
    reihe: REIHEN.includes(e.reihe) ? e.reihe : "Sonstige",
    datum,
    zeit,
    stadt,
    location: text(e.location, 120),
    beschreibung: text(e.beschreibung, 1200),
    ticketUrl,
    bild,
    bildAlt: text(e.bildAlt, 160),
    sichtbar: e.sichtbar !== false,
    ausverkauft: e.ausverkauft === true,
  };
}

function bildTyp(bytes) {
  const b = new Uint8Array(bytes.slice(0, 16));
  const s = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && s(1, 3) === "PNG") return ["image/png", "png"];
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return ["image/webp", "webp"];
  if (s(4, 4) === "ftyp" && /avi[fs]/.test(s(8, 4))) return ["image/avif", "avif"];
  return null;
}

// ---------- Handler ----------
export default async (req) => {
  const route = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const m = req.method;

  if (!geheimnis()) return fehler("ADMIN_PASSWORD ist in Netlify nicht gesetzt.", 500);
  if (m !== "GET" && !gleicherUrsprung(req)) return fehler("Ungültiger Ursprung.", 403);

  // Login
  if (route === "login" && m === "POST") {
    let pw = "";
    try {
      pw = (await req.json()).passwort || "";
    } catch {}
    if (!gleich(pw, process.env.ADMIN_PASSWORD || "\u0000")) {
      await new Promise((r) => setTimeout(r, 700)); // bremst Rateversuche
      return fehler("Passwort falsch.", 401);
    }
    const ablauf = Date.now() + SESSION_STUNDEN * 3600 * 1000;
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(`${ablauf}.${signiere(ablauf)}`, SESSION_STUNDEN * 3600) });
  }

  if (route === "logout" && m === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (!eingeloggt(req)) return fehler("Bitte neu anmelden.", 401);

  if (route === "session") return json({ ok: true });

  // Partys
  if (route === "partys") {
    if (m === "GET") return json({ partys: await ladePartys() });

    if (m === "POST") {
      let eingabe;
      try {
        eingabe = await req.json();
      } catch {
        return fehler("Ungültige Anfrage.");
      }
      let sauber;
      try {
        sauber = bereinige(eingabe);
      } catch (e) {
        return fehler(e.message);
      }
      const liste = await ladePartys();
      const jetzt = new Date().toISOString();
      const idx = eingabe.id ? liste.findIndex((p) => p.id === eingabe.id) : -1;
      let party, altesBild = null;
      if (idx >= 0) {
        altesBild = liste[idx].bild !== sauber.bild ? liste[idx].bild : null;
        party = { ...liste[idx], ...sauber, geaendert: jetzt };
        liste[idx] = party;
      } else {
        party = { id: randomUUID(), ...sauber, erstellt: jetzt, geaendert: jetzt };
        liste.push(party);
      }
      await speicherePartys(liste);
      await bildLoeschenWennFrei(altesBild, liste);
      return json({ party });
    }

    if (m === "DELETE") {
      const id = new URL(req.url).searchParams.get("id");
      const liste = await ladePartys();
      const party = liste.find((p) => p.id === id);
      if (!party) return fehler("Party nicht gefunden.", 404);
      const rest = liste.filter((p) => p.id !== id);
      await speicherePartys(rest);
      await bildLoeschenWennFrei(party.bild, rest);
      return json({ ok: true });
    }
  }

  // Bild-Upload (Rohdaten im Body)
  if (route === "bild" && m === "POST") {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength) return fehler("Kein Bild empfangen.");
    if (bytes.byteLength > MAX_BILD_BYTES) return fehler("Bild ist zu groß (max. 5 MB).", 413);
    const typ = bildTyp(bytes);
    if (!typ) return fehler("Bitte ein JPG, PNG, WebP oder AVIF hochladen.", 415);
    const key = `party-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${typ[1]}`;
    await bildStore().set(key, bytes, { metadata: { typ: typ[0] } });
    return json({ bild: key, url: `/api/bild/${key}` });
  }

  return fehler("Nicht gefunden.", 404);
};
