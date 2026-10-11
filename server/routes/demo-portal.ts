// Hacky's demo user picker (served at /api/demo/portal, DEMO_MODE only).
// The homepage opens this picker; choosing a person signs them in and opens
// Hacky's onboarding for the selected event in a new tab.
// Open it from the web app's origin (locally http://127.0.0.1:5173/api/demo/portal)
// so the session cookie lands where the app runs.
//
// Self-contained: inline CSS and JS, with images and fonts from the web app's /assets.
// It looks like the app's opening card: the theme tokens and dark theme are copied from
// react/public/app/hacky-primitives.css, and avatars follow PersonAvatar in react/src/ui.jsx
// (photo, else knit Hacky from hackyStyle, else initials). Names are inserted with textContent.
// The only ${} in this template is darkTokens below; the script avoids backticks and ${}.

// The app's dark theme, applied by prefers-color-scheme or the app's saved theme ("hacky-theme").
const darkTokens = `color-scheme:dark; --ink:#edf1f7; --blue:#80b5ff; --muted:#adb7c5; --paper:#181c24; --white:#242a35;
    --line:#404b5c; --wash:#2d3542; --stage:#252f3e; --hover:#303d50; --focus:#80b5ff;
    --hacker-ink:#bad8ff; --hacker-bg:#283e5b; --mentor-ink:#c5dbcc; --mentor-bg:#30463d; --sponsor-ink:#efd097; --sponsor-bg:#493e29;
    --danger:#ffb4ab; --danger-bg:#4a2523;`;

export const portalHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f6f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#181c24" media="(prefers-color-scheme: dark)">
<title>Hacky · Choose a demo user</title>
<script>
  // Follow the theme chosen in the app, if any; otherwise the system setting (CSS below).
  try { var savedTheme = localStorage.getItem("hacky-theme");
    if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme; } catch (e) {}
</script>
<style>
  @font-face { font-family: Lato; src: url("/assets/fonts/lato-regular.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
  @font-face { font-family: Lato; src: url("/assets/fonts/lato-bold.woff2") format("woff2"); font-weight: 700; font-style: normal; font-display: swap; }
  :root {
    color-scheme: light; --ink:#243247; --blue:#0866d9; --muted:#606975; --paper:#f5f6f8; --white:#fff;
    --line:#d8dde5; --wash:#e9edf3; --stage:#edf2f8; --hover:#eaf1fb; --focus:#0866d9;
    --hacker-ink:#24558c; --hacker-bg:#e6effa; --mentor-ink:#39604f; --mentor-bg:#e8f0eb; --sponsor-ink:#805915; --sponsor-bg:#f6e9c9;
    --danger:#b3261e; --danger-bg:#fdecea;
    --ease: cubic-bezier(.16,1,.3,1);
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { ${darkTokens} } }
  :root[data-theme=dark] { ${darkTokens} }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; min-height: 100dvh; background: var(--paper); color: var(--ink);
    font: 15px/1.5 Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  ::selection { background: var(--hover); color: var(--ink); }
  svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

  .page { max-width: 1000px; margin: 0 auto; padding: env(safe-area-inset-top) 16px 128px; }

  /* The app's header: the name, with the context under it. */
  .title { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 18px 0 4px; }
  .title-name { font-size: 20px; font-weight: 700; line-height: 1.2; letter-spacing: -.03em; }
  .title-note { font-size: 12px; line-height: 1.5; color: var(--muted); }

  /* The opening card: Hacky on the dragon, then one question. */
  .hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 4px 0 40px; }
  .stage { position: relative; isolation: isolate; width: 260px; aspect-ratio: 720 / 576; margin-bottom: 8px; }
  .stage::before { content: ""; position: absolute; inset: 24% 9% 3%; z-index: -1; border-radius: 50%; background: var(--stage); }
  .stage img { display: block; width: 100%; height: 100%; object-fit: contain;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  h1 { margin: 0; max-width: 22ch; font-size: 30px; line-height: 1.2; font-weight: 700; letter-spacing: -.025em; text-wrap: balance; }
  .lede { margin: 12px 0 0; max-width: 42ch; color: var(--muted); text-wrap: balance; }
  .aside { margin: 6px 0 0; max-width: 58ch; font-size: 13px; color: var(--muted); text-wrap: balance; }

  /* People, grouped by event. */
  .event { margin: 0 0 40px; }
  .event-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 0 2px 14px; }
  h2 { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 700; letter-spacing: -.02em; }
  .count { font-size: 13px; color: var(--muted); }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); }

  /* One person: the app's match card. The whole card signs in. */
  .person { width: 100%; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 12px 14px 12px 12px;
    border: 1px solid var(--line); border-radius: 14px; background: var(--white); color: inherit; font: inherit; text-align: left;
    cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background 160ms, border-color 160ms, transform 160ms var(--ease); }
  @media (hover: hover) {
    .person:hover:not(:disabled) { border-color: var(--focus); background: var(--hover); }
    .person:hover:not(:disabled) .go { color: var(--blue); }
  }
  .person:active:not(:disabled) { transform: scale(.98); background: var(--wash); }
  .person:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  .person:focus-visible .go { color: var(--blue); }
  .person:disabled { cursor: progress; }

  .avatar { position: relative; flex: none; width: 48px; height: 48px; border-radius: 50%; overflow: hidden; background: var(--wash); }
  .avatar img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
  .avatar .initials { position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 17px; font-weight: 700; line-height: 1; letter-spacing: -.01em; color: var(--ink); }

  .info { flex: 1; min-width: 0; display: block; }
  .name { display: block; font-size: 16px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 4px;
    font-size: 13px; line-height: 20px; color: var(--muted); }
  .handle { min-width: 0; overflow-wrap: anywhere; }
  .kind { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 5px; font-size: 12px; line-height: 18px;
    font-weight: 700; letter-spacing: .01em; color: var(--blue); background: var(--wash); }
  .kind[data-kind=hacker] { color: var(--hacker-ink); background: var(--hacker-bg); }
  .kind[data-kind=mentor] { color: var(--mentor-ink); background: var(--mentor-bg); }
  .kind[data-kind=sponsor] { color: var(--sponsor-ink); background: var(--sponsor-bg); }
  .verified { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 700; color: var(--mentor-ink); }
  .verified svg { width: 14px; height: 14px; stroke-width: 2.2; }

  .go { flex: none; width: 24px; height: 24px; display: grid; place-items: center; color: var(--muted); transition: color 160ms; }
  .go .dots { display: none; }
  .person[aria-busy=true] .go svg { display: none; }
  .person[aria-busy=true] .go .dots { display: inline-flex; }

  /* The app's thinking dots, for loading and signing in. */
  .dots { display: inline-flex; gap: 4px; align-items: center; height: 20px; color: var(--blue); }
  .dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: thinking 900ms ease-in-out infinite; }
  .dots i:nth-child(2) { animation-delay: 120ms; }
  .dots i:nth-child(3) { animation-delay: 240ms; }
  @keyframes thinking { 50% { opacity: .35; transform: translateY(-2px); } }

  .notice { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 20px;
    border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); font-size: 14px; text-align: center; }
  .notice.error { border-style: solid; border-color: currentColor; color: var(--danger); background: var(--danger-bg); }

  /* The app's toast, kept on screen because it can hold the "Open Hacky" link. */
  #status { position: fixed; z-index: 5; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%);
    width: max-content; max-width: calc(100vw - 32px); padding: 12px 18px; border-radius: 12px;
    background: var(--ink); color: var(--paper); font-size: 14px; line-height: 1.45; text-align: center;
    box-shadow: 0 4px 16px rgb(0 0 0 / .12); overflow-wrap: anywhere; }
  #status[hidden] { display: none; }
  #status.bad { border: 1px solid currentColor; background: var(--danger-bg); color: var(--danger); }
  #status a { color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; border-radius: 4px; }
  #status a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

  @media (max-width: 560px) {
    .stage { width: 216px; }
    h1 { font-size: 26px; }
    .hero { padding-bottom: 32px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dots i { animation: none; }
    .person, .go { transition: none; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="title">
    <span class="title-name">Hacky</span>
    <span class="title-note">Demo sign-in</span>
  </header>
  <main>
    <section class="hero" aria-labelledby="picker-title">
      <div class="stage">
        <picture>
          <source srcset="/assets/mascots/video/hacky-chat.png" media="(prefers-reduced-motion: reduce)">
          <img id="mascot" src="/assets/mascots/video/hacky-chat.webp" width="720" height="576" decoding="async" draggable="false"
            alt="Hacky rides a little green dragon and points the way">
        </picture>
      </div>
      <h1 id="picker-title">Who do you want to be?</h1>
      <p class="lede">Pick a demo person to sign in as. Hacky opens their welcome and onboarding in a new tab.</p>
      <p class="aside">To try two people at once, use separate browser profiles or devices.</p>
    </section>
    <div id="events" aria-busy="true"><p class="notice"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Loading people…</p></div>
  </main>
</div>
<div id="status" role="status" aria-live="polite" hidden></div>
<script>
(function () {
  var root = document.getElementById("events");
  var statusBox = document.getElementById("status");
  var ROLE_ORDER = { hacker: 0, mentor: 1, sponsor: 2, organizer: 3 };
  var ROLE_LABEL = { hacker: "Hacker", mentor: "Mentor", sponsor: "Sponsor", organizer: "Organizer" };
  // Knit avatar art for each flair (react/public/assets/mascots/avatars), in the original color.
  var KNIT_FLAIRS = ["none", "stars", "hearts"];
  // Same swatches and recolor as react/src/mascot-data.js: each pixel becomes the swatch times its
  // luminance relative to the cream body (0.87), so the whole Hacky turns that color. Original stays as drawn.
  var RECOLORS = { berry: "#b35cd0", mint: "#58bc94", sunset: "#ec886a", rose: "#e77bb6", ice: "#85cfe4" };
  var SVG = "http://www.w3.org/2000/svg";

  function recolorMatrix(hex) {
    var values = [];
    [1, 3, 5].forEach(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255 / 0.87;
      values.push(0.299 * v, 0.587 * v, 0.114 * v, 0, 0);
    });
    return values.concat([0, 0, 0, 1, 0]).map(function (n) { return +n.toFixed(4); }).join(" ");
  }
  var filters = document.createElementNS(SVG, "svg");
  filters.setAttribute("aria-hidden", "true");
  filters.style.cssText = "position:absolute;width:0;height:0";
  var defs = document.createElementNS(SVG, "defs");
  Object.keys(RECOLORS).forEach(function (id) {
    var filter = document.createElementNS(SVG, "filter");
    filter.setAttribute("id", "hacky-color-" + id);
    filter.setAttribute("color-interpolation-filters", "sRGB");
    var matrix = document.createElementNS(SVG, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    matrix.setAttribute("values", recolorMatrix(RECOLORS[id]));
    filter.appendChild(matrix);
    defs.appendChild(filter);
  });
  filters.appendChild(defs);
  document.body.appendChild(filters);

  // If the dragon clip can't load, show the still knit Hacky instead.
  var mascot = document.getElementById("mascot");
  function stillMascot() {
    mascot.parentNode.querySelectorAll("source").forEach(function (source) { source.remove(); });
    mascot.alt = "Hacky";
    mascot.src = "/assets/mascots/webp/hacky-knit.webp";
  }
  if (mascot.complete && !mascot.naturalWidth) stillMascot();
  else mascot.addEventListener("error", stillMascot, { once: true });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(d) {
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function dots() {
    var node = el("span", "dots");
    node.setAttribute("aria-hidden", "true");
    node.append(el("i"), el("i"), el("i"));
    return node;
  }

  function setStatus(text, bad, link) {
    statusBox.textContent = text;
    statusBox.className = bad ? "bad" : "";
    if (link) {
      statusBox.appendChild(document.createTextNode(" "));
      var a = el("a", "", "Open Hacky");
      a.href = link; a.target = "_blank"; a.rel = "noopener";
      statusBox.appendChild(a);
    }
    statusBox.hidden = false;
  }

  function initials(name) {
    var parts = String(name).trim().split(/\\s+/).filter(Boolean);
    var first = parts[0] ? parts[0][0] : "?";
    var last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  // Same mapping as knitAvatarUrl in react/src/ui.jsx.
  function knitAvatarUrl(style) {
    var flair = style && style.flair === "sparks" ? "stars" : style && style.flair; // 'sparks' is the old name for stars
    return "/assets/mascots/avatars/knit-original-" + (KNIT_FLAIRS.indexOf(flair) >= 0 ? flair : "none") + ".webp";
  }

  // The person's photo, else their knit Hacky (also when they chose Hacky over their photo),
  // else initials. Each image that fails to load falls through to the next.
  function avatar(person) {
    var box = el("span", "avatar");
    box.setAttribute("aria-hidden", "true");
    var style = person.hackyStyle && typeof person.hackyStyle === "object" ? person.hackyStyle : null;
    var sources = [];
    if (typeof person.photoUrl === "string" && person.photoUrl && !(style && style.avatar === "hacky")) {
      sources.push({ kind: "photo", src: person.photoUrl });
    }
    var color = style && RECOLORS[style.color] ? style.color : null;
    sources.push({ kind: "knit", src: knitAvatarUrl(style), filter: color ? "url(#hacky-color-" + color + ")" : "" });
    var img = el("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    var next = 0;
    function show() {
      var source = sources[next++];
      if (!source) {
        img.remove();
        box.dataset.avatar = "initials";
        box.appendChild(el("span", "initials", initials(person.name)));
        return;
      }
      box.dataset.avatar = source.kind;
      img.style.filter = source.filter || "";
      img.src = source.src;
    }
    img.addEventListener("error", show);
    box.appendChild(img);
    show();
    return box;
  }

  async function launch(person, membership, button) {
    var params = new URLSearchParams({ onboarding: "1" });
    if (membership) params.set("event", membership.slug);
    var destination = "/index.html?" + params.toString();
    // Open the tab inside the click so popup blockers allow it, then point it at the app.
    var tab = window.open("", "_blank");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    setStatus("Signing in as " + person.name + "…");
    try {
      var res = await fetch("/api/demo/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: person.userId })
      });
      if (!res.ok) {
        var body = await res.json().catch(function () { return null; });
        throw new Error((body && body.error && body.error.message) || "Sign-in failed (" + res.status + ").");
      }
      if (tab) {
        tab.opener = null;
        tab.location.replace(destination);
        setStatus("Signed in as " + person.name + ". Hacky opened in a new tab.");
      } else {
        setStatus("Signed in as " + person.name + ".", false, destination);
      }
    } catch (error) {
      if (tab) tab.close();
      setStatus(error.message || "Sign-in failed.", true);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function card(person, membership) {
    var button = el("button", "person");
    button.type = "button";
    // Spoken as one phrase; the same person can appear under two events.
    var label = "Continue as " + person.name;
    if (membership) {
      label += ", " + (ROLE_LABEL[membership.role] || membership.role).toLowerCase();
      if (membership.verified && membership.role === "mentor") label += ", verified";
      label += ", at " + membership.name;
    }
    button.setAttribute("aria-label", label);
    var info = el("span", "info");
    var name = el("span", "name", person.name);
    var meta = el("span", "meta");
    meta.appendChild(el("span", "handle", "@" + person.handle));
    if (membership) {
      var kind = el("span", "kind", ROLE_LABEL[membership.role] || membership.role);
      kind.dataset.kind = membership.role;
      meta.appendChild(kind);
      if (membership.verified && membership.role === "mentor") {
        var verified = el("span", "verified");
        verified.append(icon("m5 12 4 4L19 6"), document.createTextNode("Verified"));
        meta.appendChild(verified);
      }
    }
    info.append(name, meta);
    var go = el("span", "go");
    go.setAttribute("aria-hidden", "true");
    go.append(icon("m9 6 6 6-6 6"), dots());
    button.append(avatar(person), info, go);
    button.addEventListener("click", function () { launch(person, membership, button); });
    return button;
  }

  function group(title, count, rows) {
    var section = el("section", "event");
    var head = el("div", "event-head");
    var heading = el("h2", "", title);
    head.appendChild(heading);
    if (count != null) head.appendChild(el("span", "count", count + (count === 1 ? " person" : " people")));
    var grid = el("div", "grid");
    rows.forEach(function (node) { grid.appendChild(node); });
    section.append(head, grid);
    return section;
  }

  function render(people) {
    root.textContent = "";
    var groups = new Map();
    var noEvent = [];
    people.forEach(function (person) {
      if (!person.events.length) noEvent.push(person);
      person.events.forEach(function (membership) {
        if (!groups.has(membership.slug)) groups.set(membership.slug, { name: membership.name, rows: [] });
        groups.get(membership.slug).rows.push({ person: person, membership: membership });
      });
    });
    if (!groups.size && !noEvent.length) {
      root.appendChild(el("p", "notice", "No demo people yet. Run the seed, then reload."));
      return;
    }
    groups.forEach(function (entry) {
      entry.rows.sort(function (a, b) {
        return (ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role]) ||
          a.person.name.localeCompare(b.person.name);
      });
      root.appendChild(group(entry.name, entry.rows.length,
        entry.rows.map(function (row) { return card(row.person, row.membership); })));
    });
    if (noEvent.length) {
      root.appendChild(group("Not in an event", null,
        noEvent.map(function (person) { return card(person, null); })));
    }
  }

  fetch("/api/demo/people", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Couldn't load people (" + res.status + ").");
      return res.json();
    })
    .then(function (data) { render(data.people); })
    .catch(function (error) {
      root.textContent = "";
      root.appendChild(el("p", "notice error", error.message));
    })
    .finally(function () { root.removeAttribute("aria-busy"); });
})();
</script>
</body>
</html>`;
