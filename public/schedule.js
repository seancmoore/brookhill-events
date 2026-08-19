// Renders a schedule list for a Brook Hill Events category from window.BHA_SCHEDULE.
// Each session card shows its activity (title/emoji/desc) and opens a poster-style
// flyer on tap (deep-linkable via #f=<index>). Upcoming sessions get a live
// "going" count + a "Reserve a spot" button wired to window.BHAReserve.
// Past sessions render read-only.
(function () {
  function fmtTime(t) {
    return String(t || '').replace(/pm/i, ' PM').replace(/am/i, ' AM').trim();
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- flyer modal -------------------------------------------------------
  function ensureFlyer() {
    let m = document.getElementById('bha-flyer');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'bha-flyer';
    m.innerHTML =
      '<div class="fl-card">' +
        '<button class="fl-x" type="button" aria-label="Close">✕</button>' +
        '<div class="fl-emoji"></div>' +
        '<div class="fl-kicker">The Brook Hill Alliance</div>' +
        '<div class="fl-title"></div>' +
        '<div class="fl-when"></div>' +
        '<div class="fl-loc"></div>' +
        '<div class="fl-desc"></div>' +
        '<div class="fl-foot">Brook Hill Events · Summer 2026</div>' +
      '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) closeFlyer(); });
    m.querySelector('.fl-x').addEventListener('click', closeFlyer);
    document.body.appendChild(m);
    return m;
  }
  function closeFlyer() {
    const m = document.getElementById('bha-flyer');
    if (m) m.classList.remove('open');
    if (location.hash.indexOf('#f=') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  function openFlyer(s, opts) {
    const m = ensureFlyer();
    const dt = new Date(s.date + 'T00:00:00');
    const when = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const loc = (s.loc && s.loc.toLowerCase() !== 'n/a') ? s.loc : 'Location TBD';
    const card = m.querySelector('.fl-card');
    card.style.background =
      'linear-gradient(160deg,' + opts.accent + '2e 0%, #0d0d1c 46%, #0d0d1c 100%)';
    card.style.borderColor = opts.accent + '55';
    m.querySelector('.fl-emoji').textContent = s.emoji || '🎉';
    m.querySelector('.fl-kicker').textContent = 'The Brook Hill Alliance · ' + opts.label;
    m.querySelector('.fl-title').textContent = s.title || s.event || 'Session';
    m.querySelector('.fl-when').textContent = when + ' · ' + fmtTime(s.time);
    m.querySelector('.fl-loc').textContent = '📍 ' + loc;
    m.querySelector('.fl-desc').textContent = s.desc || '';
    m.classList.add('open');
    if (opts.index != null) {
      history.replaceState(null, '', location.pathname + location.search + '#f=' + opts.index);
    }
  }

  // accent may be a string (legacy) or { accent, category, label }.
  window.renderSchedule = function (containerId, items, accent, category) {
    let label = '';
    if (accent && typeof accent === 'object') {
      category = accent.category; label = accent.label || ''; accent = accent.accent;
    }
    if (!label) label = category === 'social' ? 'Social Rooms' : 'Recreation';
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="empty">No sessions scheduled yet — check back soon. 🗓️</div>';
      return;
    }
    const today = todayISO();
    const R = window.BHAReserve;
    el.innerHTML = '';
    items.forEach(function (s, i) {
      const dt = new Date(s.date + 'T00:00:00');
      const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
      const month = dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const day = String(dt.getDate());
      const isPast = s.date < today;
      const isToday = s.date === today;

      const a = document.createElement('div');
      a.className = 'slot' + (isPast ? ' past' : '');
      a.style.animationDelay = (Math.min(i, 12) * 0.04) + 's';

      let tag = '';
      if (isToday) tag = '<span class="tag today">● TODAY</span>';
      else if (isPast) tag = '<span class="tag done">Done</span>';

      const loc = (s.loc && s.loc.toLowerCase() !== 'n/a') ? s.loc : 'TBD';
      const title = s.title
        ? (s.emoji ? esc(s.emoji) + ' ' : '') + esc(s.title)
        : weekday;
      const meta = s.title
        ? '<span>' + weekday + '</span><span class="dot">·</span><span>' + fmtTime(s.time) + '</span><span class="dot">·</span><span>📍 ' + esc(loc) + '</span>'
        : '<span>' + fmtTime(s.time) + '</span><span class="dot">·</span><span>📍 ' + esc(loc) + '</span>';

      a.innerHTML =
        '<div class="slot-main">' +
          '<div class="badge" style="background:linear-gradient(150deg,' + accent + ' 0%, rgba(0,0,0,0.32) 140%);box-shadow:0 4px 18px ' + accent + '40;">' +
            '<div class="m">' + month + '</div><div class="d">' + day + '</div>' +
          '</div>' +
          '<div class="info">' +
            '<div class="wd">' + title + '</div>' +
            '<div class="meta">' + meta + '</div>' +
            (s.desc ? '<div class="desc">' + esc(s.desc) + '</div>' : '') +
            tag +
          '</div>' +
          '<div class="chev">›</div>' +
        '</div>';

      // Tap the card to open the flyer.
      const main = a.querySelector('.slot-main');
      main.style.cursor = 'pointer';
      main.addEventListener('click', function () {
        openFlyer(s, { accent: accent, label: label, index: i });
      });

      // Reservation controls on every listed session, so you can reserve (or
      // register a team) directly from the listing.
      if (R && category) {
        const sid = R.sessionId(category, s.date, s.time);
        const row = document.createElement('div');
        row.className = 'rsvp';
        if (s.teamSize && R.registerTeam) {
          // Team event: register a full team (captain + named players).
          a.setAttribute('data-team', sid);
          row.innerHTML =
            '<span class="rsvp-cnt">🏆 0 teams</span>' +
            '<button class="rsvp-btn" type="button">Register a team</button>';
          row.querySelector('.rsvp-btn').addEventListener('click', function () {
            R.registerTeam(
              { date: s.date, time: s.time, loc: s.loc, event: s.event, title: s.title },
              s.teamSize
            );
          });
        } else {
          a.setAttribute('data-rsvp', sid);
          row.innerHTML =
            '<span class="rsvp-cnt">👥 0 going</span>' +
            '<button class="rsvp-btn" type="button">Reserve a spot</button>';
          row.querySelector('.rsvp-btn').addEventListener('click', function () {
            R.toggle({ date: s.date, time: s.time, loc: s.loc, event: s.event });
          });
        }
        a.appendChild(row);
      }

      el.appendChild(a);
    });

    if (R && R._renderCounts) R._renderCounts();

    // Deep link: #f=<index> opens that session's flyer (shareable).
    const h = location.hash.match(/^#f=(\d+)$/);
    if (h) {
      const s = items[Number(h[1])];
      if (s) openFlyer(s, { accent: accent, label: label, index: Number(h[1]) });
    }
  };
})();
