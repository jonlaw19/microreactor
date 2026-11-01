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
  { id: 'grid', name: 'Grid connection' },
  { id: 'datacenter', name: 'Data center' },
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
      ['Pins per assembly', '91, wire-wrapped'],
    ],
    explode: [0, 7.6, 0],
  },
  {
    id: 'pins', name: 'Fuel pins', group: 'core',
    keywords: 'fuel pin rod pellet cladding uranium HALEU',
    desc: 'Fuel pins are sealed steel tubes filled with uranium fuel pellets. A wire wrapped around each pin keeps the pins apart and lets sodium flow between them.',
    specs: [
      ['Fuel form', 'U-Zr metal or UO₂, HALEU (< 20% U-235)'],
      ['Cladding', 'HT-9 steel'],
      ['Pin diameter', '≈ 9 mm'],
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

  // ---------------- GRID + DATA CENTER ----------------
  {
    id: 'txline', name: 'Transmission line', group: 'grid',
    keywords: 'transmission line poles conductors wires overhead power line 69 kV',
    desc: 'A short overhead line carries the plant output to the campus substation. Three conductors hang from insulators on steel poles.',
    specs: [
      ['Voltage', '69 kV, three phase'],
      ['Length', '≈ 30 m on site'],
      ['Poles', 'Steel monopoles, 15 m'],
      ['Capacity', '≈ 12 MW, far above plant output'],
    ],
    explode: [0, 4.0, 0], labelDist: 60,
  },
  {
    id: 'dcsub', name: 'Campus substation', group: 'grid',
    keywords: 'substation step-down transformer switchgear campus utility yard 13.8 kV',
    desc: 'The campus substation steps the voltage down for the data center. Two transformers share the load so one can rest during maintenance.',
    specs: [
      ['Transformers', '2 × 8 MVA, 69 kV to 13.8 kV'],
      ['Redundancy', 'N+1, either unit carries the hall'],
      ['Protection', 'Breakers and relays in the switch house'],
      ['Feed to hall', 'Underground duct bank'],
    ],
    explode: [0, 0, -4.0], labelDist: 80,
  },
  {
    id: 'dchall', name: 'Data hall', group: 'datacenter',
    keywords: 'data center hall building servers facility campus colocation',
    desc: 'The data hall holds the servers that use the reactor output. One microreactor carries roughly 8 MW of IT load plus cooling and losses.',
    specs: [
      ['Footprint', '≈ 48 × 22 m'],
      ['IT load', '≈ 8 MW'],
      ['Racks', '320 at ≈ 25 kW each'],
      ['Uptime target', 'Tier III, concurrently maintainable'],
    ],
    explode: [0, 6.0, 0], labelDist: 120,
  },
  {
    id: 'racks', name: 'Server racks', group: 'datacenter',
    keywords: 'server racks GPU compute rows hot aisle cold aisle containment IT',
    desc: 'Servers sit in rows of racks with hot-aisle containment. Cold air enters the front of each rack and hot air leaves into a sealed aisle.',
    specs: [
      ['Rows', '8 rows × 40 racks'],
      ['Rack power', '≈ 25 kW, liquid-ready'],
      ['Containment', 'Hot aisle, doors at each end'],
      ['Distribution', 'Overhead busway, A and B feeds'],
    ],
    explode: [0, 3.0, 0], labelDist: 45,
  },
  {
    id: 'ups', name: 'UPS & electrical room', group: 'datacenter',
    keywords: 'UPS uninterruptible power supply electrical room switchgear PDU batteries ride-through',
    desc: 'The electrical room receives the feed from the substation and conditions it. UPS units ride through short dips while the generators start.',
    specs: [
      ['UPS', '2 × 5 MW, N+1'],
      ['Ride-through', '≈ 5 minutes at full load'],
      ['Switchgear', '13.8 kV to 480 V'],
      ['Distribution', 'PDUs feed the overhead busway'],
    ],
    explode: [0, 3.0, 0], labelDist: 45,
  },
  {
    id: 'bess', name: 'Battery storage', group: 'datacenter',
    keywords: 'battery storage BESS energy storage containers lithium load smoothing microgrid',
    desc: 'Battery containers smooth the load the reactor sees. The reactor runs flat out, and the batteries absorb or supply the difference.',
    specs: [
      ['Capacity', '≈ 10 MWh in 3 containers'],
      ['Power', '≈ 5 MW'],
      ['Chemistry', 'Lithium iron phosphate'],
      ['Role', 'Load following and black start'],
    ],
    explode: [0, 0, -4.0], labelDist: 80,
  },
  {
    id: 'gens', name: 'Backup generators', group: 'datacenter',
    keywords: 'backup generators diesel gensets emergency standby fuel tank',
    desc: 'Standby generators cover the hall if the reactor or the line is out. With the reactor as prime power, they run only for tests.',
    specs: [
      ['Units', '2 × 3 MW'],
      ['Fuel', 'Diesel, 24 hours on site'],
      ['Start time', '< 10 s to full load'],
      ['Duty', 'Standby, monthly test'],
    ],
    explode: [0, 0, -4.0], labelDist: 80,
  },
  {
    id: 'dccool', name: 'Cooling plant', group: 'datacenter',
    keywords: 'cooling chillers dry coolers fans rooftop heat rejection CRAH liquid cooling',
    desc: 'Rooftop coolers reject the heat the servers make. Fans pull air across coils, and the chilled loop returns to the hall.',
    specs: [
      ['Heat rejected', '≈ 9 MW'],
      ['Units', '6 rooftop dry coolers'],
      ['Loop', 'Warm water, 30 °C supply'],
      ['Water use', 'None, dry cooling'],
    ],
    explode: [0, 5.0, 0], labelDist: 90,
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
    id: 'crane', name: 'Bridge crane', group: 'site',
    keywords: 'crane hoist bridge trolley lift refueling maintenance',
    desc: 'An overhead bridge crane runs the length of the building. It lifts the reactor head, the shield plug, and the spent core cask during refueling.',
    specs: [
      ['Capacity', '≈ 40 t'],
      ['Span', '≈ 12 m'],
      ['Hoist', 'Electric wire-rope, two speeds'],
      ['Use', 'Refueling and major maintenance'],
    ],
    explode: [0, 9, 0],
  },
  {
    id: 'switchyard', name: 'Switchyard & transformer', group: 'grid',
    keywords: 'switchyard transformer switchgear grid connection electrical breaker substation',
    desc: 'The generator output steps up through a transformer to the local grid voltage. Switchgear cabinets protect the plant and let operators isolate it from the grid.',
    specs: [
      ['Transformer', '≈ 12 MVA, 13.8 kV to 69 kV'],
      ['Switchgear', 'Metal-clad, 3 cabinets'],
      ['Connection', 'Single feeder to local grid or microgrid'],
      ['Islanding', 'Can run isolated with a load bank'],
    ],
    explode: [0, 0, -4.0],
  },
  {
    id: 'truck', name: 'Module delivery truck', group: 'site',
    keywords: 'truck trailer delivery transport road heavy haul module shipping',
    desc: 'A heavy-haul trailer brings a complete reactor module from the factory. The crane lifts the skid off the trailer and sets it in the silo.',
    specs: [
      ['Load', 'One module on its skid, ≈ 80 t'],
      ['Trailer', 'Lowboy, multi-axle'],
      ['Permits', 'Standard oversize-load route'],
      ['Factory to site', 'Days, not months'],
    ],
    explode: [6.0, 0, 0],
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
  'instruments', 'loop', 'pcu', 'cooler', 'switchyard', 'txline', 'dcsub',
  'dchall', 'racks', 'ups', 'bess', 'gens', 'dccool', 'crane', 'truck', 'skid',
];
