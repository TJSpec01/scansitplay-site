/* Site-native version of the Scan Sit Play attract loop.
 *
 * Same data the venue TVs show (all public-read in Firestore: recent closed
 * games with a recap, Rounder Cup top 5, season leader), same visual language
 * (Oswald, gold on deep green, drifting suits), rendered on a 1920x1080 stage
 * that scales to the panel. The whole panel is a link to the app, so there is
 * no QR slide here — a QR aimed at a mouse is noise.
 *
 * Season/quarter math mirrors the platform's BLAPL config (season = year - 2017,
 * calendar quarters, device-local time). If that ever changes in the platform
 * repo (src/lib/league.ts), change it here too.
 */
(function () {
  var STAGE_W = 1920, STAGE_H = 1080;
  var SLIDE_MS = 9000;
  var APP_URL = 'https://app.scansitplay.com/';
  var LEAGUE = 'Brainerd Lakes Area Poker League';

  var firebaseConfig = {
    apiKey: 'AIzaSyAPFIYkTFfNNz_EyD-QfuF77Ia3q4ACoco',
    authDomain: 'app.blapoker.com',
    projectId: 'poker-dealer-check-in',
    appId: '1:377680613266:web:23f56287922ea98a057b4b'
  };

  var root = document.getElementById('attract');
  if (!root) return;
  var stage = root.querySelector('.stage');
  var slidesEl = root.querySelector('.slides');

  // ---- scale the fixed 1920x1080 stage to the panel -----------------------
  function fit() {
    var s = root.clientWidth / STAGE_W;
    stage.style.transform = 'scale(' + s.toFixed(4) + ')';
    root.style.height = Math.round(STAGE_H * s) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);

  // ---- ambient suits -------------------------------------------------------
  var glyphs = ['♠', '♥', '♦', '♣'];
  for (var i = 0; i < 10; i++) {
    var d = document.createElement('div');
    d.className = 'suit';
    d.textContent = glyphs[i % 4];
    d.style.left = ((i * 197) % STAGE_W) + 'px';
    d.style.top = ((i * 331) % STAGE_H) + 'px';
    d.style.fontSize = (90 + (i * 37) % 130) + 'px';
    d.style.color = (i % 4 === 1 || i % 4 === 2) ? 'rgba(200,60,70,.07)' : 'rgba(255,255,255,.055)';
    d.style.animation = 'iaDrift ' + (46 + (i * 13) % 40) + 's ease-in-out ' + (-((i * 17) % 60)) + 's infinite';
    stage.appendChild(d);
  }

  // ---- season math (mirror of the platform's BLAPL config) -----------------
  function seasonQuarter(date) {
    return { season: date.getFullYear() - 2017, quarter: Math.floor(date.getMonth() / 3) + 1 };
  }
  function fmtDate(iso) {
    if (!iso) return null;
    var p = iso.split('-').map(Number);
    if (!p[0] || !p[1] || !p[2]) return null;
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[p[1] - 1] + ' ' + p[2];
  }
  // Same guardrails as the venue TVs (Kevin, 2026-09-08): never surface PRIVATE
  // games (invite-only venues) or CASH games — those results are for the
  // people who were in the room, not for a public website.
  function isPublicResult(g) {
    if (!g || g.status !== 'closed' || !g.recap || !g.recap.champion) return false;
    if (g.isPrivate === true) return false;
    if (g.recap.isCash === true) return false;
    if (g.cashConfig && g.cashConfig.enabled === true) return false;
    return true;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- slides ---------------------------------------------------------------
  function brandSlide() {
    return '<div class="slide center">' +
      '<div class="league-line">' + esc(LEAGUE) + '</div>' +
      '<div class="headline">Game night,<br>run by the app.</div>' +
      '<div class="sub">Scan in · Get seated · Watch the clock · Climb the standings</div>' +
      '<div class="ssp">Scan · Sit · Play</div>' +
      '</div>';
  }
  function champsSlide(rows) {
    return '<div class="slide center pad">' +
      '<div class="gold">Recent Champions</div>' +
      '<div class="list">' + rows.map(function (r) {
        return '<div class="row"><span class="name"><span class="cup">🏆</span>' + esc(r.champion) + '</span>' +
          '<span class="meta">' + esc([r.venueName, fmtDate(r.dateISO)].filter(Boolean).join(' · ')) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="foot">Results post the moment the night ends</div>' +
      '</div>';
  }
  function ranksSlide(board, leader) {
    return '<div class="slide center pad">' +
      '<div class="gold" style="margin-bottom:10px">Rounder Cup — Top 5</div>' +
      '<div class="period">Season ' + board.season + ' · Quarter ' + board.quarter + (board.final ? ' · FINAL' : '') + '</div>' +
      '<div class="list narrow">' + board.rows.map(function (r, i) {
        return '<div class="row' + (i === 0 ? ' lead' : '') + '"><span class="name"><span class="pos">' + (i + 1) + '</span>' + esc(r.name) + '</span>' +
          '<span class="pts">' + r.points.toLocaleString() + ' pts</span></div>';
      }).join('') + '</div>' +
      (leader ? '<div class="leader">' + (leader.final ? 'Season ' + leader.season + ' Champion' : 'Season ' + leader.season + ' Overall Leader') + ': ' + esc(leader.name) + ' · ' + leader.points.toLocaleString() + ' pts</div>' : '') +
      '<div class="foot">Season points, tracked automatically</div>' +
      '</div>';
  }
  function joinSlide() {
    return '<div class="slide join">' +
      '<div class="big">Scan.<br>Sit.<br><span class="gold-text">Play.</span></div>' +
      '<div class="join-copy"><div class="join-h">Your league, on players’ phones and the venue’s TVs.</div>' +
      '<div class="join-s">Open the app →</div></div>' +
      '</div>';
  }

  var deck = [brandSlide(), joinSlide()];
  var idx = 0, timer = null;
  function render() {
    slidesEl.innerHTML = deck[idx % deck.length];
    var el = slidesEl.firstChild;
    requestAnimationFrame(function () { el.classList.add('in'); });
  }
  function start() {
    render();
    clearInterval(timer);
    timer = setInterval(function () { idx++; render(); }, SLIDE_MS);
  }
  start();

  // ---- live data (public-read collections) --------------------------------
  function loadLive() {
    if (!window.firebase || !firebase.firestore) return;
    try { firebase.initializeApp(firebaseConfig); } catch (e) { /* already initialised */ }
    var db = firebase.firestore();
    var sq = seasonQuarter(new Date());
    var champs = null, board = null, leader = null;

    var pChamps = db.collection('games').orderBy('createdAt', 'desc').limit(30).get().then(function (snap) {
      champs = snap.docs.map(function (d) { return d.data(); })
        .filter(function (g) { return isPublicResult(g); })
        .slice(0, 5)
        .map(function (g) { return { champion: g.recap.champion, venueName: g.recap.venueName || g.venueName || null, dateISO: g.recap.eventDateISO || null }; });
    }).catch(function () {});

    function top5(se, q) {
      return db.collection('rounderCupTotals').doc('season_' + se + '_Q' + q).collection('users')
        .orderBy('totalPoints', 'desc').limit(5).get().then(function (snap) {
          return snap.docs.map(function (d) {
            var x = d.data();
            return { name: [x.firstName, x.lastName].filter(Boolean).join(' ') || 'Player', points: x.totalPoints || 0 };
          }).filter(function (r) { return r.points > 0; });
        });
    }
    var pRanks = top5(sq.season, sq.quarter).then(function (cur) {
      if (cur.length >= 3) { board = { rows: cur, season: sq.season, quarter: sq.quarter, final: false }; return; }
      var pS = sq.quarter > 1 ? sq.season : sq.season - 1, pQ = sq.quarter > 1 ? sq.quarter - 1 : 4;
      return top5(pS, pQ).then(function (prev) {
        board = prev.length ? { rows: prev, season: pS, quarter: pQ, final: true } : (cur.length ? { rows: cur, season: sq.season, quarter: sq.quarter, final: false } : null);
      });
    }).catch(function () {});

    function leaderOf(se) {
      return db.collection('rounderCupSeasonTotals').doc('season_' + se).collection('users')
        .orderBy('totalPoints', 'desc').limit(1).get().then(function (snap) {
          var d = snap.docs[0]; if (!d) return null;
          var x = d.data(); var row = { name: [x.firstName, x.lastName].filter(Boolean).join(' ') || 'Player', points: x.totalPoints || 0 };
          return row.points > 0 ? row : null;
        });
    }
    var pLeader = leaderOf(sq.season).then(function (cur) {
      if (cur) { leader = { name: cur.name, points: cur.points, season: sq.season, final: false }; return; }
      return leaderOf(sq.season - 1).then(function (prev) { leader = prev ? { name: prev.name, points: prev.points, season: sq.season - 1, final: true } : null; });
    }).catch(function () {});

    Promise.all([pChamps, pRanks, pLeader]).then(function () {
      var d = [brandSlide()];
      if (champs && champs.length) d.push(champsSlide(champs));
      if (board && board.rows.length) d.push(ranksSlide(board, leader));
      d.push(joinSlide());
      deck = d;
    });
  }
  loadLive();
  setInterval(loadLive, 60 * 60 * 1000);

  root.addEventListener('click', function () { window.location.href = APP_URL; });
})();
