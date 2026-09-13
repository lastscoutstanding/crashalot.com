/*
 * ballistics.js — airgun exterior ballistics engine
 *
 * Pure computation. No DOM, no dependencies. Works as a plain <script> in the
 * browser (global `Ballistics`) and under node (`require('./ballistics.js')`).
 *
 * Everything is SI internally: metre, kilogram, second, kelvin, pascal.
 * Conversions live in Ballistics.units and belong in the presentation layer.
 *
 * Coordinate frame (line of sight is the reference):
 *   x = downrange along the line of sight
 *   y = up, perpendicular to the line of sight  (y = path relative to the crosshair)
 *   z = to the right                            (z = wind drift)
 * The bore starts at y = -scopeHeight and is launched at whatever angle makes
 * the trajectory cross the line of sight at the zero range.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Ballistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var G = 9.80665;          // m/s^2
  var R_DRY = 287.058;      // J/(kg K)
  var R_VAPOR = 461.495;    // J/(kg K)
  var GAMMA = 1.4;
  var LBIN2_TO_KGM2 = 703.0696; // 1 lb/in^2 sectional density -> kg/m^2
  var MOA_RAD = Math.PI / (180 * 60);
  var MIL_RAD = 0.001;

  /* ---------------------------------------------------------------
   * G1 drag function: Mach -> Cd
   * For diabolo pellets only the subsonic part (Mach 0.3 - 0.95) matters.
   * Verify this table against a reference before trusting it.
   * ------------------------------------------------------------- */
  var G1 = [
    [0.00, 0.2629], [0.05, 0.2558], [0.10, 0.2487], [0.15, 0.2413],
    [0.20, 0.2344], [0.25, 0.2278], [0.30, 0.2214], [0.35, 0.2155],
    [0.40, 0.2104], [0.45, 0.2061], [0.50, 0.2032], [0.55, 0.2020],
    [0.60, 0.2034], [0.70, 0.2165], [0.725, 0.2230], [0.75, 0.2313],
    [0.775, 0.2417], [0.80, 0.2546], [0.825, 0.2706], [0.85, 0.2901],
    [0.875, 0.3136], [0.90, 0.3415], [0.925, 0.3734], [0.95, 0.4084],
    [0.975, 0.4448], [1.00, 0.4805], [1.025, 0.5136], [1.05, 0.5427],
    [1.075, 0.5677], [1.10, 0.5883], [1.125, 0.6053], [1.15, 0.6191],
    [1.20, 0.6393], [1.25, 0.6518], [1.30, 0.6589], [1.35, 0.6621],
    [1.40, 0.6625], [1.50, 0.6573], [1.60, 0.6461], [1.80, 0.6187],
    [2.00, 0.5901]
  ];

  function interpTable(table, x) {
    if (x <= table[0][0]) return table[0][1];
    var last = table.length - 1;
    if (x >= table[last][0]) return table[last][1];
    var lo = 0, hi = last;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (table[mid][0] <= x) lo = mid; else hi = mid;
    }
    var t = (x - table[lo][0]) / (table[hi][0] - table[lo][0]);
    return table[lo][1] + t * (table[hi][1] - table[lo][1]);
  }

  /* Drag models. 'flat' is a constant Cd: for a diabolo inside a narrow
   * subsonic speed band that is often closer to reality than G1, provided you
   * fit the BC from your own measurements. */
  var dragModels = {
    g1: function (mach) { return interpTable(G1, mach); },
    flat: function () { return 0.2214; } // G1's Cd at Mach 0.30, used as an anchor
  };

  /* ---------------------------------------------------------------
   * Atmosphere
   * ------------------------------------------------------------- */

  // Saturation vapour pressure after Magnus-Tetens, in Pa. tempC in degrees C.
  function saturationVaporPressure(tempC) {
    return 610.94 * Math.exp(17.625 * tempC / (tempC + 243.04));
  }

  // Station pressure from sea level pressure and altitude (barometric formula).
  function stationPressure(seaLevelPa, altitudeM, tempC) {
    var Tk = tempC + 273.15;
    return seaLevelPa * Math.exp(-G * altitudeM / (R_DRY * Tk));
  }

  /**
   * @param {object} o
   * @param {number} o.tempC         air temperature in degrees C
   * @param {number} o.pressurePa    air pressure in Pa (station pressure unless isSeaLevel)
   * @param {number} [o.humidity]    relative humidity 0..1 (default 0.5)
   * @param {number} [o.altitudeM]   altitude in m, only used when isSeaLevel
   * @param {boolean} [o.isSeaLevel] true when pressurePa is reduced to sea level
   */
  function atmosphere(o) {
    var tempC = o.tempC;
    var rh = o.humidity == null ? 0.5 : o.humidity;
    var p = o.pressurePa;
    if (o.isSeaLevel) p = stationPressure(p, o.altitudeM || 0, tempC);

    var Tk = tempC + 273.15;
    var pv = rh * saturationVaporPressure(tempC);
    var pd = p - pv;
    var rho = pd / (R_DRY * Tk) + pv / (R_VAPOR * Tk);
    var speedOfSound = Math.sqrt(GAMMA * p / rho);

    return {
      tempC: tempC,
      pressurePa: p,
      humidity: rh,
      vaporPressurePa: pv,
      density: rho,                 // kg/m^3
      speedOfSound: speedOfSound,   // m/s
      densityRatio: rho / 1.2250    // against ICAO standard (15 C, 1013.25 hPa, dry)
    };
  }

  /* ---------------------------------------------------------------
   * Trajectory
   * ------------------------------------------------------------- */

  function normalizeShot(s) {
    var atm = s.atmosphere || atmosphere({ tempC: 15, pressurePa: 101325, humidity: 0.5 });
    var drag = dragModels[(s.dragModel || 'g1').toLowerCase()] || dragModels.g1;
    var bcSi = s.bc * LBIN2_TO_KGM2; // lb/in^2 -> kg/m^2
    var windSpeed = s.windSpeed || 0;
    var windFrom = (s.windFromDeg || 0) * Math.PI / 180; // 0 = head on, 90 = from the right
    return {
      atm: atm,
      drag: drag,
      bcSi: bcSi,
      v0: s.muzzleVelocity,
      scopeHeight: s.scopeHeight,
      lookAngle: (s.slopeDeg || 0) * Math.PI / 180,
      // wind vector in the sight frame: the direction the air is moving towards
      wind: [-windSpeed * Math.cos(windFrom), 0, -windSpeed * Math.sin(windFrom)],
      dt: s.dt || 0.0002,
      maxRange: s.maxRange || 100
    };
  }

  function accel(state, c) {
    // velocity relative to the air mass
    var rx = state[3] - c.wind[0];
    var ry = state[4] - c.wind[1];
    var rz = state[5] - c.wind[2];
    var v = Math.sqrt(rx * rx + ry * ry + rz * rz);
    var cd = c.drag(v / c.atm.speedOfSound);
    // a = (pi/8) * rho * Cd * v^2 / BC, opposing the air-relative velocity
    var k = (Math.PI / 8) * c.atm.density * cd * v / c.bcSi;
    return [
      -k * rx - G * Math.sin(c.lookAngle),
      -k * ry - G * Math.cos(c.lookAngle),
      -k * rz
    ];
  }

  function step(state, c, dt) {
    function deriv(s) {
      var a = accel(s, c);
      return [s[3], s[4], s[5], a[0], a[1], a[2]];
    }
    function add(s, d, h) {
      var out = new Array(6);
      for (var i = 0; i < 6; i++) out[i] = s[i] + d[i] * h;
      return out;
    }
    var k1 = deriv(state);
    var k2 = deriv(add(state, k1, dt / 2));
    var k3 = deriv(add(state, k2, dt / 2));
    var k4 = deriv(add(state, k3, dt));
    var out = new Array(6);
    for (var i = 0; i < 6; i++) {
      out[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    return out;
  }

  // Integrate one flight at a given launch angle. Returns the raw sample points.
  function integrate(c, launchAngle) {
    var state = [
      0, -c.scopeHeight, 0,
      c.v0 * Math.cos(launchAngle), c.v0 * Math.sin(launchAngle), 0
    ];
    var t = 0;
    var pts = [[0, state[0], state[1], state[2], c.v0]];
    var guard = 0;
    while (state[0] < c.maxRange && guard++ < 2000000) {
      state = step(state, c, c.dt);
      t += c.dt;
      var sp = Math.sqrt(state[3] * state[3] + state[4] * state[4] + state[5] * state[5]);
      pts.push([t, state[0], state[1], state[2], sp]);
      if (state[4] < 0 && state[1] < -50) break; // falling out of the world, stop
    }
    return pts;
  }

  function sampleAt(pts, x) {
    if (x <= 0) return pts[0];
    for (var i = 1; i < pts.length; i++) {
      if (pts[i][1] >= x) {
        var a = pts[i - 1], b = pts[i];
        var f = (x - a[1]) / (b[1] - a[1]);
        return [
          a[0] + f * (b[0] - a[0]),
          x,
          a[2] + f * (b[2] - a[2]),
          a[3] + f * (b[3] - a[3]),
          a[4] + f * (b[4] - a[4])
        ];
      }
    }
    return null;
  }

  // Find the launch angle whose trajectory crosses the line of sight at zeroRange.
  function solveZeroAngle(c, zeroRange) {
    var lo = -0.02, hi = 0.12; // radians; wide enough for any airgun
    function heightAt(angle) {
      var pts = integrate(
        Object.assign({}, c, { maxRange: zeroRange + 0.5, wind: [0, 0, 0] }),
        angle
      );
      var s = sampleAt(pts, zeroRange);
      return s ? s[2] : -1e6;
    }
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (heightAt(mid) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Compute a full trajectory.
   *
   * @param {object} shot
   * @param {number} shot.muzzleVelocity  m/s
   * @param {number} shot.mass            kg
   * @param {number} shot.bc              ballistic coefficient in lb/in^2
   * @param {string} [shot.dragModel]     'g1' (default) or 'flat'
   * @param {number} shot.scopeHeight     m, scope centre above bore centre
   * @param {number} shot.zeroRange       m
   * @param {number} [shot.slopeDeg]      slope angle, positive is uphill
   * @param {number} [shot.windSpeed]     m/s
   * @param {number} [shot.windFromDeg]   direction the wind comes from,
   *                                      0 = head on, 90 = from the right
   * @param {number[]} [shot.distances]   ranges in m for the table
   * @returns {{zeroAngleRad:number, zeroAngleMoa:number, zeros:number[], rows:Array}}
   */
  function trajectory(shot) {
    var c = normalizeShot(shot);
    var angle = solveZeroAngle(c, shot.zeroRange);
    var pts = integrate(c, angle);

    var distances = shot.distances;
    if (!distances) {
      distances = [];
      for (var d = 0; d <= c.maxRange; d += 5) distances.push(d);
    }

    var rows = distances.map(function (x) {
      var s = sampleAt(pts, x);
      if (!s) return null;
      var drop = s[2];   // m relative to the line of sight, negative is below the crosshair
      var drift = s[3];
      var v = s[4];
      var holdRad = x > 0 ? -Math.atan(drop / x) : 0;
      var windRad = x > 0 ? -Math.atan(drift / x) : 0;
      return {
        distance: x,
        time: s[0],
        velocity: v,
        energy: 0.5 * shot.mass * v * v,     // joule
        drop: drop,                           // m
        dropCm: drop * 100,
        holdMoa: holdRad / MOA_RAD,
        holdMil: holdRad / MIL_RAD,
        holdRad: holdRad,
        drift: drift,
        driftCm: drift * 100,
        windMoa: windRad / MOA_RAD,
        windMil: windRad / MIL_RAD,
        windRad: windRad
      };
    }).filter(Boolean);

    // every crossing of the line of sight (near zero and far zero)
    var zeros = [];
    for (var i = 1; i < pts.length; i++) {
      var yPrev = pts[i - 1][2], yNow = pts[i][2];
      if ((yPrev < 0 && yNow >= 0) || (yPrev > 0 && yNow <= 0)) {
        var f = yPrev / (yPrev - yNow);
        zeros.push(pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]));
      }
    }

    return {
      zeroAngleRad: angle,
      zeroAngleMoa: angle / MOA_RAD,
      zeros: zeros,
      nearZero: zeros.length ? zeros[0] : null,
      farZero: zeros.length ? zeros[zeros.length - 1] : null,
      maxOrdinate: pts.reduce(function (m, p) { return Math.max(m, p[2]); }, -Infinity),
      points: pts,
      rows: rows
    };
  }

  /**
   * Fit the BC from two measured velocities (chrono at the muzzle and at
   * distance d). For airguns this beats a manufacturer's published BC.
   */
  function solveBC(o) {
    var lo = 0.001, hi = 0.5;
    function vAt(bc) {
      var c = normalizeShot({
        muzzleVelocity: o.v0, bc: bc, dragModel: o.dragModel,
        scopeHeight: 0, atmosphere: o.atmosphere, maxRange: o.distance + 0.5
      });
      var pts = integrate(c, 0);
      var s = sampleAt(pts, o.distance);
      return s ? s[4] : 0;
    }
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (vAt(mid) < o.v1) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  var units = {
    grainToKg: function (gr) { return gr * 0.00006479891; },
    kgToGrain: function (kg) { return kg / 0.00006479891; },
    fpsToMs: function (fps) { return fps * 0.3048; },
    msToFps: function (ms) { return ms / 0.3048; },
    jouleToFtlb: function (j) { return j * 0.737562; },
    mToYd: function (m) { return m / 0.9144; },
    ydToM: function (yd) { return yd * 0.9144; },
    mmToM: function (mm) { return mm / 1000; },
    hpaToPa: function (hpa) { return hpa * 100; },
    moaRad: MOA_RAD,
    milRad: MIL_RAD,
    clicks: function (rad, clickValue, unit) {
      var per = unit === 'moa' ? clickValue * MOA_RAD : clickValue * MIL_RAD;
      return rad / per;
    }
  };

  return {
    atmosphere: atmosphere,
    saturationVaporPressure: saturationVaporPressure,
    stationPressure: stationPressure,
    trajectory: trajectory,
    solveBC: solveBC,
    dragModels: dragModels,
    units: units,
    constants: { G: G, MOA_RAD: MOA_RAD, MIL_RAD: MIL_RAD }
  };
});
