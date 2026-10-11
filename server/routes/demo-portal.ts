// Hacky's demo user picker (served at /api/demo/portal, DEMO_MODE only).
// The homepage opens this picker; choosing a person signs them in and opens
// Hacky's onboarding for the selected event in a new tab.
// Open it from the web app's origin (locally http://127.0.0.1:5173/api/demo/portal)
// so the session cookie lands where the app runs.
//
// Self-contained apart from people's photos (photoUrl; initials when there's
// none or it fails to load). Names are inserted with textContent.
// The script below avoids backticks and ${} because this file is a template literal.

export const portalHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Hacky · Choose a demo user</title>
<style>
  :root {
    --bg: #0d0f14; --panel: #161a22; --panel-2: #1d222c; --line: #2a303c;
    --text: #eef1f6; --muted: #9aa3b2; --gold: #f2c14e; --gold-ink: #1a1405;
    --danger: #ff8a80; --ok: #8be3a6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; background: rgba(13,15,20,.92); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .02em; }
  .brand small { font-weight: 500; color: var(--muted); letter-spacing: 0; }
  .pill { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--gold);
    border: 1px solid rgba(242,193,78,.45); border-radius: 999px; padding: 2px 10px; }
  main { max-width: 960px; margin: 0 auto; padding: 28px 16px 96px; }
  h1 { font-size: clamp(24px, 5vw, 34px); line-height: 1.15; margin: 0 0 8px; }
  .lede { color: var(--muted); max-width: 60ch; margin: 0 0 28px; }
  section { margin: 0 0 32px; }
  h2 { display: flex; align-items: baseline; gap: 10px; font-size: 18px; margin: 0 0 12px; }
  h2 span { font-size: 13px; font-weight: 500; color: var(--muted); }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px; border-radius: 14px;
    background: var(--panel); border: 1px solid var(--line); }
  .avatar { position: relative; overflow: hidden; flex: none; width: 44px; height: 44px; border-radius: 50%;
    display: grid; place-items: center; font-weight: 700; font-size: 15px; color: #0d0f14; }
  .avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .who { min-width: 0; flex: 1; }
  .name { font-weight: 600; overflow-wrap: anywhere; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: var(--muted); font-size: 13px; }
  .role { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
    padding: 1px 7px; border-radius: 6px; background: var(--panel-2); color: var(--text); }
  .verified { color: var(--ok); font-size: 12px; }
  button { flex: 1 1 100%; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer;
    padding: 9px 12px; border-radius: 10px; border: 0; background: var(--gold); color: var(--gold-ink); }
  button:hover { filter: brightness(1.06); }
  button:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: progress; }
  .empty, .error { padding: 18px; border-radius: 14px; border: 1px dashed var(--line); color: var(--muted); }
  .error { color: var(--danger); border-color: rgba(255,138,128,.4); }
  #status { position: fixed; left: 16px; right: 16px; bottom: 16px; max-width: 560px; margin: 0 auto;
    padding: 12px 14px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--line);
    box-shadow: 0 10px 30px rgba(0,0,0,.4); }
  #status[hidden] { display: none; }
  #status.bad { color: var(--danger); }
  #status a { color: var(--gold); font-weight: 600; }
</style>
</head>
<body>
<header>
  <div class="brand">
    <img src="/assets/mascots/avatars/knit-original-none.webp" width="36" height="36" alt="">
    Hacky <small>Demo</small>
  </div>
  <span class="pill">Demo</span>
</header>
<main>
  <h1>Choose a demo user</h1>
  <p class="lede">Pick someone to explore Hacky as. You'll start with their welcome and onboarding in a new tab.
    To try two people at once, use separate browser profiles or devices.</p>
  <div id="events" aria-busy="true"><p class="empty">Loading people…</p></div>
</main>
<div id="status" role="status" aria-live="polite" hidden></div>
<script>
(function () {
  var root = document.getElementById("events");
  var statusBox = document.getElementById("status");
  var ROLE_ORDER = { hacker: 0, mentor: 1, sponsor: 2, organizer: 3 };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
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

  function hue(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }

  async function launch(person, membership, button) {
    var params = new URLSearchParams({ onboarding: "1" });
    if (membership) params.set("event", membership.slug);
    var destination = "/index.html?" + params.toString();
    // Open the tab inside the click so popup blockers allow it, then point it at the app.
    var tab = window.open("", "_blank");
    button.disabled = true;
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
    }
  }

  function card(person, membership) {
    var item = el("div", "card");
    var avatar = el("div", "avatar", initials(person.name));
    avatar.style.background = "hsl(" + hue(person.handle) + " 70% 72%)";
    avatar.setAttribute("aria-hidden", "true");
    if (person.photoUrl) {
      var photo = el("img");
      photo.alt = "";
      photo.addEventListener("error", function () { photo.remove(); });
      photo.src = person.photoUrl;
      avatar.appendChild(photo);
    }
    var who = el("div", "who");
    who.appendChild(el("div", "name", person.name));
    var meta = el("div", "meta");
    meta.appendChild(el("span", "", "@" + person.handle));
    if (membership) {
      meta.appendChild(el("span", "role", membership.role));
      if (membership.verified && membership.role === "mentor") meta.appendChild(el("span", "verified", "✓ verified"));
    }
    who.appendChild(meta);
    var button = el("button", "", "Continue as " + person.name.split(/\\s+/)[0]);
    button.type = "button";
    button.setAttribute("aria-label", "Continue as " + person.name);
    button.addEventListener("click", function () { launch(person, membership, button); });
    item.append(avatar, who, button);
    return item;
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
      root.appendChild(el("p", "empty", "No demo people yet. Run the seed, then reload."));
      return;
    }
    groups.forEach(function (group) {
      group.rows.sort(function (a, b) {
        return (ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role]) ||
          a.person.name.localeCompare(b.person.name);
      });
      var section = el("section");
      var heading = el("h2", "", group.name);
      heading.appendChild(el("span", "", group.rows.length + (group.rows.length === 1 ? " person" : " people")));
      var grid = el("div", "grid");
      group.rows.forEach(function (row) { grid.appendChild(card(row.person, row.membership)); });
      section.append(heading, grid);
      root.appendChild(section);
    });
    if (noEvent.length) {
      var section = el("section");
      section.appendChild(el("h2", "", "Not in an event"));
      var grid = el("div", "grid");
      noEvent.forEach(function (person) { grid.appendChild(card(person, null)); });
      section.appendChild(grid);
      root.appendChild(section);
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
      root.appendChild(el("p", "error", error.message));
    })
    .finally(function () { root.removeAttribute("aria-busy"); });
})();
</script>
</body>
</html>`;
