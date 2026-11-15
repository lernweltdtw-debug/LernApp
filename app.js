// DTW Lernapp – Logik. Inhalte kommen aus fragen.js (window.META, KATEGORIEN, THEMEN).
(function () {
  const META = window.META || { version: 1, stand: "" };
  const KATS = window.KATEGORIEN || [];
  const T = window.THEMEN || [];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- Speicher (nur auf diesem Gerät) ----------
  const KEY = "dtw-lernapp";
  // q: "thema:index" -> { c, w, last, box, due } · xp · best · daily · badges · set: Einstellungen · onb: Begrüßung gesehen
  let S = { q: {}, days: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && raw.q) S = raw; } catch (e) {}
  function normalize() {
    S.q = S.q || {}; S.days = S.days || [];
    S.xp = S.xp || 0; S.best = Object.assign({ blitz: 0, swipe: 0 }, S.best || {}); S.daily = S.daily || { d: "", n: 0, done: false }; S.badges = S.badges || [];
    S.set = Object.assign({ name: "", goal: 10, sound: true, big: false, light: false }, S.set || {}); S.hist = S.hist || {};
    // Ältere Spielstände ohne Plan: gelernte Fragen werden heute einmal fällig
    Object.values(S.q).forEach((v) => { if (v.box === undefined) { v.box = v.last ? 1 : 0; v.due = new Date().toISOString().slice(0, 10); } });
  }
  normalize();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const today = () => new Date().toISOString().slice(0, 10);
  const qkey = (t, i) => t.id + ":" + i;
  const INTERVAL = [1, 1, 3, 7, 14, 30];
  const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const isDue = (k) => S.q[k] && S.q[k].due && S.q[k].due <= today();
  const known = (k) => S.q[k] && S.q[k].last === true;
  const wrongOpen = (k) => S.q[k] && S.q[k].last === false;

  function streak() {
    const set = new Set(S.days); let n = 0; const d = new Date();
    if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1); // heute noch nicht gelernt → ab gestern zählen
    while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- Level, XP, Tagesaufgabe, Abzeichen ----------
  const LEVELS = [
    { n: "Azubi", xp: 0, ic: "🔧" }, { n: "Geselle", xp: 250, ic: "🛠️" }, { n: "Meister", xp: 700, ic: "⚙️" },
    { n: "Techniker", xp: 1500, ic: "📐" }, { n: "Ingenieur", xp: 3000, ic: "🚀" },
  ];
  const levelOf = (xp) => { let k = 0; LEVELS.forEach((l, i) => { if (xp >= l.xp) k = i; }); return k; };
  const goal = () => S.set.goal || 10;
  const DAILY_BONUS = 50;
  const BADGES = [
    { id: "first", t: "🎯 Erste Antwort" }, { id: "streak3", t: "🔥 3 Tage" }, { id: "streak7", t: "🔥 7 Tage" },
    { id: "c100", t: "💯 100 richtig" }, { id: "perfect", t: "🏆 Perfektes Quiz" }, { id: "exam", t: "🎓 Prüfung bestanden" },
    { id: "blitz15", t: "⚡ Blitz 15+" }, { id: "swipe20", t: "👆 20 im Wischen" }, { id: "daily", t: "📅 Tagesaufgabe" },
  ];
  let toastQ = [], toastBusy = false;
  function toast(msg) {
    toastQ.push(msg); if (toastBusy) return;
    const nextT = () => { const m = toastQ.shift(); if (!m) { toastBusy = false; return; } toastBusy = true;
      const el = $("toast"); el.textContent = m; el.classList.remove("hidden"); el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      setTimeout(() => { el.classList.add("hidden"); setTimeout(nextT, 150); }, 2200); };
    nextT();
  }
  function award(id) { if (S.badges.includes(id)) return; S.badges.push(id); const b = BADGES.find((x) => x.id === id); if (b) { toast("Abzeichen: " + b.t); confetti(60); } save(); }
  function gain(n) {
    if (n <= 0) return;
    const before = levelOf(S.xp); S.xp += n; if (run) run.xp = (run.xp || 0) + n;
    const after = levelOf(S.xp); if (after > before) { toast(`⬆️ Level-Up: ${LEVELS[after].ic} ${LEVELS[after].n}!`); confetti(140); }
    save();
  }
  function countCorrect() {
    const d = today(); if (S.daily.d !== d) S.daily = { d, n: 0, done: false };
    S.daily.n++;
    if (!S.daily.done && S.daily.n >= goal()) { S.daily.done = true; toast(`📅 Tagesziel geschafft: +${DAILY_BONUS} XP`); gain(DAILY_BONUS); award("daily"); }
    let c = 0; Object.values(S.q).forEach((v) => (c += v.c)); if (c >= 100) award("c100");
    save();
  }

  // ---------- Ton (kurzer Klang, ohne Audiodateien) ----------
  let AC = null;
  function sound(ok) {
    if (!S.set.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = AC.currentTime, notes = ok ? [880, 1320] : [220, 165];
      notes.forEach((f, k) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = ok ? "sine" : "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + k * 0.09); g.gain.exponentialRampToValueAtTime(0.18, t0 + k * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.09 + 0.16);
        o.connect(g).connect(AC.destination); o.start(t0 + k * 0.09); o.stop(t0 + k * 0.09 + 0.18); });
    } catch (e) {}
  }
  const buzz = () => { if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } };

  // ---------- Konfetti ----------
  function confetti(n) {
    const cv = $("confetti"), cx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
    const cols = ["#40d6be", "#2bb3ff", "#ffd25a", "#ff8a1f", "#33d17a", "#b69cff"];
    const P = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 8,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)] }));
    let f = 0; const t0 = performance.now(); cv.classList.add("on");
    (function step() { f++; cx.clearRect(0, 0, cv.width, cv.height);
      P.forEach((p) => { p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = Math.max(0, 1 - f / 120); cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); });
      if (f < 120 && performance.now() - t0 < 2400) requestAnimationFrame(step); else { cx.clearRect(0, 0, cv.width, cv.height); cv.classList.remove("on"); } })();
  }

  // ---------- Hilfen ----------
  const allItems = () => T.flatMap((t) => t.fragen.map((_, i) => ({ t, i })));
  const shuffle = (arr) => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const newest = () => { const d = T.map((t) => t.datum || "").sort().pop(); return T.filter((t) => t.datum === d); };
  const VIEWS = ["home", "topics", "wissen", "me", "quiz", "result", "blitz", "swipe"], TABS = ["home", "topics", "wissen", "me"];
  function show(id) {
    VIEWS.forEach((s) => { const el = $(s); el.classList.toggle("hidden", s !== id); if (s === id) { el.classList.remove("view"); void el.offsetWidth; el.classList.add("view"); } });
    const tab = TABS.includes(id); $("tabbar").classList.toggle("hidden", !tab); document.body.classList.toggle("withTabs", tab);
    [...$("tabbar").children].forEach((b) => b.classList.toggle("on", b.dataset.v === id));
    window.scrollTo(0, 0);
  }
  function setVideo(el, url) {
    if (url) { el.href = url; el.classList.remove("off"); el.textContent = "▶ Video dazu ansehen"; }
    else { el.removeAttribute("href"); el.classList.add("off"); el.textContent = "▶ Video kommt bald"; }
  }
  function topicCard(t, isNew) {
    const n = t.fragen.filter((_, i) => known(qkey(t, i))).length, all = t.fragen.length, full = n === all;
    const b = document.createElement("button"); b.className = "tcard" + (full ? " full" : "");
    b.innerHTML = `<span class="tImg">${t.bild ? `<img src="${esc(t.bild)}" alt="" loading="lazy" />` : `<span class="ic">${t.icon}</span>`}${isNew ? '<span class="badge new">neu</span>' : ""}${t.video ? '<span class="badge vid">▶</span>' : ""}</span>`
      + `<span class="tBody"><b>${esc(t.titel)}</b><span class="tMeta"><small>${full ? "✓ alles gelernt" : `${n}/${all} Fragen`}</small></span><span class="tBar"><i style="width:${(n / all) * 100}%"></i></span></span>`;
    b.onclick = () => start(shuffle(t.fragen.map((_, i) => ({ t, i }))), { title: t.titel, topic: t });
    return b;
  }
  function applySettings() { document.documentElement.classList.toggle("big", !!S.set.big); document.documentElement.classList.toggle("light", !!S.set.light);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", S.set.light ? "#eef2f6" : "#07090c"); }

  // ---------- Prüfungsvorbereitung AP1 / AP2 ----------
  const apItems = (n) => allItems().filter(({ t }) => (t.ap || []).includes(n));
  function readiness(n) {
    const it = apItems(n); if (!it.length) return 0;
    const sc = it.reduce((s, { t, i }) => { const v = S.q[qkey(t, i)]; const b = v && v.last ? v.box || 1 : 0; return s + Math.min(b, 3) / 3; }, 0);
    return Math.round((sc / it.length) * 100);
  }
  function startAP(n) { start(shuffle(apItems(n)).slice(0, 15), { title: `Prüfung AP${n}`, exam: true, apN: n, end: Date.now() + 10 * 60 * 1000 }); }

  // ---------- Kopf + Startseite ----------
  function renderHead() {
    const h = new Date().getHours(), gruss = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    $("hello").textContent = S.set.name ? `${gruss}, ${S.set.name}!` : "DTW Lernapp";
    $("helloSub").textContent = S.set.name ? "Bereit für ein paar Fragen?" : "Technik lernen in Minuten";
    $("sStreak").textContent = streak();
  }
  function renderHome() {
    stopGames(); renderHead();
    const items = allItems(), all = items.length;
    const got = items.filter(({ t, i }) => known(qkey(t, i))).length;
    let c = 0, w = 0; Object.values(S.q).forEach((v) => { c += v.c; w += v.w; });
    const st = streak(); if (st >= 3) award("streak3"); if (st >= 7) award("streak7");
    $("sAcc").textContent = c + w ? Math.round((c / (c + w)) * 100) + " %" : "–";
    $("totTxt").textContent = `${got}/${all}`; $("totBar").style.width = (all ? (got / all) * 100 : 0) + "%";
    // Level-Ring
    const k = levelOf(S.xp), L = LEVELS[k], N = LEVELS[k + 1];
    $("lvIc").textContent = L.ic; $("lvName").textContent = L.n; $("lvXp").textContent = S.xp.toLocaleString("de-DE");
    $("lvNext").textContent = N ? `noch ${N.xp - S.xp} bis ${N.n}` : "Höchstes Level!";
    const RC = 2 * Math.PI * 28, rp = N ? (S.xp - L.xp) / (N.xp - L.xp) : 1; $("lvRing").setAttribute("stroke-dasharray", RC.toFixed(1)); $("lvRing").setAttribute("stroke-dashoffset", (RC * (1 - rp)).toFixed(1));
    // Tagesziel
    const d = S.daily.d === today() ? S.daily : { n: 0, done: false }, G = goal();
    $("dTxt").textContent = d.done ? "Erledigt – morgen gibt's ein neues" : `${G} Fragen richtig beantworten · +${DAILY_BONUS} XP`;
    $("dPr").textContent = d.done ? "✓" : `${Math.min(d.n, G)}/${G}`; $("dBar").style.width = (d.done ? 100 : (Math.min(d.n, G) / G) * 100) + "%"; $("daily").classList.toggle("done", !!d.done);
    $("blitzBest").textContent = "Rekord: " + (S.best.blitz || "–"); $("swipeBest").textContent = "Rekord: " + (S.best.swipe || "–");

    const wrong = items.filter(({ t, i }) => wrongOpen(qkey(t, i)));
    const fresh = items.filter(({ t, i }) => !S.q[qkey(t, i)]);
    const due = items.filter(({ t, i }) => isDue(qkey(t, i)));
    $("wrongS").textContent = wrong.length ? `${wrong.length} offen` : "nichts offen"; $("wrongBtn").disabled = !wrong.length;
    $("sDueN").textContent = due.length;
    $("dueS").textContent = due.length ? `${due.length} fällig` : "nichts fällig"; $("dueBtn").disabled = !due.length;
    const nw = newest(); $("newS").textContent = nw.map((t) => t.titel).join(", ") || "–";
    // Hauptknopf: Fällige zuerst, dann Fehler, dann Neues, sonst Prüfung
    let hero;
    if (due.length) hero = { em: "📆", t: "Heute wiederholen", s: `${due.length} Fragen sind heute fällig`, go: () => start(shuffle(due).slice(0, 20), { title: "Wiederholen" }) };
    else if (wrong.length) hero = { em: "🔁", t: "Fehler wiederholen", s: `${wrong.length} Fragen, die noch nicht sitzen`, go: () => start(shuffle(wrong), { title: "Fehler üben" }) };
    else if (fresh.length) hero = { em: "🎯", t: got ? "Weiterlernen" : "Los geht's", s: `${fresh.length} neue Fragen warten`, go: () => start(shuffle(fresh).slice(0, 10), { title: "Weiterlernen" }) };
    else hero = { em: "🏆", t: "Alles gelernt!", s: "Teste dich im Prüfungsmodus", go: startExam };
    $("heroEm").textContent = hero.em; $("heroT").textContent = hero.t; $("heroS").textContent = hero.s; $("heroBtn").onclick = hero.go;

    [1, 2].forEach((n) => { const p = readiness(n), it = apItems(n).length;
      $("ap" + n + "P").textContent = p + " %"; $("ap" + n + "Bar").style.width = p + "%"; $("ap" + n + "N").textContent = `${it} Fragen`; $("ap" + n + "Btn").onclick = () => startAP(n); });

    // Neueste Themen als Karussell (die 6 jüngsten)
    const newIds = new Set(nw.map((t) => t.id)), nc = $("newCarousel"); nc.innerHTML = "";
    T.slice().sort((a, b) => (b.datum || "").localeCompare(a.datum || "")).slice(0, 6).forEach((t) => nc.appendChild(topicCard(t, newIds.has(t.id))));
    show("home");
  }

  // ---------- Themen-Seite ----------
  let katFilter = "";
  function renderTopics() {
    renderHead();
    const q = ($("tSearch").value || "").trim().toLowerCase();
    const chips = $("katChips"); chips.innerHTML = "";
    [{ id: "", titel: "Alle", icon: "✨" }, ...KATS.filter((k) => T.some((t) => t.kat === k.id))].forEach((k) => {
      const b = document.createElement("button"); b.className = "chip" + (katFilter === k.id ? " on" : ""); b.textContent = `${k.icon} ${k.titel}`;
      b.onclick = () => { katFilter = k.id; renderTopics(); }; chips.appendChild(b);
    });
    const box = $("cats"); box.innerHTML = ""; const newIds = new Set(newest().map((t) => t.id)); let shown = 0;
    KATS.forEach((k) => {
      if (katFilter && katFilter !== k.id) return;
      const ts = T.filter((t) => t.kat === k.id && (!q || (t.titel + " " + t.fragen.map((f) => f.q).join(" ")).toLowerCase().includes(q))); if (!ts.length) return;
      const done = ts.reduce((s, t) => s + t.fragen.filter((_, i) => known(qkey(t, i))).length, 0), allK = ts.reduce((s, t) => s + t.fragen.length, 0);
      const h = document.createElement("div"); h.className = "secHd"; h.innerHTML = `<h2></h2><span class="secR">${done}/${allK}</span>`; h.firstChild.textContent = k.icon + " " + k.titel; box.appendChild(h);
      const grid = document.createElement("div"); grid.className = "tgrid";
      ts.forEach((t) => grid.appendChild(topicCard(t, newIds.has(t.id)))); box.appendChild(grid); shown += ts.length;
    });
    $("tEmpty").classList.toggle("hidden", shown > 0);
  }
  $("tSearch").addEventListener("input", renderTopics);

  // ---------- Profil-Seite ----------
  function renderMe() {
    renderHead();
    let c = 0, w = 0; Object.values(S.q).forEach((v) => { c += v.c; w += v.w; });
    const items = allItems(), got = items.filter(({ t, i }) => known(qkey(t, i))).length, L = LEVELS[levelOf(S.xp)];
    const tiles = [["⭐", S.xp.toLocaleString("de-DE"), "XP · " + L.n], ["✅", `${got}/${items.length}`, "Fragen gelernt"], ["🎯", c + w ? Math.round((c / (c + w)) * 100) + " %" : "–", "Trefferquote"],
      ["🔥", streak(), "Tage am Stück"], ["⚡", S.best.blitz || "–", "Blitz-Rekord"], ["👆", S.best.swipe || "–", "Wisch-Rekord"]];
    $("mStats").innerHTML = tiles.map(([ic, v, l]) => `<div class="mt"><span>${ic}</span><b>${v}</b><small>${l}</small></div>`).join("");
    const gotB = BADGES.filter((b) => S.badges.includes(b.id)); $("bdgCount").textContent = `${gotB.length}/${BADGES.length}`;
    $("badges").innerHTML = BADGES.map((b) => { const on = S.badges.includes(b.id), sp = b.t.indexOf(" "); return `<div class="bdg ${on ? "on" : ""}"><span class="bi">${on ? b.t.slice(0, sp) : "🔒"}</span><small>${b.t.slice(sp + 1)}</small></div>`; }).join("");
    $("setName").value = S.set.name || "";
    [...$("setGoal").children].forEach((b) => b.classList.toggle("on", +b.dataset.v === goal()));
    $("setSound").classList.toggle("on", !!S.set.sound); $("setSound").setAttribute("aria-checked", !!S.set.sound);
    $("setBig").classList.toggle("on", !!S.set.big); $("setBig").setAttribute("aria-checked", !!S.set.big);
    $("setLight").classList.toggle("on", !!S.set.light); $("setLight").setAttribute("aria-checked", !!S.set.light);
    renderWeek(); renderWeak();
    $("stand").textContent = `Stand ${META.stand ? META.stand.split("-").reverse().join(".") : ""} · ${items.length} Fragen in ${T.length} Themen · Version ${META.version}`;
    $("legal").innerHTML = META.impressum ? `<a href="${esc(META.impressum)}">Impressum</a> · <a href="${esc(META.datenschutz || META.impressum)}">Datenschutz</a>` : "";
  }
  $("setName").addEventListener("change", () => { S.set.name = $("setName").value.trim().slice(0, 20); save(); renderHead(); });
  [...$("setGoal").children].forEach((b) => (b.onclick = () => { S.set.goal = +b.dataset.v; save(); renderMe(); }));
  $("setSound").onclick = () => { S.set.sound = !S.set.sound; save(); renderMe(); if (S.set.sound) sound(true); };
  $("setBig").onclick = () => { S.set.big = !S.set.big; save(); applySettings(); renderMe(); };
  $("setLight").onclick = () => { S.set.light = !S.set.light; save(); applySettings(); renderMe(); };
  // Sichern / Laden
  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "dtw-lernapp", v: 1, datum: today(), data: S }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dtw-lernapp-fortschritt-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("💾 Sicherung gespeichert");
  };
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (j.app !== "dtw-lernapp" || !j.data || !j.data.q) throw new Error("x");
      S = j.data; normalize(); save(); applySettings(); toast("📂 Fortschritt geladen"); renderMe(); }
    catch (err) { toast("Diese Datei ist keine DTW-Sicherung"); }
    e.target.value = "";
  };
  $("resetBtn").onclick = () => { if (!confirm("Wirklich den ganzen Fortschritt löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const keep = S.set; S = { q: {}, days: [], set: keep, onb: true }; normalize(); save(); toast("Fortschritt zurückgesetzt"); renderMe(); };

  // ---------- Profil: Woche + Schwächen ----------
  function renderWeek() {
    const days = [], WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    for (let k = 6; k >= 0; k--) { const d = addDays(today(), -k); const h = S.hist[d] || { c: 0, w: 0 }; days.push({ d, l: k === 0 ? "Heute" : WD[new Date(d + "T12:00:00").getDay()], c: h.c, w: h.w }); }
    const max = Math.max(goal(), ...days.map((x) => x.c + x.w)), sum = days.reduce((s, x) => s + x.c, 0);
    $("weekSum").textContent = `${sum} richtig · Ziel ${goal()}/Tag`;
    $("week").innerHTML = days.map((x) => `<div class="wd${x.c >= goal() ? " hit" : ""}"><div class="wb"><i class="w" style="height:${((x.c + x.w) / max) * 100}%"></i><i class="c" style="height:${(x.c / max) * 100}%"></i></div><small>${x.l}</small><b>${x.c || ""}</b></div>`).join("")
;
  }
  function renderWeak() {
    const rows = T.map((t) => { let c = 0, w = 0, seen = 0; t.fragen.forEach((_, i) => { const v = S.q[qkey(t, i)]; if (v) { c += v.c; w += v.w; seen++; } });
      return { t, acc: c + w ? c / (c + w) : 1, seen, n: c + w }; }).filter((r) => r.n >= 2 && r.acc < 0.85).sort((a, b) => a.acc - b.acc).slice(0, 3);
    const box = $("weak"); box.innerHTML = "";
    if (!rows.length) { box.innerHTML = `<p class="apNote">Noch keine Schwächen erkannt – beantworte ein paar Fragen, dann zeigen wir dir hier, wo du ansetzen solltest. 💪</p>`; return; }
    rows.forEach(({ t, acc }) => { const b = document.createElement("button"); b.className = "weakRow";
      b.innerHTML = `${t.bild ? `<img src="${esc(t.bild)}" alt="" />` : `<span class="ic">${t.icon}</span>`}<span class="wTx"><b>${esc(t.titel)}</b><span class="tBar"><i style="width:${Math.round(acc * 100)}%"></i></span></span><span class="wP">${Math.round(acc * 100)} %</span><span class="go">Üben ›</span>`;
      b.onclick = () => start(shuffle(t.fragen.map((_, i) => ({ t, i }))), { title: t.titel, topic: t }); box.appendChild(b); });
  }

  // ---------- Wissen: Formeln + Begriffe ----------
  const WI = window.WISSEN || { formeln: [], begriffe: [] };
  let wMode = "f";
  function renderWissen() {
    renderHead();
    [...$("wSeg").children].forEach((b) => b.classList.toggle("on", b.dataset.v === wMode));
    const q = ($("wSearch").value || "").trim().toLowerCase(), box = $("wList"); box.innerHTML = "";
    const byId = (id) => T.find((t) => t.id === id);
    const list = wMode === "f" ? WI.formeln.filter((x) => !q || (x.t + x.f + x.n).toLowerCase().includes(q)) : WI.begriffe.slice().sort((a, b) => a.w.localeCompare(b.w, "de")).filter((x) => !q || (x.w + x.e).toLowerCase().includes(q));
    if (!list.length) { box.innerHTML = `<p class="empty">Nichts gefunden.</p>`; return; }
    list.forEach((x) => {
      const t = byId(x.thema), d = document.createElement("div"); d.className = wMode === "f" ? "fcardW" : "gcard";
      d.innerHTML = wMode === "f" ? `<small></small><div class="fx"></div><p></p>` : `<b></b><p></p>`;
      if (wMode === "f") { d.children[0].textContent = x.t; d.children[1].textContent = x.f; d.children[2].textContent = x.n; } else { d.children[0].textContent = x.w; d.children[1].textContent = x.e; }
      if (t) { const b = document.createElement("button"); b.className = "wGo"; b.textContent = `${t.icon} Fragen dazu: ${t.titel} ›`; b.onclick = () => start(shuffle(t.fragen.map((_, i) => ({ t, i }))), { title: t.titel, topic: t }); d.appendChild(b); }
      box.appendChild(d);
    });
  }
  [...$("wSeg").children].forEach((b) => (b.onclick = () => { wMode = b.dataset.v; renderWissen(); }));
  $("wSearch").addEventListener("input", renderWissen);

  // ---------- Hinweis auf neue Videos/Themen ----------
  function checkNew() {
    const nd = T.map((t) => t.datum || "").sort().pop() || "";
    if (!S.lastNewest) { S.lastNewest = nd; save(); return; }
    if (nd <= S.lastNewest) return;
    const fresh = T.filter((t) => (t.datum || "") > S.lastNewest); S.lastNewest = nd; save(); if (!fresh.length) return;
    const n = fresh.reduce((s, t) => s + t.fragen.length, 0);
    $("nmTxt").textContent = `${fresh.length} ${fresh.length === 1 ? "neues Thema" : "neue Themen"} mit ${n} Fragen – passend zu den neuesten Videos.`;
    $("nmCards").innerHTML = fresh.slice(0, 4).map((t) => `<div class="nmc">${t.bild ? `<img src="${esc(t.bild)}" alt="" />` : ""}<b>${esc(t.titel)}</b></div>`).join("");
    $("newMod").classList.remove("hidden");
    $("nmGo").onclick = () => { $("newMod").classList.add("hidden"); start(shuffle(fresh.flatMap((t) => t.fragen.map((_, i) => ({ t, i })))).slice(0, 15), { title: "Neu", topic: fresh.length === 1 ? fresh[0] : null }); };
    $("nmLater").onclick = () => $("newMod").classList.add("hidden");
  }
  // ---------- Navigation ----------
  [...$("tabbar").children].forEach((b) => (b.onclick = () => goTab(b.dataset.v)));
  function goTab(v) { if (v === "home") renderHome(); else { stopGames(); if (v === "topics") renderTopics(); else if (v === "wissen") renderWissen(); else renderMe(); show(v); } }
  $("allTopicsBtn").onclick = () => goTab("topics");

  // ---------- Quiz ----------
  let run = null, timerId = null;
  function start(items, opt) {
    if (!items.length) return;
    run = Object.assign({ items, pos: 0, results: [], exam: false, end: 0, xp: 0 }, opt || {});
    run.order = items.map(() => shuffle([0, 1, 2]));
    clearInterval(timerId); $("timer").classList.add("hidden");
    if (run.exam) { $("timer").classList.remove("hidden"); tick(); timerId = setInterval(tick, 500); }
    renderQ(); show("quiz");
  }
  function startExam() { start(shuffle(allItems()).slice(0, 15), { title: "Prüfung", exam: true, end: Date.now() + 10 * 60 * 1000 }); }
  function tick() { const ms = Math.max(0, run.end - Date.now()), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    $("timer").textContent = `${m}:${String(s).padStart(2, "0")}`; if (ms <= 0) { clearInterval(timerId); finish(); } }

  function renderQ() {
    const { t, i } = run.items[run.pos], f = t.fragen[i];
    $("qBar").style.width = (run.pos / run.items.length) * 100 + "%";
    $("qTag").textContent = `${t.icon} ${t.titel} · ${run.pos + 1}/${run.items.length}`;
    $("qText").textContent = f.q;
    const qi = $("qImg"); if (t.bild) { qi.src = t.bild; qi.classList.remove("hidden"); } else qi.classList.add("hidden");
    const box = $("answers"); box.innerHTML = "";
    run.order[run.pos].forEach((orig, k) => {
      const b = document.createElement("button"); b.className = "ans"; b.dataset.orig = orig; b.style.animationDelay = k * 0.05 + "s";
      b.innerHTML = `<span class="k">${"ABC"[k]}</span><span></span>`; b.lastChild.textContent = f.a[orig];
      b.onclick = () => answer(orig, b); box.appendChild(b);
    });
    $("explain").classList.add("hidden"); $("qBtns").classList.add("hidden");
  }

  function record(t, i, ok) {
    const k = qkey(t, i), v = S.q[k] || { c: 0, w: 0, last: null };
    if (ok) v.c++; else v.w++; v.last = ok;
    // Wiederholen nach Plan: richtig → nächste Stufe (1, 3, 7, 14, 30 Tage), falsch → zurück auf Stufe 0, morgen wieder
    v.box = ok ? Math.min((v.box || 0) + 1, 5) : 0; v.due = addDays(today(), ok ? INTERVAL[v.box] : 1); S.q[k] = v;
    const d = today(); if (!S.days.includes(d)) { S.days.push(d); S.days = S.days.slice(-400); }
    const h = S.hist[d] || { c: 0, w: 0 }; if (ok) h.c++; else h.w++; S.hist[d] = h;
    const ks = Object.keys(S.hist).sort(); if (ks.length > 120) ks.slice(0, ks.length - 120).forEach((x) => delete S.hist[x]);
    award("first");
    if (ok) countCorrect();
    save();
  }

  function answer(orig, btn) {
    const { t, i } = run.items[run.pos], f = t.fragen[i], ok = orig === f.r;
    run.results.push(ok); record(t, i, ok); if (ok) gain(10);
    const btns = [...$("answers").children]; btns.forEach((b) => (b.disabled = true));
    if (run.exam) { btn.classList.add("sel"); setTimeout(next, 350); return; }
    btns.forEach((b) => { const o = +b.dataset.orig; if (o === f.r) b.classList.add("ok"); else if (b === btn) b.classList.add("no"); });
    sound(ok); if (!ok) buzz();
    if (ok) xpPop(btn, "+10 XP");
    $("exTitle").textContent = ok ? "✓ Richtig!" : "✕ Leider falsch"; $("exTitle").className = ok ? "ok" : "no";
    $("explain").classList.toggle("ok", ok);
    $("exText").textContent = f.e; setVideo($("vidBtn"), t.video);
    $("nextBtn").textContent = run.pos + 1 < run.items.length ? "Weiter" : "Ergebnis";
    $("explain").classList.remove("hidden"); $("qBtns").classList.remove("hidden");
    $("qBtns").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function xpPop(el, txt) {
    const r = el.getBoundingClientRect(), p = document.createElement("div"); p.className = "xpPop"; p.textContent = txt;
    p.style.left = r.right - 90 + "px"; p.style.top = r.top + window.scrollY + 8 + "px"; document.body.appendChild(p); setTimeout(() => p.remove(), 900);
  }
  function next() { run.pos++; if (run.pos < run.items.length) renderQ(); else finish(); }
  $("nextBtn").onclick = next;
  $("quitBtn").onclick = () => { clearInterval(timerId); renderHome(); };

  // ---------- Ergebnis ----------
  let shareInfo = null;
  function showResult(o) {
    // o: { big, pct (0..1), title, text, review, again, againTxt, topic, share }
    $("rScore").textContent = o.big;
    const C = 2 * Math.PI * 52; $("rRing").setAttribute("stroke-dasharray", C.toFixed(1));
    $("rRing").style.transition = "none"; $("rRing").setAttribute("stroke-dashoffset", C.toFixed(1));
    requestAnimationFrame(() => requestAnimationFrame(() => { $("rRing").style.transition = ""; $("rRing").setAttribute("stroke-dashoffset", (C * (1 - o.pct)).toFixed(1)); }));
    $("rRing").classList.toggle("good", o.pct >= 0.8); $("rRing").classList.toggle("bad", o.pct < 0.5);
    $("rTitle").textContent = o.title; $("rText").textContent = o.text;
    const el = $("rXp"); el.classList.toggle("hidden", !run.xp); el.textContent = `+${run.xp} XP · ${LEVELS[levelOf(S.xp)].ic} ${LEVELS[levelOf(S.xp)].n}`;
    const rev = $("review"); rev.innerHTML = o.review.length ? `<div class="secHd"><h2>Das solltest du wiederholen</h2></div>` : "";
    o.review.forEach(({ t, i, timeout }) => { const f = t.fragen[i];
      const d = document.createElement("div"); d.className = "rev";
      d.innerHTML = `<b></b><div class="ra"></div><p></p>`; d.children[0].textContent = (timeout ? "⏱ " : "") + f.q;
      d.children[1].textContent = "✓ " + f.a[f.r]; d.children[2].textContent = f.e; rev.appendChild(d); });
    $("rVid").classList.toggle("hidden", !o.topic); if (o.topic) setVideo($("rVid"), o.topic.video);
    $("againBtn").textContent = o.againTxt || "Nochmal"; $("againBtn").onclick = o.again;
    shareInfo = o.share;
    show("result");
    if (o.pct >= 0.999 || o.record) setTimeout(() => confetti(160), 250);
  }
  function finish() {
    clearInterval(timerId);
    const n = run.results.filter(Boolean).length, all = run.items.length, p = all ? n / all : 0;
    if (p === 1 && all >= 5) award("perfect");
    if (run.exam && p >= 0.5) award("exam");
    showResult({
      big: `${n}/${all}`, pct: p,
      title: p === 1 ? "Perfekt! 🏆" : p >= 0.8 ? "Stark! 💪" : p >= 0.5 ? "Gut, weiter so! 🔧" : "Dranbleiben! 📚",
      text: run.exam ? (p >= 0.5 ? "Prüfung bestanden (ab 50 %)." : "Noch nicht bestanden – unten siehst du, was du wiederholen solltest.")
        : p === 1 ? "Alles richtig – das sitzt." : "Falsche Fragen kommen morgen automatisch wieder.",
      review: run.items.map((it, k) => Object.assign({ timeout: run.results[k] === undefined }, it)).filter((_, k) => !run.results[k]),
      topic: run.topic,
      again: () => run.apN ? startAP(run.apN) : run.exam ? startExam() : start(shuffle(run.items), { title: run.title, topic: run.topic }),
      share: { head: run.title, big: `${n}/${all}`, line: p === 1 ? "Alles richtig! 🏆" : `${Math.round(p * 100)} % richtig` },
    });
  }
  $("homeBtn").onclick = renderHome;

  // ---------- Ergebnis teilen (Bild) ----------
  function shareImage(info) {
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350; const x = cv.getContext("2d");
    const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, "#132331"); g.addColorStop(1, "#07090c"); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    const rg = x.createRadialGradient(900, 120, 0, 900, 120, 600); rg.addColorStop(0, "rgba(43,179,255,.35)"); rg.addColorStop(1, "rgba(43,179,255,0)"); x.fillStyle = rg; x.fillRect(0, 0, 1080, 1350);
    x.textAlign = "center"; x.fillStyle = "#8a94a0"; x.font = "700 44px Inter, sans-serif"; x.fillText("DTW LERNAPP", 540, 250);
    x.fillStyle = "#f4f6f8"; x.font = "800 64px Inter, sans-serif"; x.fillText(info.head, 540, 360);
    x.fillStyle = "#40d6be"; x.font = "900 260px Inter, sans-serif"; x.fillText(info.big, 540, 680);
    x.fillStyle = "#ffd25a"; x.font = "800 64px Inter, sans-serif"; x.fillText(info.line, 540, 800);
    x.fillStyle = "#f4f6f8"; x.font = "700 56px Inter, sans-serif"; x.fillText("Schaffst du mehr? 💪", 540, 960);
    x.fillStyle = "#2bb3ff"; x.font = "800 50px Inter, sans-serif"; x.fillText("@dietechnikerwelt", 540, 1180);
    return new Promise((res) => {
      const logo = new Image(); logo.onload = () => { x.save(); x.beginPath(); x.arc(540, 120, 70, 0, Math.PI * 2); x.clip(); x.drawImage(logo, 470, 50, 140, 140); x.restore(); cv.toBlob(res, "image/png"); };
      logo.onerror = () => cv.toBlob(res, "image/png"); logo.src = "dtw-logo.jpg";
    });
  }
  $("shareBtn").onclick = async () => {
    if (!shareInfo) return;
    const blob = await shareImage(shareInfo); const file = new File([blob], "dtw-ergebnis.png", { type: "image/png" });
    const text = `${shareInfo.head}: ${shareInfo.big} – ${shareInfo.line} in der DTW Lernapp. Schaffst du mehr? @dietechnikerwelt`;
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "dtw-ergebnis.png"; document.body.appendChild(a); a.click(); a.remove();
    toast("🖼️ Bild gespeichert – jetzt in Story oder WhatsApp teilen");
  };

  // ---------- Spiel 1: 60-Sekunden-Blitz ----------
  const BLITZ_S = 60, RING_C = 2 * Math.PI * 19;
  let B = null, bTimer = null, W = null;
  function stopGames() { clearInterval(bTimer); bTimer = null; if (B) B.over = true; if (W) W.over = true; }
  function startBlitz() {
    stopGames();
    run = { xp: 0 };
    B = { end: Date.now() + BLITZ_S * 1000, score: 0, combo: 0, pool: shuffle(allItems()), pos: 0, wrong: [], lock: false, over: false };
    $("bRing").setAttribute("stroke-dasharray", RING_C.toFixed(1));
    $("bScore").textContent = "0"; $("bCombo").textContent = "";
    bTick(); bTimer = setInterval(bTick, 100);
    bRender(); show("blitz");
  }
  function bTick() {
    const ms = Math.max(0, B.end - Date.now()), s = Math.ceil(ms / 1000);
    $("bTime").textContent = s; $("bRing").setAttribute("stroke-dashoffset", (RING_C * (1 - ms / (BLITZ_S * 1000))).toFixed(1));
    $("bTime").parentElement.classList.toggle("low", s <= 10);
    if (ms <= 0) bEnd();
  }
  function bRender() {
    if (B.pos >= B.pool.length) { B.pool = shuffle(allItems()); B.pos = 0; }
    const { t, i } = B.pool[B.pos], f = t.fragen[i];
    $("bTag").textContent = `${t.icon} ${t.titel}`; $("bText").textContent = f.q;
    const box = $("bAnswers"); box.innerHTML = "";
    shuffle([0, 1, 2]).forEach((orig, k) => {
      const b = document.createElement("button"); b.className = "ans"; b.dataset.orig = orig;
      b.innerHTML = `<span class="k">${"ABC"[k]}</span><span></span>`; b.lastChild.textContent = f.a[orig];
      b.onclick = () => bAnswer(orig, b); box.appendChild(b);
    });
  }
  function flash(el, ok) { el.className = "flash " + (ok ? "ok" : "no"); requestAnimationFrame(() => requestAnimationFrame(() => (el.className = "flash"))); }
  function bAnswer(orig, btn) {
    if (B.lock || B.over) return; B.lock = true;
    const { t, i } = B.pool[B.pos], f = t.fragen[i], ok = orig === f.r;
    record(t, i, ok); sound(ok);
    if (ok) { B.score++; B.combo++; const xp = 3 + Math.min(B.combo, 5); gain(xp); btn.classList.add("ok"); xpPop(btn, "+" + xp); }
    else { B.combo = 0; B.wrong.push({ t, i }); btn.classList.add("no"); buzz(); [...$("bAnswers").children].forEach((b) => { if (+b.dataset.orig === f.r) b.classList.add("ok"); }); }
    flash($("gFlash"), ok);
    $("bScore").textContent = B.score; $("bCombo").textContent = B.combo >= 2 ? `🔥 x${B.combo}` : "";
    setTimeout(() => { B.lock = false; if (B.over) return; B.pos++; bRender(); }, ok ? 220 : 1100);
  }
  function bEnd() {
    if (!B || B.over) return; B.over = true; clearInterval(bTimer);
    const rec = B.score > (S.best.blitz || 0); if (rec) S.best.blitz = B.score; if (B.score >= 15) award("blitz15"); save();
    const seen = new Set();
    showResult({
      big: B.score, pct: Math.min(1, B.score / 20), record: rec && B.score > 0,
      title: B.score >= 20 ? "Blitzschnell! ⚡" : B.score >= 10 ? "Stark! 💪" : "Nochmal! 🔧",
      text: rec ? `Neuer Rekord: ${B.score} richtige in 60 Sekunden!` : `Richtige in 60 Sekunden · Rekord: ${S.best.blitz}`,
      review: B.wrong.filter(({ t, i }) => { const k = qkey(t, i); if (seen.has(k)) return false; seen.add(k); return true; }),
      again: startBlitz, againTxt: "Nochmal spielen",
      share: { head: "60-Sekunden-Blitz", big: String(B.score), line: "richtige in 60 Sekunden" },
    });
  }
  $("blitzBtn").onclick = startBlitz;
  $("bQuit").onclick = renderHome;

  // ---------- Spiel 2: Richtig oder falsch (wischen) ----------
  function startSwipe() {
    stopGames();
    run = { xp: 0 };
    W = { lives: 3, score: 0, pool: shuffle(allItems()), pos: 0, wrong: [], lock: false, over: false };
    $("sScore").textContent = "0"; $("sLives").textContent = "❤️❤️❤️"; $("sInfo").classList.add("hidden");
    wRender(); show("swipe");
  }
  function wRender() {
    if (W.pos >= W.pool.length) { W.pool = shuffle(allItems()); W.pos = 0; }
    const { t, i } = W.pool[W.pos], f = t.fragen[i];
    W.truth = Math.random() < 0.5;
    const wrongs = [0, 1, 2].filter((k) => k !== f.r);
    W.shown = W.truth ? f.r : wrongs[Math.floor(Math.random() * wrongs.length)];
    $("sTag").textContent = `${t.icon} ${t.titel}`; $("sQ").textContent = f.q; $("sA").textContent = f.a[W.shown];
    const c = $("sCard"); c.style.transition = "none"; c.style.transform = ""; c.style.opacity = 1; setStamps(0);
  }
  function setStamps(dx) { const c = $("sCard"); c.querySelector(".stamp.yes").style.opacity = Math.max(0, Math.min(1, dx / 90)); c.querySelector(".stamp.no").style.opacity = Math.max(0, Math.min(1, -dx / 90)); }
  function wChoose(sayTrue) {
    if (!W || W.lock || W.over) return; W.lock = true;
    const { t, i } = W.pool[W.pos], f = t.fragen[i], ok = sayTrue === W.truth;
    const c = $("sCard"); c.style.transition = "transform .25s ease, opacity .25s"; c.style.transform = `translateX(${sayTrue ? 520 : -520}px) rotate(${sayTrue ? 20 : -20}deg)`; c.style.opacity = 0;
    flash($("gFlash"), ok); sound(ok);
    if (ok) {
      W.score++; gain(4); $("sScore").textContent = W.score;
      setTimeout(() => { W.lock = false; W.pos++; wRender(); }, 260);
    } else {
      W.lives--; W.wrong.push({ t, i }); buzz();
      $("sLives").textContent = "❤️".repeat(W.lives) + "🖤".repeat(3 - W.lives);
      const info = $("sInfo"); info.innerHTML = `${W.truth ? "Doch, das stimmt!" : "Stimmt nicht."} Richtig ist: <b></b>`; info.querySelector("b").textContent = f.a[f.r]; info.classList.remove("hidden");
      setTimeout(() => { info.classList.add("hidden"); W.lock = false; if (W.lives <= 0) return wEnd(); W.pos++; wRender(); }, 1700);
    }
  }
  function wEnd() {
    W.over = true;
    const rec = W.score > (S.best.swipe || 0); if (rec) S.best.swipe = W.score; if (W.score >= 20) award("swipe20"); save();
    showResult({
      big: W.score, pct: Math.min(1, W.score / 20), record: rec && W.score > 0,
      title: W.score >= 20 ? "Unschlagbar! 👆" : W.score >= 10 ? "Stark! 💪" : "Nochmal! 🔧",
      text: rec ? `Neuer Rekord: ${W.score} richtig erkannt!` : `Richtig erkannt · Rekord: ${S.best.swipe}`,
      review: W.wrong, again: startSwipe, againTxt: "Nochmal spielen",
      share: { head: "Richtig oder falsch?", big: String(W.score), line: "richtig erkannt" },
    });
  }
  // Wischen per Finger/Maus
  (function () {
    const c = $("sCard"); let x0 = null, dx = 0;
    c.addEventListener("pointerdown", (e) => { if (!W || W.lock) return; x0 = e.clientX; dx = 0; c.setPointerCapture(e.pointerId); c.style.transition = "none"; });
    c.addEventListener("pointermove", (e) => { if (x0 === null) return; dx = e.clientX - x0; c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; setStamps(dx); });
    const up = () => { if (x0 === null) return; x0 = null;
      if (Math.abs(dx) > 90) wChoose(dx > 0);
      else { c.style.transition = "transform .2s"; c.style.transform = ""; setStamps(0); } };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  })();
  $("sYes").onclick = () => wChoose(true);
  $("sNo").onclick = () => wChoose(false);
  $("swipeBtn").onclick = startSwipe;
  $("sQuit").onclick = renderHome;
  document.addEventListener("keydown", (e) => { if ($("swipe").classList.contains("hidden")) return; if (e.key === "ArrowRight") wChoose(true); if (e.key === "ArrowLeft") wChoose(false); });

  // ---------- Modi ----------
  $("mixBtn").onclick = () => start(shuffle(allItems()).slice(0, 10), { title: "Gemischt" });
  $("examBtn").onclick = startExam;
  $("dueBtn").onclick = () => start(shuffle(allItems().filter(({ t, i }) => isDue(qkey(t, i)))).slice(0, 20), { title: "Wiederholen" });
  $("wrongBtn").onclick = () => start(shuffle(allItems().filter(({ t, i }) => wrongOpen(qkey(t, i)))), { title: "Fehler üben" });
  $("newBtn").onclick = () => { const nw = newest(); start(shuffle(nw.flatMap((t) => t.fragen.map((_, i) => ({ t, i })))), { title: "Neu", topic: nw.length === 1 ? nw[0] : null }); };

  // ---------- Erster Start ----------
  function onboarding() {
    const o = $("onb"); o.classList.remove("hidden"); let g = 10;
    [...$("onbGoal").children].forEach((b) => (b.onclick = () => { g = +b.dataset.v; [...$("onbGoal").children].forEach((x) => x.classList.toggle("on", x === b)); }));
    $("onbGo").onclick = () => { S.set.name = $("onbName").value.trim().slice(0, 20); S.set.goal = g; S.onb = true; save(); o.classList.add("hidden"); renderHome(); confetti(80); };
  }

  // ---------- Als App installieren (PWA) ----------
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { if (window.Capacitor) return; e.preventDefault(); deferred = e; $("installBtn").classList.remove("hidden"); });
  $("installBtn").onclick = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; $("installBtn").classList.add("hidden"); };
  // In der Store-App (Capacitor) sind alle Dateien schon in der App → kein Service Worker, kein „Installieren“-Knopf.
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (NATIVE) document.documentElement.classList.add("native");
  if (!NATIVE && "serviceWorker" in navigator && location.protocol.startsWith("http")) { navigator.serviceWorker.register("sw.js?v=" + META.version).catch(() => {}); }

  window.__dtwTest = { endBlitz: () => { if (B) B.end = 0; } };
  applySettings();
  renderHome();
  // Wer schon gelernt hat, bekommt keine Begrüßung mehr
  if (!S.onb && !Object.keys(S.q).length) { S.lastNewest = T.map((t) => t.datum || "").sort().pop() || ""; onboarding(); } else { if (!S.onb) { S.onb = true; save(); } checkNew(); }
})();
