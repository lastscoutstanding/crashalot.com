/* app.js — Range Card
 *
 * Owns the interface: reads the form, calls the engine in ballistics.js, and
 * renders the readouts, chart and table. Profiles live in localStorage under
 * keys prefixed rc. so they never collide with anything else on the domain.
 */
(function () {
  'use strict';

  var B = window.Ballistics;
  var u = B.units;
  var KEY = 'rc.state';
  var STATE_VERSION = 1;

  var FIELDS = [
    'pellet', 'v0', 'mass', 'bc', 'drag', 'scopeH', 'zero', 'clickVal', 'clickUnit',
    'temp', 'press', 'hum', 'slope', 'wind', 'windDir',
    'maxRange', 'stepRange', 'zone'
  ];

  var el = {};
  ['profile', 'profileName', 'newProfile', 'deleteProfile', 'readouts', 'chart',
   'rows', 'thHold', 'pelletNote', 'fitV0', 'fitV1', 'fitD', 'fitRun', 'fitOut',
   'exportBtn', 'importBtn', 'importFile', 'dataOut'].concat(FIELDS)
    .forEach(function (id) { el[id] = document.getElementById(id); });

  function defaults() {
    return {
      pellet: '', v0: 250, mass: 8.44, bc: 0.024, drag: 'g1', scopeH: 50, zero: 30,
      clickVal: 0.1, clickUnit: 'mil',
      temp: 15, press: 1013, hum: 50, slope: 0, wind: 0, windDir: 90,
      maxRange: 60, stepRange: 5, zone: 25
    };
  }

  var state = { version: STATE_VERSION, activeId: null, profiles: [] };

  /* ---------- pellet library ---------- */

  var pellets = [];
  var DEFAULT_NOTE = 'Velocity in m/s, weight in grain, scope height in mm, ranges in m.';

  // pellets.txt is pipe separated:
  // calibre|brand|model|head|weight|bc|quality|note
  function parsePellets(text) {
    return text.split(/\r?\n/).reduce(function (out, line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return out;
      var f = line.split('|');
      if (f.length < 7) return out;
      var weight = parseFloat(f[4]);
      if (!(weight > 0)) return out;
      var bc = parseFloat(f[5]);
      out.push({
        key: f[0] + '|' + f[1] + '|' + f[2] + '|' + f[3],
        caliber: f[0], brand: f[1], model: f[2], head: f[3],
        weight: weight,
        bc: isFinite(bc) && bc > 0 ? bc : null,
        quality: f[6] || 'none',
        note: (f[7] || '').trim()
      });
      return out;
    }, []);
  }

  function fillPelletSelect() {
    var groups = [];
    pellets.forEach(function (p) {
      var g = groups.filter(function (x) { return x.caliber === p.caliber; })[0];
      if (!g) { g = { caliber: p.caliber, items: [] }; groups.push(g); }
      g.items.push(p);
    });

    var html = '<option value="">Custom / not listed</option>';
    groups.forEach(function (g) {
      html += '<optgroup label="' + escapeHtml(g.caliber) + '">';
      g.items.forEach(function (p) {
        html += '<option value="' + escapeHtml(p.key) + '">' +
                escapeHtml(p.brand + ' ' + p.model + ' — ' + p.weight + ' gr' +
                           (p.head ? ' / ' + p.head : '')) + '</option>';
      });
      html += '</optgroup>';
    });
    el.pellet.innerHTML = html;
  }

  function pelletByKey(key) {
    return pellets.filter(function (p) { return p.key === key; })[0] || null;
  }

  // Applying a pellet always sets the weight. It only sets the BC when the
  // library has a defensible one, so a 'none' entry never overwrites a BC the
  // user fitted themselves.
  function applyPellet(key) {
    var p = pelletByKey(key);
    if (!p) { el.pelletNote.textContent = DEFAULT_NOTE; return; }
    el.mass.value = p.weight;
    var msg;
    if (p.bc && p.quality === 'meas') {
      el.bc.value = p.bc;
      msg = 'BC ' + p.bc.toFixed(4) + ', measured figure.';
    } else if (p.bc) {
      el.bc.value = p.bc;
      msg = 'BC ' + p.bc.toFixed(4) + ', estimated by scaling. Fit your own.';
    } else {
      msg = 'No usable BC on file. Weight set, BC left alone.';
    }
    el.pelletNote.textContent = msg + (p.note ? ' ' + p.note.charAt(0).toUpperCase() + p.note.slice(1) + '.' : '');
  }

  function loadPellets() {
    if (typeof fetch !== 'function') return;
    fetch('pellets.txt', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) {
        pellets = parsePellets(text);
        if (!pellets.length) throw new Error('empty');
        fillPelletSelect();
        var saved = active().values.pellet;
        if (saved && pelletByKey(saved)) {
          el.pellet.value = saved;
          el.pelletNote.textContent = (pelletByKey(saved).note || DEFAULT_NOTE);
        }
      })
      .catch(function () {
        el.pelletNote.textContent = 'Pellet library unavailable, enter weight and BC by hand.';
      });
  }

  /* ---------- persistence ---------- */

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) {
          state = parsed;
          state.version = STATE_VERSION;
          return;
        }
      } catch (e) {}
    }
    state.profiles = [{ id: newId(), name: 'Default setup', values: defaults() }];
    state.activeId = state.profiles[0].id;
  }

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function active() {
    var found = state.profiles.filter(function (p) { return p.id === state.activeId; })[0];
    return found || state.profiles[0];
  }

  /* ---------- form <-> state ---------- */

  function formToValues() {
    var v = {};
    FIELDS.forEach(function (id) {
      var node = el[id];
      if (node.tagName === 'SELECT') v[id] = node.value;
      else {
        var n = parseFloat(node.value);
        v[id] = isFinite(n) ? n : defaults()[id];
      }
    });
    return v;
  }

  function valuesToForm(values) {
    var d = defaults();
    FIELDS.forEach(function (id) {
      var val = values[id] == null ? d[id] : values[id];
      el[id].value = val;
    });
  }

  function renderProfileList() {
    el.profile.innerHTML = state.profiles.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === state.activeId ? ' selected' : '') +
             '>' + escapeHtml(p.name || 'Unnamed setup') + '</option>';
    }).join('');
    el.profileName.value = active().name || '';
    el.deleteProfile.disabled = state.profiles.length < 2;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- computation ---------- */

  function compute() {
    var v = formToValues();

    var atm = B.atmosphere({
      tempC: v.temp,
      pressurePa: u.hpaToPa(v.press),
      humidity: Math.min(1, Math.max(0, v.hum / 100))
    });

    var step = v.stepRange > 0 ? v.stepRange : 5;
    var max = Math.max(step, v.maxRange);
    var distances = [];
    for (var d = 0; d <= max + 0.001; d += step) distances.push(Math.round(d * 10) / 10);

    var result = B.trajectory({
      muzzleVelocity: v.v0,
      mass: u.grainToKg(v.mass),
      bc: v.bc > 0 ? v.bc : 0.001,
      dragModel: v.drag,
      scopeHeight: u.mmToM(v.scopeH),
      zeroRange: v.zero > 0 ? v.zero : 1,
      slopeDeg: v.slope,
      windSpeed: v.wind,
      windFromDeg: v.windDir,
      atmosphere: atm,
      maxRange: max + step,
      distances: distances
    });

    return { values: v, atm: atm, result: result };
  }

  // Longest stretch where the pellet stays inside the target circle.
  function pointBlank(points, zoneMm) {
    var r = (zoneMm / 1000) / 2;
    var start = null, best = null;
    for (var i = 0; i < points.length; i++) {
      var inside = Math.abs(points[i][2]) <= r;
      if (inside && start === null) start = points[i][1];
      if ((!inside || i === points.length - 1) && start !== null) {
        var end = points[i][1];
        if (!best || end - start > best[1] - best[0]) best = [start, end];
        start = null;
      }
    }
    return best;
  }

  /* ---------- rendering ---------- */

  function fmt(n, digits) {
    return n.toFixed(digits == null ? 1 : digits);
  }

  function renderReadouts(c) {
    var r = c.result;
    var v = c.values;
    var muzzleEnergy = 0.5 * u.grainToKg(v.mass) * v.v0 * v.v0;
    var pbr = pointBlank(r.points, v.zone);
    var last = r.rows[r.rows.length - 1];

    var items = [
      ['Near zero', r.nearZero == null ? '—' : fmt(r.nearZero) + '<small> m</small>'],
      ['Far zero', r.farZero == null || r.zeros.length < 2 ? '—' : fmt(r.farZero) + '<small> m</small>'],
      ['Apex', fmt(r.maxOrdinate * 100) + '<small> cm</small>'],
      ['Point blank', pbr ? fmt(pbr[0], 0) + '–' + fmt(pbr[1], 0) + '<small> m</small>' : '—'],
      ['Muzzle energy', fmt(muzzleEnergy) + '<small> J</small>'],
      ['Energy at ' + fmt(last.distance, 0) + ' m', fmt(last.energy) + '<small> J</small>']
    ];

    el.readouts.innerHTML = items.map(function (it) {
      return '<div class="readout"><span>' + it[0] + '</span><strong>' + it[1] + '</strong></div>';
    }).join('');
  }

  function renderTable(c) {
    var v = c.values;
    var rows = c.result.rows;
    var zeros = c.result.zeros;
    var unit = v.clickUnit;
    el.thHold.textContent = 'Hold ' + (unit === 'moa' ? 'MOA' : 'MIL');

    el.rows.innerHTML = rows.map(function (r) {
      var hold = unit === 'moa' ? r.holdMoa : r.holdMil;
      var wind = unit === 'moa' ? r.windMoa : r.windMil;
      var clicks = v.clickVal > 0 ? u.clicks(r.holdRad, v.clickVal, unit) : 0;
      var isZero = zeros.some(function (z) { return Math.abs(z - r.distance) < v.stepRange / 2; });
      return '<tr' + (isZero ? ' class="is-zero"' : '') + '>' +
        '<td>' + fmt(r.distance, 0) + ' m</td>' +
        '<td class="n">' + fmt(r.velocity) + '</td>' +
        '<td class="n">' + fmt(r.energy) + '</td>' +
        '<td class="n">' + fmt(r.dropCm) + '</td>' +
        '<td class="n">' + fmt(hold, 2) + '</td>' +
        '<td class="n">' + fmt(clicks, 1) + '</td>' +
        '<td class="n">' + fmt(r.driftCm) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderChart(c) {
    var pts = c.result.points;
    var v = c.values;
    var W = 640, H = 240, padL = 44, padR = 12, padT = 16, padB = 26;
    var maxX = v.maxRange;

    var lo = 0, hi = 0;
    pts.forEach(function (p) {
      if (p[1] > maxX) return;
      if (p[2] < lo) lo = p[2];
      if (p[2] > hi) hi = p[2];
    });
    var span = Math.max(0.04, (hi - lo) * 1.25);
    var mid = (hi + lo) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;

    function sx(x) { return padL + (x / maxX) * (W - padL - padR); }
    function sy(y) { return padT + (1 - (y - lo) / (hi - lo)) * (H - padT - padB); }

    var parts = ['<title id="chartTitle">Trajectory relative to the line of sight</title>'];

    var gridStep = maxX <= 30 ? 5 : maxX <= 70 ? 10 : 20;
    for (var gx = 0; gx <= maxX + 0.001; gx += gridStep) {
      parts.push('<line x1="' + fmt(sx(gx)) + '" y1="' + padT + '" x2="' + fmt(sx(gx)) +
                 '" y2="' + (H - padB) + '" stroke="var(--line)" stroke-width="1"/>');
      parts.push('<text x="' + fmt(sx(gx)) + '" y="' + (H - 8) + '" fill="var(--text-faint)" ' +
                 'font-size="11" font-family="var(--font-num)" text-anchor="middle">' + gx + '</text>');
    }

    var cmStep = span * 100 > 30 ? 10 : span * 100 > 12 ? 5 : 2;
    for (var cm = Math.ceil(lo * 100 / cmStep) * cmStep; cm <= hi * 100; cm += cmStep) {
      var y = sy(cm / 100);
      parts.push('<text x="' + (padL - 8) + '" y="' + fmt(y + 4) + '" fill="var(--text-faint)" ' +
                 'font-size="11" font-family="var(--font-num)" text-anchor="end">' + cm + '</text>');
    }

    // line of sight
    parts.push('<line x1="' + padL + '" y1="' + fmt(sy(0)) + '" x2="' + (W - padR) + '" y2="' +
               fmt(sy(0)) + '" stroke="var(--text-faint)" stroke-width="1" stroke-dasharray="4 4"/>');

    // target zone band
    var r = (v.zone / 1000) / 2;
    parts.push('<rect x="' + padL + '" y="' + fmt(sy(r)) + '" width="' + (W - padL - padR) +
               '" height="' + fmt(Math.abs(sy(-r) - sy(r))) + '" fill="var(--panel-raised)" opacity="0.85"/>');

    // trajectory
    var dpath = '';
    for (var i = 0; i < pts.length; i += 8) {
      if (pts[i][1] > maxX) break;
      dpath += (dpath ? 'L' : 'M') + fmt(sx(pts[i][1])) + ' ' + fmt(sy(pts[i][2]));
    }
    parts.push('<path d="' + dpath + '" fill="none" stroke="var(--accent)" stroke-width="2" ' +
               'stroke-linejoin="round"/>');

    // zero markers
    c.result.zeros.forEach(function (z) {
      if (z > maxX) return;
      parts.push('<circle cx="' + fmt(sx(z)) + '" cy="' + fmt(sy(0)) + '" r="3.5" ' +
                 'fill="var(--bg)" stroke="var(--accent)" stroke-width="2"/>');
    });

    parts.push('<text x="' + padL + '" y="' + (H - 8) + '" fill="var(--text-faint)" font-size="11" ' +
               'font-family="var(--font-num)" text-anchor="middle">0</text>');

    el.chart.innerHTML = parts.join('');
  }

  /* ---------- wiring ---------- */

  var pending = null;
  function refresh() {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(function () {
      pending = null;
      var c = compute();
      renderReadouts(c);
      renderChart(c);
      renderTable(c);
      active().values = c.values;
      save();
    });
  }

  FIELDS.forEach(function (id) {
    el[id].addEventListener('input', refresh);
    el[id].addEventListener('change', refresh);
  });

  el.pellet.addEventListener('change', function () {
    applyPellet(el.pellet.value);
    refresh();
  });

  // Typing a weight or BC by hand means you are no longer on a library pellet.
  ['mass', 'bc'].forEach(function (id) {
    el[id].addEventListener('input', function () {
      if (el.pellet.value) {
        el.pellet.value = '';
        el.pelletNote.textContent = DEFAULT_NOTE;
      }
    });
  });

  el.profile.addEventListener('change', function () {
    state.activeId = el.profile.value;
    valuesToForm(active().values);
    el.pelletNote.textContent = DEFAULT_NOTE;
    el.profileName.value = active().name || '';
    save();
    refresh();
  });

  el.profileName.addEventListener('input', function () {
    active().name = el.profileName.value;
    var opt = el.profile.querySelector('option[value="' + active().id + '"]');
    if (opt) opt.textContent = el.profileName.value || 'Unnamed setup';
    save();
  });

  el.newProfile.addEventListener('click', function () {
    var copy = JSON.parse(JSON.stringify(formToValues()));
    var p = { id: newId(), name: 'New setup', values: copy };
    state.profiles.push(p);
    state.activeId = p.id;
    renderProfileList();
    el.profileName.focus();
    el.profileName.select();
    save();
    refresh();
  });

  el.deleteProfile.addEventListener('click', function () {
    if (state.profiles.length < 2) return;
    state.profiles = state.profiles.filter(function (p) { return p.id !== state.activeId; });
    state.activeId = state.profiles[0].id;
    renderProfileList();
    valuesToForm(active().values);
    save();
    refresh();
  });

  el.fitRun.addEventListener('click', function () {
    var v0 = parseFloat(el.fitV0.value);
    var v1 = parseFloat(el.fitV1.value);
    var d = parseFloat(el.fitD.value);
    if (!(v0 > 0) || !(v1 > 0) || !(d > 0)) {
      el.fitOut.textContent = 'Enter all three values first.';
      return;
    }
    if (v1 >= v0) {
      el.fitOut.textContent = 'The downrange reading has to be lower than the muzzle reading.';
      return;
    }
    var c = compute();
    var bc = B.solveBC({ v0: v0, v1: v1, distance: d, dragModel: c.values.drag, atmosphere: c.atm });
    el.bc.value = bc.toFixed(4);
    el.fitOut.textContent = 'Fitted BC ' + bc.toFixed(4) + ' lb/in², applied above.';
    refresh();
  });

  el.exportBtn.addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rangecard-profiles.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    el.dataOut.textContent = 'Exported ' + state.profiles.length + ' profile(s).';
  });

  el.importBtn.addEventListener('click', function () { el.importFile.click(); });

  el.importFile.addEventListener('change', function () {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = JSON.parse(reader.result);
        if (!incoming || !Array.isArray(incoming.profiles) || !incoming.profiles.length) {
          throw new Error('no profiles');
        }
        incoming.profiles.forEach(function (p) {
          if (!p || !p.values) return;
          state.profiles.push({ id: newId(), name: (p.name || 'Imported') , values: p.values });
        });
        state.activeId = state.profiles[state.profiles.length - 1].id;
        renderProfileList();
        valuesToForm(active().values);
        save();
        refresh();
        el.dataOut.textContent = 'Imported ' + incoming.profiles.length + ' profile(s).';
      } catch (e) {
        el.dataOut.textContent = "That file isn't a Range Card export.";
      }
      el.importFile.value = '';
    };
    reader.readAsText(file);
  });

  /* ---------- start ---------- */

  load();
  renderProfileList();
  valuesToForm(active().values);
  loadPellets();
  refresh();
})();
