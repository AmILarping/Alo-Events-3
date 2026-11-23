/*! ALÓ Events – Partys auf der Website ausgeben
 *  Einbau:
 *    <div data-alo-partys></div>
 *    <script src="/partys.js" defer></script>
 *  Optionen (Attribute am div):
 *    data-reihe="Pasaporte"        nur eine Partyreihe (ALÓ | Pasaporte | Sonstige)
 *    data-ansicht="vergangen"      vergangene statt kommende Partys
 *    data-limit="6"                maximal so viele Partys
 *    data-leer="Text"              Text, wenn keine Party ansteht
 *    data-schema="aus"             keine Google-Event-Daten (JSON-LD) erzeugen
 */
(() => {
  "use strict";
  const skript = document.currentScript;
  const basis = skript && skript.src ? new URL(skript.src, location.href).origin : location.origin;
  const istDatei = location.protocol === "file:";
  const TICKETS = "https://www.tickettailor.com/all-tickets/aloevents/";

  const css = `
.alo-pt{--pt-lime:var(--lime,#E0FF22);--pt-red:var(--red,#FF2E4D);--pt-cyan:var(--cyan,#1EF2FF);
  --pt-d:var(--display,"Anton",Impact,sans-serif);--pt-t:var(--text,"Sora",system-ui,sans-serif);
  display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:clamp(14px,2vw,22px);font-family:var(--pt-t);color:#fff}
.alo-pt-card{--c:var(--pt-cyan);position:relative;display:flex;flex-direction:column;background:#0f0f12;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,box-shadow .25s}
.alo-pt-card[data-r="ALÓ"]{--c:var(--pt-lime)}.alo-pt-card[data-r="Pasaporte"]{--c:var(--pt-red)}
@media (hover:hover){.alo-pt-card:hover{transform:translateY(-4px);border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 18px 40px -18px var(--c)}}
.alo-pt-img{position:relative;aspect-ratio:4/5;background:#18181d;overflow:hidden}
.alo-pt-img img{width:100%;height:100%;object-fit:cover;display:block}
.alo-pt-img .alo-pt-ph{position:absolute;inset:0;display:grid;place-items:center;font:400 clamp(34px,5vw,52px)/1 var(--pt-d);color:var(--c);text-shadow:0 0 18px var(--c);letter-spacing:.03em}
.alo-pt-date{position:absolute;left:12px;top:12px;background:rgba(0,0,0,.78);border:1px solid var(--c);border-radius:12px;padding:7px 11px 6px;text-align:center;line-height:1;backdrop-filter:blur(6px)}
.alo-pt-date b{display:block;font:400 30px/1 var(--pt-d);color:var(--c)}
.alo-pt-date span{display:block;margin-top:3px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.alo-pt-sold{position:absolute;right:12px;top:12px;background:var(--pt-red);color:#fff;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;border-radius:999px}
.alo-pt-body{display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px;flex:1}
.alo-pt-reihe{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--c)}
.alo-pt-body h3{margin:0;font:400 clamp(24px,2.6vw,30px)/1.05 var(--pt-d);text-transform:uppercase;letter-spacing:.01em}
.alo-pt-meta{font-size:14px;color:rgba(255,255,255,.72)}
.alo-pt-text{font-size:14px;line-height:1.5;color:rgba(255,255,255,.82);margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.alo-pt-cta{margin-top:auto;padding-top:12px}
.alo-pt-cta a{display:inline-flex;align-items:center;gap:8px;background:var(--c);color:#111;font-weight:700;font-size:14px;text-decoration:none;padding:11px 18px;border-radius:999px;transition:transform .15s}
.alo-pt-cta a:active{transform:scale(.97)}
.alo-pt.is-past .alo-pt-img img{filter:grayscale(.35) brightness(.85)}
.alo-pt-leer{grid-column:1/-1;border:1px dashed rgba(255,255,255,.2);border-radius:16px;padding:36px 20px;text-align:center;color:rgba(255,255,255,.75)}
.alo-pt-leer b{display:block;font:400 28px/1.1 var(--pt-d);text-transform:uppercase;color:#fff;margin-bottom:6px}
.alo-pt-hinweis{grid-column:1/-1;font-size:12px;color:rgba(255,255,255,.5)}
@media (prefers-reduced-motion:reduce){.alo-pt-card{transition:none}}`;

  function stil() {
    if (document.getElementById("alo-pt-css")) return;
    const s = document.createElement("style"); s.id = "alo-pt-css"; s.textContent = css; document.head.appendChild(s);
  }

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sicherUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");
  const abs = u => (u && u.startsWith("/") ? basis + u : u);
  const dt = iso => new Date(iso + "T12:00:00");

  function karte(p, vergangen) {
    const d = dt(p.datum);
    const tag = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "");
    const wtag = d.toLocaleDateString("de-DE", { weekday: "long" });
    const ort = [p.location, p.stadt].filter(Boolean).map(esc).join(" · ");
    const ticket = sicherUrl(p.ticketUrl);
    const cta = vergangen || p.ausverkauft || !ticket ? "" :
      `<div class="alo-pt-cta"><a href="${esc(ticket)}" target="_blank" rel="noopener">Tickets sichern <span aria-hidden="true">→</span></a></div>`;
    const bild = p.bild
      ? `<img src="${esc(abs(p.bild))}" alt="${esc(p.bildAlt || p.titel)}" loading="lazy" decoding="async">`
      : `<span class="alo-pt-ph" aria-hidden="true">${esc(p.reihe === "Pasaporte" ? "PASAPORTE" : "ALÓ")}</span>`;
    return `<article class="alo-pt-card" data-r="${esc(p.reihe)}">
  <div class="alo-pt-img">${bild}<div class="alo-pt-date"><b>${tag}</b><span>${esc(mon)}</span></div>${p.ausverkauft && !vergangen ? `<span class="alo-pt-sold">Ausverkauft</span>` : ""}</div>
  <div class="alo-pt-body">
    <span class="alo-pt-reihe">${esc(p.reihe)}</span>
    <h3>${esc(p.titel)}</h3>
    <div class="alo-pt-meta"><time datetime="${esc(p.datum)}${p.zeit ? "T" + esc(p.zeit) : ""}">${esc(wtag)}, ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}${p.zeit ? ` · ${esc(p.zeit)} Uhr` : ""}</time></div>
    ${ort ? `<div class="alo-pt-meta">${ort}</div>` : ""}
    ${p.beschreibung ? `<p class="alo-pt-text">${esc(p.beschreibung)}</p>` : ""}
    ${cta}
  </div>
</article>`;
  }

  function schema(liste) {
    if (!liste.length || document.getElementById("alo-pt-schema")) return;
    const daten = {
      "@context": "https://schema.org",
      "@graph": liste.map(p => ({
        "@type": "Event",
        name: p.titel,
        startDate: p.datum + (p.zeit ? "T" + p.zeit : ""),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        ...(p.beschreibung ? { description: p.beschreibung } : {}),
        ...(p.bild ? { image: [abs(p.bild)] } : {}),
        location: {
          "@type": "Place",
          name: p.location || p.stadt,
          address: { "@type": "PostalAddress", addressLocality: p.stadt, addressCountry: "DE" },
        },
        organizer: { "@type": "Organization", name: "ALÓ Events", url: "https://www.alo-events.com/" },
        ...(sicherUrl(p.ticketUrl) ? { offers: { "@type": "Offer", url: p.ticketUrl, availability: p.ausverkauft ? "https://schema.org/SoldOut" : "https://schema.org/InStock" } } : {}),
      })),
    };
    const s = document.createElement("script");
    s.type = "application/ld+json"; s.id = "alo-pt-schema"; s.textContent = JSON.stringify(daten);
    document.head.appendChild(s);
  }

  // Beispieldaten nur für die lokale Vorschau (Datei direkt im Browser geöffnet)
  function beispiel() {
    const in_ = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    return {
      kommend: [
        { titel: "Pasaporte Noche de Salsa", reihe: "Pasaporte", datum: in_(12), zeit: "22:00", stadt: "Hamburg", location: "Beispiel-Location", beschreibung: "Salsa, Bachata und Reggaetón auf zwei Floors. Mit Live-Percussion.", ticketUrl: TICKETS },
        { titel: "ALÓ Afro & House", reihe: "ALÓ", datum: in_(26), zeit: "23:00", stadt: "Frankfurt am Main", location: "Beispiel-Club", beschreibung: "Afro House, Amapiano und Latin House bis in den Morgen.", ticketUrl: TICKETS, ausverkauft: true },
        { titel: "ALÓ Summer Opening", reihe: "ALÓ", datum: in_(48), stadt: "Köln", ticketUrl: TICKETS },
      ],
      vergangen: [{ titel: "Pasaporte XXL Halloween", reihe: "Pasaporte", datum: in_(-16), stadt: "Düsseldorf" }],
    };
  }

  let cache;
  async function daten() {
    if (!cache) cache = fetch(basis + "/api/partys", { headers: { Accept: "application/json" } })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(e => { if (istDatei) return { ...beispiel(), demo: true }; throw e; });
    return cache;
  }

  async function fuelle(el) {
    const vergangen = el.dataset.ansicht === "vergangen";
    const reihe = el.dataset.reihe || "";
    const limit = parseInt(el.dataset.limit || "0", 10);
    el.classList.add("alo-pt"); el.classList.toggle("is-past", vergangen);
    el.setAttribute("aria-busy", "true");
    try {
      const d = await daten();
      let liste = (vergangen ? d.vergangen : d.kommend) || [];
      if (reihe) liste = liste.filter(p => p.reihe === reihe);
      if (limit > 0) liste = liste.slice(0, limit);
      if (!liste.length) {
        const leer = el.dataset.leer || (vergangen ? "Noch keine vergangenen Partys." : "Neue Termine folgen bald.");
        el.innerHTML = `<div class="alo-pt-leer"><b>Stay tuned</b>${esc(leer)}</div>`;
      } else {
        el.innerHTML = liste.map(p => karte(p, vergangen)).join("") +
          (d.demo ? `<p class="alo-pt-hinweis">Lokale Vorschau mit Beispieldaten. Online kommen die Partys aus dem Admin-Bereich.</p>` : "");
        if (!vergangen && el.dataset.schema !== "aus" && !d.demo) schema(liste);
      }
    } catch {
      el.innerHTML = `<div class="alo-pt-leer"><b>Partys</b>Die Termine konnten gerade nicht geladen werden. Alle Tickets gibt es bei <a href="${TICKETS}" style="color:inherit">Tickettailor</a>.</div>`;
    } finally {
      el.removeAttribute("aria-busy");
    }
  }

  function start() {
    const els = document.querySelectorAll("[data-alo-partys]");
    if (!els.length) return;
    stil();
    els.forEach(fuelle);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
