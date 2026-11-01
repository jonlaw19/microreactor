// Labeled components of the generic sodium-cooled microreactor.
// Values are representative of a ~10 MWe class pool-type design and are
// informed by public designs (INL MARVEL, DOE microreactor program).
// Each entry: id, name, group, keywords (for search), desc, specs,
// layer (for layer toggles), explode ([x,y,z] offset at full explode, metres).

export const GROUPS = [
  { id: 'core', name: 'Reactor core' },
  { id: 'primary', name: 'Primary system' },
  { id: 'safety', name: 'Safety & shielding' },
  { id: 'power', name: 'Power conversion' },
  { id: 'site', name: 'Site & structure' },
];

export const PARTS = [
  // ---------------- CORE ----------------
  {
    id: 'core', name: 'Reactor core', group: 'core',
    keywords: 'core fission lattice active region',
    desc: 'The core is the compact region where fission takes place. Fuel assemblies sit in a tight hexagonal lattice, and the reflector surrounds them.',
    specs: [
      ['Thermal power', '≈ 30 MWt'],
      ['Active height', '≈ 1.0 m'],
      ['Diameter', '≈ 1.2 m'],
      ['Refueling', 'Whole-core swap every 5–10 years'],
    ],
    explode: [0, 7.6, 0],
  },
  {
    id: 'assemblies', name: 'Fuel assemblies', group: 'core',
    keywords: 'fuel assembly hex duct bundle',
    desc: 'Each assembly is a hexagonal steel duct that holds a bundle of fuel pins. Sodium flows upward through the duct and carries the heat away.',
    specs: [
      ['Count', '61'],
      ['Duct material', 'HT-9 ferritic steel'],
      ['Lattice pitch', '≈ 135 mm'],
      ['Pins per assembly', '19 (simplified model)'],
    ],
    explode: [0, 7.6, 0],
  },
  {
    id: 'pins', name: 'Fuel pins', group: 'core',
    keywords: 'fuel pin rod pellet cladding uranium HALEU',
    desc: 'Fuel pins are sealed steel tubes filled with uranium fuel. A thin bond layer fills the gap between the fuel and the cladding and moves heat outward.',
    specs: [
      ['Fuel form', 'U-Zr metal or UO₂, HALEU (< 20% U-235)'],
      ['Cladding', 'HT-9 steel'],
      ['Pin diameter', '≈ 10 mm (model simplified)'],
      ['Peak cladding temp.', '≈ 650 °C'],
    ],
    explode: [0, 8.6, 0],
  },
  {
    id: 'reflector', name: 'Neutron reflector', group: 'core',
    keywords: 'reflector beryllium graphite neutron economy',
    desc: 'The reflector ring surrounds the core and bounces escaping neutrons back in. It lets a small core sustain a chain reaction with less fuel.',
    specs: [
      ['Material', 'Beryllium oxide or graphite in steel cans'],
      ['Radial thickness', '≈ 280 mm'],
      ['Height', '≈ 1.1 m'],
      ['Also houses', '12 control drums'],
    ],
    explode: [0, 5.0, 0],
  },
  {
    id: 'drums', name: 'Control drums', group: 'core',
    keywords: 'control drum rotate absorber boron carbide reactivity',
    desc: 'Control drums are rotating cylinders inside the reflector. One face is a neutron absorber: turned toward the core it lowers power, turned away it raises power.',
    specs: [
      ['Count', '12'],
      ['Absorber', 'Boron carbide (B₄C) sector, 120°'],
      ['Diameter', '≈ 220 mm'],
      ['Drive', 'Stepper motor, 0–180° rotation'],
    ],
    explode: [0, -2.0, 0],
  },
  {
    id: 'rods', name: 'Shutdown rods', group: 'core',
    keywords: 'shutdown rod scram absorber gravity safety',
    desc: 'Shutdown rods drop into the core to stop the chain reaction. Gravity inserts them when the holding magnets lose power, so the system needs no operator action.',
    specs: [
      ['Count', '3'],
      ['Absorber', 'Boron carbide (B₄C)'],
      ['Insertion time', '< 2 s'],
      ['Hold', 'Electromagnetic latch, fail-safe'],
    ],
    explode: [0, 9.5, 0],
  },

  // ---------------- PRIMARY ----------------
  {
    id: 'vessel', name: 'Reactor vessel', group: 'primary',
    keywords: 'reactor vessel tank stainless steel',
    desc: 'The reactor vessel is a stainless-steel tank that holds the core and the sodium pool. It operates near atmospheric pressure because sodium boils at 883 °C, far above operating temperature.',
    specs: [
      ['Material', '316H stainless steel'],
      ['Height', '≈ 5.5 m'],
      ['Diameter', '≈ 2.4 m'],
      ['Design pressure', 'Near atmospheric'],
    ],
    layer: 'vessels',
    explode: [0, 2.2, 0],
  },
  {
    id: 'guard', name: 'Guard vessel', group: 'primary',
    keywords: 'guard vessel leak containment double wall',
    desc: 'A second steel vessel surrounds the reactor vessel with a small gap. If the inner vessel leaks, the guard vessel catches the sodium and keeps the core covered.',
    specs: [
      ['Gap', '≈ 150 mm, argon filled'],
      ['Material', 'Stainless steel'],
      ['Leak detection', 'Gap sensors and level probes'],
      ['Function', 'Second barrier for sodium'],
    ],
    layer: 'vessels',
    explode: [0, 0, 0],
  },
  {
    id: 'sodium', name: 'Sodium coolant pool', group: 'primary',
    keywords: 'sodium coolant liquid metal pool hot cold argon',
    desc: 'Liquid sodium fills the vessel and carries heat from the core to the heat exchangers. It conducts heat very well and stays liquid from 98 °C to 883 °C.',
    specs: [
      ['Core inlet', '≈ 400 °C'],
      ['Core outlet', '≈ 550 °C'],
      ['Inventory', '≈ 20 tonnes'],
      ['Cover gas', 'Argon at ~1 atm'],
    ],
    layer: 'sodium',
    explode: [0, 3.6, 0],
  },
  {
    id: 'pumps', name: 'Electromagnetic pumps', group: 'primary',
    keywords: 'EM pump electromagnetic induction no moving parts flow',
    desc: 'EM pumps drive sodium with magnetic fields instead of impellers. They have no moving parts, no seals, and nothing to wear out.',
    specs: [
      ['Count', '2'],
      ['Type', 'Annular linear induction'],
      ['Flow', '≈ 150 kg/s each'],
      ['Backup', 'Natural circulation'],
    ],
    explode: [0, 0, 0], // radial, set in code
    radial: 2.2,
  },
  {
    id: 'ihx', name: 'Intermediate heat exchangers', group: 'primary',
    keywords: 'IHX heat exchanger tubes shell intermediate loop',
    desc: 'The IHX moves heat from the radioactive primary sodium to a clean intermediate loop. Thousands of thin tubes give the two fluids a large contact area without mixing.',
    specs: [
      ['Count', '2'],
      ['Type', 'Shell-and-tube, counter-flow'],
      ['Duty', '≈ 15 MWt each'],
      ['Secondary fluid', 'Sodium or molten salt'],
    ],
    explode: [0, 0, 0],
    radial: 2.2,
  },
  {
    id: 'head', name: 'Reactor head & drives', group: 'primary',
    keywords: 'head deck closure plug rotating drive mechanism penetrations',
    desc: 'The head closes the vessel and carries every penetration. Rod drives, instrument lines, and pipe nozzles pass through it, and a rotating plug gives access for refueling.',
    specs: [
      ['Deck thickness', '≈ 300 mm steel'],
      ['Rotating plug', '≈ 1.8 m diameter'],
      ['Penetrations', 'Rod drives, IHX nozzles, instruments'],
      ['Shield plug', 'Borated steel and concrete below deck'],
    ],
    explode: [0, 11, 0],
  },

  // ---------------- SAFETY ----------------
  {
    id: 'dhr', name: 'Decay heat removal', group: 'safety',
    keywords: 'decay heat removal RVACS passive natural draft air chimney stack cooling',
    desc: 'After shutdown the fuel still produces a few percent of full power. Air ducts around the guard vessel let natural convection carry that heat to a chimney with no pumps and no power.',
    specs: [
      ['Type', 'Reactor vessel auxiliary cooling (RVACS)'],
      ['Capacity', '≈ 1 MWt'],
      ['Driving force', 'Natural draft'],
      ['Availability', 'Always on, passive'],
    ],
    explode: [0, 0, 0],
    radial: 3.0,
  },
  {
    id: 'shield', name: 'Radiation shielding', group: 'safety',
    keywords: 'shield shielding concrete biological neutron gamma vault',
    desc: 'Thick concrete and steel around the vessel absorb neutrons and gamma rays. Workers can approach the building while the reactor operates.',
    specs: [
      ['Material', 'Reinforced concrete and borated steel'],
      ['Radial thickness', '≈ 1.4 m'],
      ['Top shield', 'Rotating shield plug'],
      ['Design goal', 'Public dose limits met at site boundary'],
    ],
    layer: 'shield',
    explode: [0, 0, 0],
    radial: 4.0,
  },
  {
    id: 'instruments', name: 'Instrumentation', group: 'safety',
    keywords: 'instrumentation sensors neutron detector thermocouple monitoring control system',
    desc: 'Neutron detectors, thermocouples, and sodium level sensors report on the core in real time. The control system uses these readings to adjust the drums automatically.',
    specs: [
      ['Neutron detectors', '4 ex-core fission chambers'],
      ['Temperature', '≈ 200 thermocouples'],
      ['Leak detection', 'Guard-vessel gap sensors'],
      ['Operation', 'Autonomous with remote monitoring'],
    ],
    explode: [0, 0, 0],
    radial: 2.6,
  },

  // ---------------- POWER ----------------
  {
    id: 'loop', name: 'Intermediate loop piping', group: 'power',
    keywords: 'intermediate loop piping pipes hot leg cold leg secondary',
    desc: 'Insulated pipes carry the clean intermediate fluid from the IHX to the power conversion unit and back. The loop keeps radioactive sodium inside the reactor vault.',
    specs: [
      ['Pipes', '2 hot legs, 2 cold legs'],
      ['Hot leg', '≈ 520 °C'],
      ['Cold leg', '≈ 370 °C'],
      ['Insulation', 'Mineral wool with steel jacket'],
    ],
    explode: [0, 9.5, 0],
  },
  {
    id: 'pcu', name: 'Power conversion unit', group: 'power',
    keywords: 'PCU turbine generator sCO2 brayton power electricity',
    desc: 'The PCU turns heat into electricity. Hot intermediate fluid heats a working gas that spins a turbine and a generator.',
    specs: [
      ['Cycle', 'Supercritical CO₂ Brayton'],
      ['Net output', '≈ 10 MWe'],
      ['Efficiency', '≈ 35–40%'],
      ['Footprint', 'One truck-transportable skid'],
    ],
    explode: [3.0, 0, 0],
  },
  {
    id: 'cooler', name: 'Air-cooled heat rejection', group: 'power',
    keywords: 'air cooler fans heat rejection dry cooling condenser',
    desc: 'Fans blow air across finned tubes to reject the waste heat of the power cycle. Dry cooling means the plant needs no cooling water.',
    specs: [
      ['Type', 'Forced-draft dry cooler'],
      ['Heat rejected', '≈ 20 MWt'],
      ['Fans', '6 × 3 m diameter'],
      ['Water use', 'None'],
    ],
    explode: [5.0, 0, 0],
  },

  // ---------------- SITE ----------------
  {
    id: 'building', name: 'Reactor building', group: 'site',
    keywords: 'building enclosure containment structure roof vault',
    desc: 'A steel building encloses the reactor module and the power unit. Inside it, a concrete shield silo holds the module, gives seismic protection, and forms a final barrier for sodium.',
    specs: [
      ['Footprint', '≈ 18 × 12 m'],
      ['Shield silo', '≈ 1.4 m reinforced concrete'],
      ['Structure', 'Steel frame, insulated panels'],
      ['Seismic', 'Module on isolated base'],
    ],
    layer: 'building',
    explode: [0, 9, 0],
  },
  {
    id: 'skid', name: 'Transport skid', group: 'site',
    keywords: 'skid frame transport truck factory module base',
    desc: 'The reactor module ships from the factory on a steel skid. The skid sets the module in the shield silo and acts as its seismic base.',
    specs: [
      ['Fits', 'Standard heavy-haul trailer'],
      ['Mass', '≈ 80 t with module'],
      ['Transport', 'Truck or rail'],
      ['Install time', 'Weeks, not years'],
    ],
    explode: [0, 0, 0],
  },
];

// Order of the guided tour.
export const TOUR = [
  'building', 'shield', 'guard', 'vessel', 'sodium', 'core', 'assemblies',
  'pins', 'reflector', 'drums', 'rods', 'pumps', 'ihx', 'head', 'dhr',
  'instruments', 'loop', 'pcu', 'cooler', 'skid',
];
