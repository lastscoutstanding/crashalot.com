/* reticle.js — Range Card
 *
 * Draws a parametric reticle as SVG and places either holdover dots on it or
 * range labels against its marks. Pure: takes numbers, returns a string. No
 * DOM, no dependencies.
 *
 * There is no library of branded reticles here on purpose. A reticle with the
 * wrong subtension produces a wrong holdover that still looks plausible, which
 * is the worst kind of wrong. Instead you describe your reticle in its own
 * geometry — unit, spacing, how many marks — which is what the scope manual
 * tells you, and that reproduces mil-dot, half-mil, MOA and most ladder
 * reticles exactly.
 *
 * Focal plane: on a first focal plane scope the subtensions hold at every
 * magnification. On second focal plane they are only true at one magnification,
 * and at any other the engraved mark covers a different angle:
 *
 *     angle per mark = spacing * (calibration magnification / current)
 *
 * The engraving does not move on screen. The holdover does. That is what the
 * drawing shows.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Reticle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MOA_RAD = Math.PI / (180 * 60);
  var MIL_RAD = 0.001;

  var PATTERNS = {
    'mil-dot':   { unit: 'mil', spacing: 1,   marksBelow: 5, halfMarks: false, marksSide: 4 },
    'half-mil':  { unit: 'mil', spacing: 0.5, marksBelow: 8, halfMarks: false, marksSide: 6 },
    'moa-1':     { unit: 'moa', spacing: 1,   marksBelow: 8, halfMarks: false, marksSide: 6 },
    'moa-half':  { unit: 'moa', spacing: 0.5, marksBelow: 10, halfMarks: false, marksSide: 8 },
    'duplex':    { unit: 'mil', spacing: 1,   marksBelow: 0, halfMarks: false, marksSide: 0 }
  };

  function unitRad(unit) { return unit === 'moa' ? MOA_RAD : MIL_RAD; }

  // Angle covered by one engraved mark, in radians, at the current magnification.
  function anglePerMark(cfg) {
    var scale = 1;
    if (cfg.plane === 'sfp') {
      var cal = cfg.calMag > 0 ? cfg.calMag : 1;
      var now = cfg.mag > 0 ? cfg.mag : cal;
      scale = cal / now;
    }
    return cfg.spacing * scale * unitRad(cfg.unit);
  }

  /* Reverse lookup: at what range does the pellet's holdover equal this angle?
   *
   * Close in, before the near zero, the pellet is also below the line of sight,
   * so the same angle has an answer a few metres from the muzzle that nobody
   * wants. Only the descending branch counts, so we start scanning at the apex.
   * An angle the pellet never reaches within the computed flight returns null
   * rather than the near-side answer. */
  function rangeForAngle(points, angle) {
    if (!points || points.length < 3) return null;

    var apex = 0;
    for (var j = 1; j < points.length; j++) {
      if (points[j][2] > points[apex][2]) apex = j;
    }

    var prevHold = null, prevX = null;
    for (var i = apex; i < points.length; i++) {
      var x = points[i][1];
      if (x <= 0.5) continue;
      var hold = -Math.atan(points[i][2] / x);
      if (prevHold !== null && prevHold < angle && hold >= angle) {
        var f = (angle - prevHold) / (hold - prevHold);
        return prevX + f * (x - prevX);
      }
      prevHold = hold;
      prevX = x;
    }
    return null;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmt(n, d) { return n.toFixed(d == null ? 1 : d); }

  /**
   * @param {object} o
   * @param {object} o.config   {pattern, unit, spacing, marksBelow, halfMarks, marksSide,
   *                             plane:'ffp'|'sfp', calMag, mag}
   * @param {string} o.mode     'holdover' or 'marks'
   * @param {boolean} o.wind    holdover mode only: offset the dots for wind
   * @param {Array} o.rows      trajectory rows, for holdover mode
   * @param {Array} o.points    raw trajectory points, for marks mode
   * @param {number} o.width    viewBox width in user units
   * @param {number} o.height   viewBox height in user units
   * @returns {{svg:string, notes:string}}
   */
  function build(o) {
    var cfg = o.config;
    var W = o.width || 640;
    var H = o.height || 340;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) / 2 - 8;
    var usable = R - 22;
    var marks = Math.max(1, cfg.marksBelow || 1);
    var per = usable / marks;                 // pixels between engraved marks
    var rad = anglePerMark(cfg);              // radians per engraved mark
    var dim = 'var(--text-dim)', faint = 'var(--text-faint)', accent = 'var(--accent)';

    var s = [];
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R +
           '" fill="var(--bg)" stroke="var(--line)" stroke-width="1"/>');
    s.push('<line x1="' + (cx - R + 6) + '" y1="' + cy + '" x2="' + (cx + R - 6) + '" y2="' + cy +
           '" stroke="' + dim + '" stroke-width="1"/>');
    s.push('<line x1="' + cx + '" y1="' + (cy - R + 6) + '" x2="' + cx + '" y2="' + (cy + R - 6) +
           '" stroke="' + dim + '" stroke-width="1"/>');

    var i;
    for (i = 1; i <= marks; i++) {
      var y = cy + i * per;
      if (y > cy + R - 8) break;
      s.push('<line x1="' + (cx - 6) + '" y1="' + fmt(y) + '" x2="' + (cx + 6) + '" y2="' + fmt(y) +
             '" stroke="' + dim + '" stroke-width="1.4"/>');
      if (cfg.halfMarks && i <= marks) {
        var yh = cy + (i - 0.5) * per;
        s.push('<line x1="' + (cx - 3) + '" y1="' + fmt(yh) + '" x2="' + (cx + 3) + '" y2="' + fmt(yh) +
               '" stroke="' + faint + '" stroke-width="1"/>');
      }
    }

    for (i = 1; i <= (cfg.marksSide || 0); i++) {
      var dx = i * per;
      if (dx > R - 10) break;
      s.push('<line x1="' + fmt(cx - dx) + '" y1="' + (cy - 5) + '" x2="' + fmt(cx - dx) + '" y2="' + (cy + 5) +
             '" stroke="' + dim + '" stroke-width="1.4"/>');
      s.push('<line x1="' + fmt(cx + dx) + '" y1="' + (cy - 5) + '" x2="' + fmt(cx + dx) + '" y2="' + (cy + 5) +
             '" stroke="' + dim + '" stroke-width="1.4"/>');
    }

    var unitLabel = cfg.unit === 'moa' ? 'MOA' : 'mil';
    var perMarkText = fmt(rad / unitRad(cfg.unit), 2) + ' ' + unitLabel + ' per mark';
    var notes = perMarkText;

    if (o.mode === 'marks') {
      var any = false;
      for (i = 1; i <= marks; i++) {
        var yM = cy + i * per;
        if (yM > cy + R - 8) break;
        var range = rangeForAngle(o.points || [], i * rad);
        var label = range == null ? '—' : fmt(range, 0) + ' m';
        if (range != null) any = true;
        s.push('<text x="' + (cx + 10) + '" y="' + fmt(yM + 4) + '" fill="' +
               (range == null ? faint : accent) + '" font-size="12" font-family="var(--font-num)">' +
               esc(label) + '</text>');
      }
      var zeroLabel = o.zeroRange != null ? fmt(o.zeroRange, 0) + ' m' : '';
      s.push('<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + accent + '"/>');
      if (zeroLabel) {
        s.push('<text x="' + (cx + 10) + '" y="' + (cy - 6) + '" fill="' + accent +
               '" font-size="12" font-family="var(--font-num)">' + esc(zeroLabel) + '</text>');
      }
      if (!any && marks > 0) notes += ' · no mark falls on a range inside the card';
      return { svg: s.join(''), notes: notes };
    }

    // holdover mode
    var rows = (o.rows || []).filter(function (r) { return r.distance > 0; });
    if (rows.length > 9) {
      var stride = Math.ceil(rows.length / 9);
      rows = rows.filter(function (r, idx) { return idx % stride === 0; });
    }

    var offCount = 0;
    rows.forEach(function (r) {
      var y = cy + (r.holdRad / rad) * per;
      var x = cx + (o.wind ? (r.windRad / rad) * per : 0);
      var dist2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dist2 > (R - 6) * (R - 6)) { offCount++; return; }
      s.push('<circle cx="' + fmt(x) + '" cy="' + fmt(y) + '" r="3.2" fill="' + accent + '"/>');
      s.push('<text x="' + fmt(x + 8) + '" y="' + fmt(y + 4) + '" fill="' + accent +
             '" font-size="12" font-family="var(--font-num)">' + fmt(r.distance, 0) + ' m</text>');
    });

    if (offCount) notes += ' · ' + offCount + ' range' + (offCount > 1 ? 's fall' : ' falls') + ' outside the reticle';
    return { svg: s.join(''), notes: notes };
  }

  return {
    build: build,
    patterns: PATTERNS,
    anglePerMark: anglePerMark,
    rangeForAngle: rangeForAngle
  };
});
