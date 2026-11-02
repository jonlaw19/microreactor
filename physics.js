// Lumped plant model for teaching. Time runs faster than a real plant so responses show in seconds.
// State: control drum position, pumps, turbine-generator, SCRAM; outputs power, outlet temperature,
// sodium flow, electric output, battery charge, backup generators, passive heat removal.

export const P_THERMAL_MW = 30, P_ELECTRIC_MW = 10, T_IN = 400, T_OUT = 550;

export function createSim() {
  const s = {
    drum: 0.6, pumps: true, gen: true, scram: false,
    Pf: 0.94, decay: 0.06, T: T_OUT, flow: 1, elec: 1, soc: 1, gens: false, gensRamp: 0, tTrip: 0, tScram: 0, trip: null,
    get P() { return this.Pf + this.decay; },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  s.reset = () => Object.assign(s, { drum: 0.6, pumps: true, gen: true, scram: false, Pf: 0.94, decay: 0.06, T: T_OUT, flow: 1, elec: 1, soc: 1, gens: false, gensRamp: 0, tTrip: 0, tScram: 0, trip: null });
  s.cold = () => Object.assign(s, { drum: 0, pumps: true, gen: false, scram: false, Pf: 0.004, decay: 0.002, T: T_IN, flow: 1, elec: 0, soc: 1, gens: false, gensRamp: 0, tTrip: 0, tScram: 0, trip: null });

  s.step = (dt) => {
    dt = Math.min(dt, 0.1);
    // Reactivity: drums add or remove it; a hotter core removes it (negative temperature feedback).
    // Drum worth is steep near fully-in so the core goes subcritical. Fuel (Doppler) feedback is prompt; coolant feedback lags.
    const rhoDrum = 1.6 * (s.drum - 0.6) + (s.drum < 0.3 ? -3 * (0.3 - s.drum) : 0);
    const rho = rhoDrum - 0.9 * (s.Pf - 0.94) - 0.009 * (s.T - T_OUT) - (s.scram ? 6 : 0);
    s.Pf = clamp(s.Pf + (s.Pf * rho / 3.5) * dt, 0.003, 1.8);
    // Protection system: overpower trip drops the rods.
    if (!s.scram && s.P > 1.3) { s.scram = true; s.trip = "overpower"; }
    if (!s.scram && s.T > 720) { s.scram = true; s.trip = "temperature"; }
    // Decay heat builds with power and fades slowly after shutdown.
    s.decay += ((0.065 * s.Pf) - s.decay) * (dt / (s.Pf > s.decay * 4 ? 25 : 60));
    s.decay = Math.max(s.decay, 0.002);
    // Sodium flow: pumps hold 100%; without pumps the loop coasts down to natural circulation.
    const flowT = s.pumps ? 1 : 0.18;
    s.flow += (flowT - s.flow) * dt / (s.pumps ? 3 : 7);
    // Heat sink: the turbine takes the heat when online; otherwise only bypass and passive cooling.
    const sink = s.gen ? 1 : 0.32;
    const Tss = T_IN + (T_OUT - T_IN) * s.P / Math.max(s.flow, 0.12) / sink;
    s.T += (Math.min(Tss, 980) - s.T) * dt / 7;
    // Electric output follows thermal power when the generator is online.
    const eT = s.gen && s.Pf > 0.08 ? clamp(s.P, 0, 1.1) : 0;
    s.elec += (eT - s.elec) * dt / (s.gen ? 4 : 2.5);
    // Data hall supply chain after a generator trip: batteries first, backup generators after 10 s.
    if (!s.gen) {
      s.tTrip += dt;
      if (s.tTrip > 10) s.gens = true;
      s.gensRamp += ((s.gens ? 1 : 0) - s.gensRamp) * dt / 3;
      s.soc = Math.max(0, s.soc - dt * 0.012 * (1 - s.gensRamp));
    } else {
      s.tTrip = 0; s.gens = false;
      s.gensRamp += (0 - s.gensRamp) * dt / 3;
      s.soc = Math.min(1, s.soc + dt * 0.004);
    }
    if (s.scram) s.tScram += dt;
  };

  // Passive air cooling (RVACS) grows with vessel temperature.
  s.passiveMW = () => 1.2 * clamp((s.T - 380) / 220, 0, 1);
  s.hallSupply = () => (s.gen && s.elec > 0.3 ? 'Reactor' : s.gens ? 'Backup generators' : s.soc > 0.02 ? 'Batteries' : 'None, load shed');
  return s;
}
