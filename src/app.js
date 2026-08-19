// Brook Hill Events — front-end entry, bundled to public/app.bundle.js by esbuild.
//
// Replaces the compat Firebase <script> tags + firebase-config.js + reserve.js
// with one tree-shaken modular bundle. Exposes the SAME window.BHAReserve API the
// pages already use (schedule.js, recreation/social inline scripts are unchanged),
// plus encapsulated helpers so my-reservations / staff no longer reach into a raw
// Firestore handle:
//     BHAReserve.watchByStudent(studentId, cb, errcb)
//     BHAReserve.watchGoing(cb, errcb)
//     BHAReserve.auth.{ signIn(username, password), onChange(cb), signOut() }
//
// Talks to the shared brookhill-disco-2026 project (same data + verifyStudent
// function as the disco app). Config values are not secrets — access is enforced
// by Firestore rules + the Cloud Function, not by hiding them.
import { initializeApp } from "firebase/app";
import {
  getFirestore, collectionGroup, doc, setDoc, query, where, onSnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "firebase/auth";

const CONFIG = {
  apiKey: "AIzaSyCTWE_4rCLlh-XP-qdU8s6xYsgwVdUML9M",
  authDomain: "brookhill-disco-2026.firebaseapp.com",
  projectId: "brookhill-disco-2026",
  storageBucket: "brookhill-disco-2026.firebasestorage.app",
  messagingSenderId: "444068891605",
  appId: "1:444068891605:web:f470673d6db14c27410b5c",
};

const app = initializeApp(CONFIG);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1"); // verifyStudent lives here
const auth = getAuth(app);

// Every group across the summer's sessions (arrivals roughly every 2 weeks).
const GROUPS = [
  "1C-NIA", "1G",
  "3D", "3G",
  "NYTOR1",
  "5B", "5C", "5D", "5G",
  "6C", "6G",
  "TORNY2",
  "7B", "7C", "7G",
];
const USER_DOMAIN = "@brookhill-staff.local"; // staff username -> internal email

// ── remembered check-in (shared key with the disco app) ──
function remembered() {
  try { return JSON.parse(localStorage.getItem("bha_checked_in_student") || "null"); }
  catch (e) { return null; }
}
function remember(stu) {
  try { localStorage.setItem("bha_checked_in_student", JSON.stringify(stu)); } catch (e) {}
}

const BHA = {
  category: "",
  _counts: {},
  _mine: {},
  _teamCounts: {},
  _teamMine: {},
  _verifying: false,
  _pending: null,
  _teamPending: null, // { session, size, sid }
  _mode: "reserve",
  _onId: null,
};

// stable per-session id (must match the one schedule.js renders)
BHA.sessionId = (category, date, time) =>
  category + "_" + date + "_" + String(time || "").toLowerCase().replace(/[^a-z0-9]/g, "");

BHA.current = () => remembered();

// Kept for API compatibility — the bundle is always connected.
BHA.initDb = () => true;

// init(category): live counts for a schedule page.
BHA.init = function (category) {
  BHA.category = category;
  BHA._subscribe();
};

// One category-scoped listener feeds every session's count on this page
// (filtered server-side via the rsvps.category collection-group index).
BHA._subscribe = function () {
  const mySid = (remembered() || {}).studentId || null;
  const q = query(collectionGroup(db, "rsvps"), where("category", "==", BHA.category));
  onSnapshot(q, (snap) => {
    const counts = {}, mine = {};
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (!d.sessionId) return;
      if (d.status === "going") {
        counts[d.sessionId] = (counts[d.sessionId] || 0) + 1;
        if (mySid && docSnap.id === mySid) mine[d.sessionId] = true;
      }
    });
    BHA._counts = counts;
    BHA._mine = mine;
    BHA._renderCounts();
  }, (err) => console.warn("rsvp snapshot:", err));

  // Registered teams for team events (3v3, flag football, ...).
  const tq = query(collectionGroup(db, "teams"), where("category", "==", BHA.category));
  onSnapshot(tq, (snap) => {
    const counts = {}, mine = {};
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (!d.sessionId || d.status !== "registered") return;
      counts[d.sessionId] = (counts[d.sessionId] || 0) + 1;
      if (mySid && docSnap.id === mySid) mine[d.sessionId] = d.teamName || true;
    });
    BHA._teamCounts = counts;
    BHA._teamMine = mine;
    BHA._renderCounts();
  }, (err) => console.warn("teams snapshot:", err));
};

BHA._renderCounts = function () {
  document.querySelectorAll("[data-rsvp]").forEach((slot) => {
    const sid = slot.getAttribute("data-rsvp");
    const n = BHA._counts[sid] || 0;
    const mine = !!BHA._mine[sid];
    const cnt = slot.querySelector(".rsvp-cnt");
    const btn = slot.querySelector(".rsvp-btn");
    if (cnt) cnt.textContent = "👥 " + n + " going";
    if (btn) {
      btn.classList.toggle("in", mine);
      btn.textContent = mine ? "✓ You're in" : "Reserve a spot";
    }
  });
  document.querySelectorAll("[data-team]").forEach((slot) => {
    const sid = slot.getAttribute("data-team");
    const n = BHA._teamCounts[sid] || 0;
    const mine = BHA._teamMine[sid];
    const cnt = slot.querySelector(".rsvp-cnt");
    const btn = slot.querySelector(".rsvp-btn");
    if (cnt) cnt.textContent = "🏆 " + n + (n === 1 ? " team" : " teams");
    if (btn) {
      btn.classList.toggle("in", !!mine);
      btn.textContent = mine
        ? "✓ " + (typeof mine === "string" ? mine : "Team") + " registered"
        : "Register a team";
    }
  });
};

// ── encapsulated reads (replace raw _db usage on the pages) ──
// Each calls back with a plain array of rsvp data; the page filters/renders.
BHA.watchByStudent = (studentId, cb, errcb) =>
  onSnapshot(
    query(collectionGroup(db, "rsvps"), where("studentId", "==", studentId)),
    (snap) => { const rows = []; snap.forEach((d) => rows.push(d.data() || {})); cb(rows); },
    errcb || (() => {})
  );

BHA.watchGoing = (cb, errcb) =>
  onSnapshot(
    query(collectionGroup(db, "rsvps"), where("status", "==", "going")),
    (snap) => { const rows = []; snap.forEach((d) => rows.push(d.data() || {})); cb(rows); },
    errcb || (() => {})
  );

// ── staff auth (single email/password account, username -> internal email) ──
BHA.auth = {
  signIn: (username, password) =>
    signInWithEmailAndPassword(auth, String(username).trim().toLowerCase() + USER_DOMAIN, password),
  onChange: (cb) => onAuthStateChanged(auth, cb),
  signOut: () => signOut(auth),
};

// ── low-level write ──
BHA._write = (sid, category, meta, stu, status) =>
  setDoc(doc(db, "sessions", sid, "rsvps", stu.studentId), {
    status,
    name: stu.name,
    group: stu.group || "",
    studentId: stu.studentId,
    sessionId: sid,
    category,
    date: meta.date,
    time: meta.time || "",
    loc: meta.loc || "",
    at: new Date().toISOString(),
  });

// ── reserve / cancel ──
BHA.toggle = function (session) {
  const sid = BHA.sessionId(BHA.category, session.date, session.time);
  const stu = remembered();
  if (stu && stu.studentId) {
    const goin = BHA._mine[sid];
    BHA._write(sid, BHA.category, session, stu, goin ? "declined" : "going")
      .then(() => toast(goin ? "Reservation cancelled" : "You're in! 🎉"))
      .catch(() => toast("Something went wrong — try again", true));
    return;
  }
  BHA._openModal(session, "reserve");
};

BHA.cancel = function (r) {
  const stu = remembered();
  if (!stu || !stu.studentId) return Promise.reject(new Error("no-id"));
  return BHA._write(r.sessionId, r.category, { date: r.date, time: r.time, loc: r.loc }, stu, "declined");
};

// ── team registration (3v3 basketball, 7v7 flag football, ...) ──
// The captain checks in against the roster (same flow as a solo RSVP), then
// names the team and lists every player. One team per captain per session.
BHA.registerTeam = function (session, size) {
  const sid = BHA.sessionId(BHA.category, session.date, session.time);
  const go = (stu) => {
    if (BHA._teamMine[sid]) {
      // Already registered — tapping again withdraws the whole team.
      const tn = typeof BHA._teamMine[sid] === "string" ? BHA._teamMine[sid] : "your team";
      if (!window.confirm("Withdraw " + tn + " from this event?")) return;
      BHA._writeTeam(sid, session, stu, { status: "withdrawn" })
        .then(() => toast("Team withdrawn"))
        .catch(() => toast("Something went wrong — try again", true));
      return;
    }
    BHA._openTeamModal(session, size, sid, stu);
  };
  const stu = remembered();
  if (stu && stu.studentId) go(stu);
  else BHA.identify(go);
};

BHA._writeTeam = (sid, session, stu, extra) =>
  setDoc(doc(db, "sessions", sid, "teams", stu.studentId), Object.assign({
    name: stu.name,
    group: stu.group || "",
    studentId: stu.studentId,
    sessionId: sid,
    category: BHA.category,
    date: session.date,
    time: session.time || "",
    loc: session.loc || "",
    at: new Date().toISOString(),
  }, extra), { merge: true });

BHA._openTeamModal = function (session, size, sid, stu) {
  BHA._teamPending = { session, size, sid, stu };
  const m = document.getElementById("bha-team");
  const dt = new Date(session.date + "T00:00:00");
  m.querySelector("#bt-title").textContent = session.title || "Register a team";
  m.querySelector("#bt-when").textContent =
    dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) +
    " · " + (session.time || "");
  m.querySelector("#bt-note").textContent =
    "Name your team and list all " + size + " players. " +
    stu.name + ", you're checked in as the captain.";
  let rows = '<label class="bm-lab">Team name</label>' +
    '<input id="bt-name" class="bm-in" type="text" maxlength="40" placeholder="e.g. The Ballers">';
  for (let i = 0; i < size; i++) {
    rows += '<label class="bm-lab">Player ' + (i + 1) + (i === 0 ? ' <span class="bm-opt">(captain)</span>' : "") + "</label>" +
      '<input class="bm-in bt-player" type="text" maxlength="60" placeholder="First and last name"' +
      (i === 0 ? ' value="' + String(stu.name).replace(/"/g, "&quot;") + '" readonly' : "") + ">";
  }
  m.querySelector("#bt-rows").innerHTML = rows;
  BHA._setTeamErr("");
  m.classList.add("open");
  setTimeout(() => { m.querySelector("#bt-name").focus(); }, 60);
};

BHA._closeTeamModal = function () {
  const m = document.getElementById("bha-team");
  if (m) m.classList.remove("open");
  BHA._teamPending = null;
};

BHA._setTeamErr = function (msg) {
  const e = document.getElementById("bt-err");
  if (e) { e.textContent = msg || ""; e.style.display = msg ? "block" : "none"; }
};

BHA._submitTeam = function () {
  const p = BHA._teamPending;
  if (!p) return;
  const m = document.getElementById("bha-team");
  const teamName = m.querySelector("#bt-name").value.trim();
  const players = Array.from(m.querySelectorAll(".bt-player")).map((i) => i.value.trim());
  if (!teamName) { BHA._setTeamErr("Give your team a name"); return; }
  if (players.some((n) => !n)) { BHA._setTeamErr("List all " + p.size + " players"); return; }
  BHA._writeTeam(p.sid, p.session, p.stu, {
    status: "registered",
    teamName,
    players,
    size: p.size,
  })
    .then(() => { BHA._closeTeamModal(); toast(teamName + " is in! 🏆"); })
    .catch(() => BHA._setTeamErr("Something went wrong — check your connection and try again."));
};

BHA.identify = function (onDone) {
  const stu = remembered();
  if (stu && stu.studentId) { if (onDone) onDone(stu); return; }
  BHA._onId = onDone || null;
  BHA._openModal(null, "identify");
};

// ── check-in modal ──
BHA._openModal = function (session, mode) {
  BHA._pending = session;
  BHA._mode = mode || "reserve";
  const m = document.getElementById("bha-modal");
  m.querySelector("#bm-first").value = "";
  m.querySelector("#bm-dob").value = "";
  m.querySelector("#bm-group").value = "";
  BHA._setErr("");
  const title = m.querySelector(".bm-title");
  const when = m.querySelector("#bm-when");
  const note = m.querySelector(".bm-note");
  const go = m.querySelector("#bm-go");
  if (BHA._mode === "identify") {
    title.textContent = "Check in";
    when.textContent = "";
    note.textContent = "Check in against the camp roster to see your reservations.";
    go.textContent = "Check in";
  } else {
    title.textContent = "Reserve a spot";
    const dt = new Date(session.date + "T00:00:00");
    when.textContent = dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) +
      " · " + (session.time || "");
    note.textContent = "Check in against the camp roster so we know who’s coming.";
    go.textContent = "Reserve my spot";
  }
  m.classList.add("open");
  setTimeout(() => { m.querySelector("#bm-first").focus(); }, 60);
};

BHA._closeModal = function () {
  const m = document.getElementById("bha-modal");
  if (m) m.classList.remove("open");
  BHA._pending = null;
};

BHA._setErr = function (msg) {
  const e = document.getElementById("bm-err");
  if (e) { e.textContent = msg || ""; e.style.display = msg ? "block" : "none"; }
};

BHA._submit = function () {
  if (BHA._verifying) return;
  if (BHA._mode === "reserve" && !BHA._pending) return;
  const m = document.getElementById("bha-modal");
  const first = m.querySelector("#bm-first").value.trim();
  const dob = m.querySelector("#bm-dob").value;
  const group = m.querySelector("#bm-group").value;
  if (!first) { BHA._setErr("Enter your first name"); return; }
  if (!dob) { BHA._setErr("Pick your date of birth"); return; }
  BHA._verifying = true;
  BHA._setErr("Checking the roster…");
  httpsCallable(functions, "verifyStudent")({ first, dob, group })
    .then((res) => {
      const data = (res && res.data) || {};
      BHA._verifying = false;
      if (!data.match) {
        BHA._setErr("We couldn't find you on the roster. Double-check your name, group and date of birth — or see a chaperone.");
        return;
      }
      const stu = { name: data.firstName || first, studentId: data.studentId, group: data.group || group || "" };
      remember(stu);
      if (BHA._mode === "identify") {
        const cb = BHA._onId; BHA._onId = null;
        BHA._closeModal();
        if (cb) cb(stu);
        return;
      }
      const session = BHA._pending;
      BHA._closeModal();
      BHA._write(BHA.sessionId(BHA.category, session.date, session.time), BHA.category, session, stu, "going")
        .then(() => toast("You're in! 🎉"))
        .catch(() => toast("Saved your check-in, but reserving failed — try again", true));
    })
    .catch((e) => {
      console.warn("verifyStudent:", e);
      BHA._verifying = false;
      BHA._setErr("Check-in failed — check your connection and try again.");
    });
};

// ── tiny toast ──
function toast(msg, isErr) {
  let t = document.getElementById("bha-toast");
  if (!t) { t = document.createElement("div"); t.id = "bha-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = "show" + (isErr ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ""; }, 2600);
}
BHA.toast = toast;

// ── inject modal markup once ──
function injectModal() {
  if (document.getElementById("bha-modal")) return;
  const opts = GROUPS.map((g) => '<option value="' + g + '">' + g + "</option>").join("");
  const div = document.createElement("div");
  div.id = "bha-modal";
  div.innerHTML =
    '<div class="bm-card">' +
      '<div class="bm-title">Reserve a spot</div>' +
      '<div class="bm-when" id="bm-when"></div>' +
      '<p class="bm-note">Check in against the camp roster so we know who’s coming.</p>' +
      '<label class="bm-lab">First name</label>' +
      '<input id="bm-first" class="bm-in" type="text" autocomplete="given-name" placeholder="Your first name">' +
      '<label class="bm-lab">Date of birth</label>' +
      '<input id="bm-dob" class="bm-in" type="date">' +
      '<label class="bm-lab">Group <span class="bm-opt">(optional)</span></label>' +
      '<select id="bm-group" class="bm-in"><option value="">Select your group…</option>' + opts + "</select>" +
      '<div id="bm-err" class="bm-err"></div>' +
      '<button id="bm-go" class="bm-go">Reserve my spot</button>' +
      '<button id="bm-cancel" class="bm-cancel">Cancel</button>' +
    "</div>";
  document.body.appendChild(div);
  div.addEventListener("click", (e) => { if (e.target === div) BHA._closeModal(); });
  document.getElementById("bm-go").addEventListener("click", BHA._submit);
  document.getElementById("bm-cancel").addEventListener("click", BHA._closeModal);
  document.getElementById("bm-dob").addEventListener("keydown", (e) => { if (e.key === "Enter") BHA._submit(); });
}

// ── inject team-registration modal once ──
function injectTeamModal() {
  if (document.getElementById("bha-team")) return;
  const div = document.createElement("div");
  div.id = "bha-team";
  div.innerHTML =
    '<div class="bm-card">' +
      '<div class="bm-title" id="bt-title">Register a team</div>' +
      '<div class="bm-when" id="bt-when"></div>' +
      '<p class="bm-note" id="bt-note"></p>' +
      '<div id="bt-rows"></div>' +
      '<div id="bt-err" class="bm-err"></div>' +
      '<button id="bt-go" class="bm-go">Register team</button>' +
      '<button id="bt-cancel" class="bm-cancel">Cancel</button>' +
    "</div>";
  document.body.appendChild(div);
  div.addEventListener("click", (e) => { if (e.target === div) BHA._closeTeamModal(); });
  document.getElementById("bt-go").addEventListener("click", BHA._submitTeam);
  document.getElementById("bt-cancel").addEventListener("click", BHA._closeTeamModal);
}

window.BHAReserve = BHA;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { injectModal(); injectTeamModal(); });
} else { injectModal(); injectTeamModal(); }
