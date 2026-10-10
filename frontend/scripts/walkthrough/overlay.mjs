/**
 * In-page presentation layer injected by record.mjs.
 *
 * Runs inside the browser (as an init script) and exposes `window.__wt` with
 * a callout panel, full-screen cards, a visible cursor and a click pulse. All
 * elements are appended to <body> outside the React root and ignore pointer
 * events, so they never interfere with the recorded interactions.
 */
export function installOverlay() {
  const CSS = `
    #wt-root, #wt-root * { box-sizing: border-box; font-family: Inter, "Segoe UI", system-ui, sans-serif; }
    #wt-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
    #wt-callout {
      position: absolute; right: 28px; bottom: 28px; width: 560px; max-width: calc(100vw - 56px);
      padding: 18px 22px 18px 22px; border-radius: 16px;
      background: rgba(10, 14, 24, 0.86); color: #f3f6fb;
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
      backdrop-filter: blur(14px);
      opacity: 0; transform: translateY(14px);
      transition: opacity 320ms ease, transform 320ms ease;
    }
    #wt-callout.show { opacity: 1; transform: translateY(0); }
    #wt-callout.top { bottom: auto; top: 96px; }
    #wt-callout .chip {
      display: inline-block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
      color: #7cc4ff; background: rgba(124,196,255,0.12); border: 1px solid rgba(124,196,255,0.35);
      padding: 3px 9px; border-radius: 999px; margin-bottom: 10px;
    }
    #wt-callout h3 { margin: 0 0 6px; font-size: 19px; font-weight: 650; line-height: 1.25; }
    #wt-callout p { margin: 0; font-size: 14.5px; line-height: 1.5; color: #d6dde8; }
    #wt-callout .bar { position:absolute; left: 0; right: 0; bottom: 0; height: 3px; border-radius: 0 0 16px 16px; overflow: hidden; }
    #wt-callout .bar i { display:block; height: 100%; width: 0; background: linear-gradient(90deg,#7cc4ff,#a78bfa); }

    #wt-card {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: radial-gradient(1200px 700px at 30% 20%, rgba(56,89,180,0.45), transparent 60%),
                  radial-gradient(900px 600px at 80% 80%, rgba(167,139,250,0.35), transparent 60%),
                  #070a12;
      color: #f3f6fb; opacity: 0; transition: opacity 380ms ease;
    }
    #wt-card.show { opacity: 1; }
    #wt-card .inner { width: min(960px, 86vw); padding: 24px; }
    #wt-card .kicker { font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: #7cc4ff; margin-bottom: 14px; }
    #wt-card h1 { margin: 0 0 18px; font-size: 44px; line-height: 1.1; font-weight: 700; letter-spacing: -0.01em; }
    #wt-card p.lead { margin: 0 0 18px; font-size: 20px; line-height: 1.5; color: #d6dde8; }
    #wt-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
    #wt-card li { font-size: 18px; line-height: 1.45; color: #e7ecf5; padding-left: 36px; position: relative; }
    #wt-card li::before { content: attr(data-n); position: absolute; left: 0; top: 1px; width: 26px; height: 26px; border-radius: 8px;
      background: rgba(124,196,255,0.16); border: 1px solid rgba(124,196,255,0.4); color: #7cc4ff; font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; }
    #wt-card .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    #wt-card .col { padding: 20px 22px; border-radius: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
    #wt-card .col h2 { margin: 0 0 10px; font-size: 20px; }
    #wt-card .col p { margin: 0; font-size: 16px; line-height: 1.5; color: #d6dde8; }

    #wt-cursor {
      position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform: translate(-6px, -4px);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); opacity: 0;
      transition: left 520ms cubic-bezier(.3,.8,.3,1), top 520ms cubic-bezier(.3,.8,.3,1), opacity 200ms ease;
    }
    #wt-cursor.show { opacity: 1; }
    #wt-pulse {
      position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 3px solid #7cc4ff;
      transform: translate(-50%, -50%) scale(0.3); opacity: 0;
    }
    #wt-pulse.go { animation: wtPulse 520ms ease-out forwards; }
    @keyframes wtPulse { 0% { opacity: .9; transform: translate(-50%,-50%) scale(.3);} 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.3);} }

    #wt-spot {
      position: absolute; border-radius: 14px; border: 2px solid rgba(124,196,255,0.9);
      box-shadow: 0 0 0 6px rgba(124,196,255,0.18), 0 0 40px rgba(124,196,255,0.35);
      opacity: 0; transition: all 380ms ease;
    }
    #wt-spot.show { opacity: 1; }
  `;

  function ensure() {
    if (document.getElementById("wt-root")) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "wt-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div id="wt-spot"></div>
      <div id="wt-card"><div class="inner"></div></div>
      <div id="wt-callout"><span class="chip"></span><h3></h3><p></p><div class="bar"><i></i></div></div>
      <div id="wt-pulse"></div>
      <svg id="wt-cursor" viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3L16 20l-2.6 1.2-3.2-7.2L5 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>
    `;
    document.body.appendChild(root);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  window.__wt = {
    callout(chapter, title, text, durationMs, position) {
      ensure();
      const el = document.getElementById("wt-callout");
      el.classList.toggle("top", position === "top");
      el.querySelector(".chip").textContent = chapter;
      el.querySelector("h3").textContent = title;
      el.querySelector("p").textContent = text;
      const bar = el.querySelector(".bar i");
      bar.style.transition = "none";
      bar.style.width = "0";
      el.classList.add("show");
      requestAnimationFrame(() => {
        bar.style.transition = `width ${Math.max(300, durationMs)}ms linear`;
        bar.style.width = "100%";
      });
    },
    hideCallout() {
      ensure();
      document.getElementById("wt-callout").classList.remove("show");
    },
    card(html) {
      ensure();
      const el = document.getElementById("wt-card");
      el.querySelector(".inner").innerHTML = html;
      el.classList.add("show");
    },
    hideCard() {
      ensure();
      document.getElementById("wt-card").classList.remove("show");
    },
    cursor(x, y) {
      ensure();
      const c = document.getElementById("wt-cursor");
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.classList.add("show");
    },
    hideCursor() {
      ensure();
      document.getElementById("wt-cursor").classList.remove("show");
    },
    pulse(x, y) {
      ensure();
      const p = document.getElementById("wt-pulse");
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.classList.remove("go");
      void p.offsetWidth;
      p.classList.add("go");
    },
    spotlight(rect) {
      ensure();
      const s = document.getElementById("wt-spot");
      if (!rect) {
        s.classList.remove("show");
        return;
      }
      const pad = 8;
      s.style.left = `${rect.x - pad}px`;
      s.style.top = `${rect.y - pad}px`;
      s.style.width = `${rect.width + pad * 2}px`;
      s.style.height = `${rect.height + pad * 2}px`;
      s.classList.add("show");
    },
    esc,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure, { once: true });
  } else {
    ensure();
  }
}
