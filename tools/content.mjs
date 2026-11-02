// Written content for the static guide pages. Plain language, short sentences, no vendor claims.
// The 3D model is a representative design. Numbers are typical ranges for its class, not a product.

export const SITE = {
  url: 'https://microreactors.org/',
  name: 'Microreactors.org',
  tagline: 'How microreactors work, in interactive 3D',
  updated: process.env.SITE_UPDATED || new Date().toISOString().slice(0, 10),
};

export const OVERVIEW = {
  title: 'What is a microreactor?',
  description: 'A plain-language guide to microreactors: what they are, how a sodium-cooled 10 MWe plant works, how it powers a data center, how it stays safe, and how heat-pipe, gas-cooled, and molten-salt designs differ.',
  sections: [
    {
      h: 'The short answer',
      p: [
        'A microreactor is a small nuclear power plant. It makes up to about 20 megawatts of electricity, or about 50 megawatts of heat. A factory builds the reactor as one module. A truck, a train, or a ship delivers it to the site.',
        'The size changes how nuclear power gets built. A large plant takes a decade and a city-sized construction site. A microreactor arrives nearly complete, and the site work takes months. The plant can then sit next to the load it serves: a data center, a mine, a remote town, a military base, or a factory that needs heat.',
        'Most designs run for years without refueling. Many use high-assay low-enriched uranium, called HALEU, which holds between 5 and 20 percent uranium-235. The small core and the long fuel life let one or two operators oversee the plant, with a remote center watching too.',
      ],
    },
    {
      h: 'How the plant in the 3D model works',
      p: [
        'The model shows a representative sodium-cooled, pool-type microreactor of about 10 megawatts electric and 30 megawatts thermal. Sixty-one hexagonal fuel assemblies sit in a compact core about 1.2 meters across. A reflector ring around the core bounces neutrons back in, so a small core can sustain the chain reaction.',
        'Twelve control drums sit inside the reflector. Each drum has a neutron-absorbing face. Turned toward the core, the drum lowers power. Turned away, it raises power. Three shutdown rods hang above the core on electromagnets. If the magnets lose power, the rods drop by gravity and stop the reaction in under two seconds.',
        'Liquid sodium fills the reactor vessel. It enters the core at about 400 °C and leaves at about 550 °C. Sodium boils at 883 °C, so the vessel runs at near atmospheric pressure. Two electromagnetic pumps move the sodium with magnetic fields and no moving parts. If they stop, natural circulation keeps the sodium moving.',
        'Two intermediate heat exchangers pass the heat to a clean intermediate loop. That loop leaves the reactor vault and feeds the power conversion unit. A supercritical carbon dioxide turbine spins a generator and makes about 10 megawatts. Fans blow air across finned tubes to reject the waste heat. The plant uses no cooling water.',
        'The whole reactor module ships on one steel skid. A heavy-haul trailer brings it from the factory. A bridge crane lifts it into a concrete shield silo inside the reactor building. The silo gives radiation shielding, seismic protection, and a final barrier for sodium.',
      ],
    },
    {
      h: 'How it stays safe',
      p: [
        'The design relies on physics rather than on pumps, valves, or operators. The sodium pool is large, so it absorbs heat slowly. After shutdown, the fuel still makes a few percent of full power. Air ducts around the guard vessel let natural convection carry that heat up a chimney. This system has no pumps and no power supply, and it is always on.',
        'A second steel vessel, the guard vessel, surrounds the reactor vessel with a small argon-filled gap. If the inner vessel leaks, the guard vessel catches the sodium and keeps the core covered. Thick concrete and borated steel around the vessel absorb neutrons and gamma rays, so workers can approach the building while the reactor runs.',
        'Sodium reacts with water and air, so it stays inside sealed steel systems under an argon cover gas. The intermediate loop keeps radioactive sodium inside the reactor vault. Only clean fluid reaches the turbine hall.',
      ],
    },
    {
      h: 'How it powers a data center',
      p: [
        'A short 69 kV line on steel poles carries the plant output to a campus substation. Two transformers step the voltage down to 13.8 kV and feed the data hall through an underground duct bank. The hall holds about 320 racks and draws about 8 megawatts of IT load, plus cooling and losses.',
        'The reactor runs flat out all the time. Battery containers absorb or supply the difference as the load moves, and they can black-start the campus. UPS units ride through short dips. Two standby diesel generators cover the hall if the reactor or the line is out. With the reactor as prime power, they run only for tests.',
        'Rooftop dry coolers reject the heat the servers make. Like the reactor, the data center uses no cooling water.',
      ],
    },
    {
      h: 'Other kinds of microreactors',
      p: [
        'Not every microreactor uses liquid sodium in a pool. The demonstration park down the road shows three other designs at a basic level. A heat-pipe reactor has no pumps and no coolant loop at all. Sealed sodium heat pipes carry heat out of a solid core block. A gas-cooled reactor circulates helium through TRISO fuel, and this one stores heat in molten salt tanks like a thermal battery. A molten-salt reactor dissolves the fuel in the coolant itself and drains it to a safe tank if power fails.',
        'Each design trades one set of engineering problems for another. The reactor types page compares them side by side.',
      ],
    },
    {
      h: 'About this model',
      p: [
        'The 3D plant is a representative design for education. It does not describe a specific company or product. The values are typical of a 10 MWe class pool-type sodium-cooled microreactor and of a data center of about 8 MW. Regulators review every real design before it can operate, and real plants will differ in detail.',
        'You can cut the model open, explode it, search every part, run the start-up sequence, change the physics live, and walk the site on foot. The written guide lists every labeled component with its role and typical specifications.',
      ],
    },
  ],
};

export const FAQ = [
  ['What is a microreactor?', 'A microreactor is a small nuclear reactor that makes up to about 20 megawatts of electricity. A factory builds it as one module, and a truck can deliver it. Most designs run for years without refueling and use passive safety systems.'],
  ['How much power does a microreactor make?', 'Between about 1 and 20 megawatts of electricity. The plant in this model makes 10 megawatts electric from 30 megawatts of heat. That is enough for about 8,000 homes, or for one data hall of about 8 megawatts of IT load.'],
  ['How big is a microreactor?', 'The reactor vessel in the model is about 5.5 meters tall and 2.4 meters across. The module ships on one truck. The reactor building is about 18 by 12 meters, and the whole fenced site covers a few acres.'],
  ['What fuel does a microreactor use?', 'Most designs use high-assay low-enriched uranium, or HALEU, with less than 20 percent uranium-235. The sodium-cooled plant uses metal or oxide fuel pins in steel cladding. The gas-cooled and heat-pipe designs use TRISO particles, which wear ceramic coatings that hold fission products to above 1,600 °C.'],
  ['How often does a microreactor refuel?', 'The sodium-cooled model swaps its whole core every 5 to 10 years. The heat-pipe module runs about 8 years, then the whole module is replaced. The gas-cooled design in the park runs about 20 years on one core.'],
  ['Why use liquid sodium as a coolant?', 'Sodium conducts heat very well and stays liquid from 98 °C to 883 °C. The reactor can run hot at near atmospheric pressure, with no thick pressure vessel. Sodium reacts with water and air, so it stays in sealed steel systems under argon, and an intermediate loop keeps it out of the turbine hall.'],
  ['How is a microreactor controlled?', 'Rotating control drums in the reflector set the power. Each drum has a neutron-absorbing face. Turned toward the core, it lowers power; turned away, it raises power. The control system turns the drums on its own, and operators oversee it.'],
  ['What happens if the power fails?', 'The shutdown rods hang on electromagnets. When power is lost, they drop by gravity and stop the chain reaction in under two seconds. The sodium keeps moving by natural circulation. Air ducts around the vessel carry away the decay heat with no pumps and no power.'],
  ['Does a microreactor need cooling water?', 'No. The plant in the model rejects its waste heat with fans and finned tubes. The data center next door uses rooftop dry coolers. Neither uses cooling water.'],
  ['How does a microreactor power a data center?', 'A short 69 kV line carries the output to a campus substation. Transformers step it down to 13.8 kV for the hall. Batteries follow the load, UPS units ride through dips, and standby generators cover outages. The reactor runs flat out as prime power.'],
  ['What other kinds of microreactors exist?', 'Heat-pipe reactors move heat with sealed sodium pipes and have no pumps. Gas-cooled reactors circulate helium through TRISO fuel, often with molten salt heat storage. Molten-salt reactors dissolve the fuel in the coolant. The demonstration park in the model shows one of each.'],
  ['How many people run a microreactor?', 'The model assumes two operators and one security officer on shift, with a remote monitoring center. The reactor controls itself, so the control room is small.'],
  ['Is this 3D model a real product?', 'No. It is a representative, vendor-neutral design for education. The numbers are typical ranges for a 10 MWe class sodium-cooled microreactor and an 8 MW data center. Real plants will differ in detail, and regulators review each design before it operates.'],
];

export const GROUP_INTRO = {
  core: 'The core is where fission happens. It is small, about 1.2 meters across and 1 meter tall, and it makes about 30 megawatts of heat. These parts hold the fuel, reflect neutrons back in, set the power, and stop the reaction when needed.',
  primary: 'The primary system holds the core in a pool of liquid sodium at near atmospheric pressure. Pumps with no moving parts drive the sodium, heat exchangers hand the heat to a clean loop, and a second vessel catches any leak.',
  safety: 'Safety in this design comes from physics. Decay heat leaves by natural air flow with no pumps. Thick shielding lets workers approach the building. Sensors report on the core in real time, and the control system acts on them.',
  power: 'Heat leaves the reactor vault in a clean intermediate loop. A supercritical carbon dioxide turbine turns it into about 10 megawatts of electricity. Fans reject the waste heat, so the plant needs no cooling water.',
  site: 'The reactor module arrives on one truck and sets into a concrete silo inside a steel building. A small control building, a used fuel cask pad, and a bridge crane complete the site.',
  grid: 'A short line carries the output to the campus substation and a second circuit ties the plant to the regional grid. Transformers and switchgear protect the plant and let operators isolate it.',
  datacenter: 'The data hall is the load. It holds about 320 racks and draws about 8 megawatts. Batteries follow the load, UPS units ride through dips, standby generators cover outages, and rooftop coolers reject the heat.',
  heatpipe: 'The heat-pipe reactor in the park has no pumps and no coolant loop. Sealed sodium heat pipes carry heat out of a solid core block to an air turbine. The whole reactor ships inside one canister.',
  htgr: 'The gas-cooled reactor in the park circulates helium through TRISO fuel. Hot helium heats molten salt, and two tanks store the salt like a thermal battery, so the turbine can follow the data center while the reactor runs flat out.',
  msr: 'The molten-salt reactor in the park dissolves its fuel in the coolant. If power fails, a frozen plug melts and the fuel drains by gravity into a tank where it cannot stay critical.',
};

export const GROUP_META = {
  core: { slug: 'reactor-core', title: 'Reactor core: fuel, reflector, control drums, shutdown rods', short: 'Reactor core' },
  primary: { slug: 'sodium-primary-system', title: 'Sodium primary system: vessel, pool, pumps, heat exchangers', short: 'Primary system' },
  safety: { slug: 'safety-and-shielding', title: 'Safety and shielding: decay heat removal, shielding, instruments', short: 'Safety & shielding' },
  power: { slug: 'power-conversion', title: 'Power conversion: intermediate loop, turbine, dry cooling', short: 'Power conversion' },
  site: { slug: 'site-and-buildings', title: 'Site and buildings: reactor building, crane, truck, control room, casks', short: 'Site & structure' },
  grid: { slug: 'grid-connection', title: 'Grid connection: transmission line, substation, switchyard', short: 'Grid connection' },
  datacenter: { slug: 'data-center', title: 'The data center: hall, racks, UPS, batteries, generators, cooling', short: 'Data center' },
  heatpipe: { slug: 'heat-pipe-microreactor', title: 'Heat-pipe microreactor: how it works', short: 'Heat-pipe reactor' },
  htgr: { slug: 'gas-cooled-microreactor', title: 'Gas-cooled microreactor with salt storage: how it works', short: 'Gas-cooled reactor' },
  msr: { slug: 'molten-salt-microreactor', title: 'Molten-salt microreactor: how it works', short: 'Molten-salt reactor' },
};

export const TYPES = {
  title: 'Four kinds of microreactor, side by side',
  description: 'Sodium-cooled, heat-pipe, gas-cooled, and molten-salt microreactors compared: coolant, fuel, power, pressure, temperature, power cycle, refueling, and the safety feature each one leans on.',
  intro: [
    'The four plants in the 3D model use four different ways to move heat out of a small core. Each choice sets the pressure, the temperature, the fuel form, and the kind of safety case the design can make. The table lists the values the model uses. They are typical of each class, not a specific product.',
  ],
  cols: ['Sodium pool (main plant)', 'Heat pipe', 'Gas-cooled', 'Molten salt'],
  rows: [
    ['Coolant', 'Liquid sodium in a pool', 'Sodium inside sealed heat pipes', 'Helium gas', 'Fluoride salt that also carries the fuel'],
    ['Fuel', 'HALEU metal or oxide pins in steel cladding', 'TRISO compacts in a solid block', 'TRISO particles', 'Uranium dissolved in the salt'],
    ['Thermal power', '≈ 30 MWt', '≈ 15 MWt', '≈ 15 MWt', '≈ 30 MWt'],
    ['Electric output', '≈ 10 MWe', '≈ 5 MWe', '≈ 5 MWe', '≈ 10 MWe'],
    ['Pressure', 'Near atmospheric', 'Near atmospheric', '≈ 7 MPa', 'Near atmospheric'],
    ['Core outlet temperature', '≈ 550 °C', '≈ 650 °C', '≈ 630 °C', '≈ 650 °C'],
    ['Power cycle', 'Supercritical CO₂ Brayton', 'Open-air Brayton', 'Steam Rankine with salt storage', 'Steam Rankine'],
    ['Refueling', 'Whole-core swap every 5 to 10 years', 'Swap the module after about 8 years', 'About 20 years on one core', 'Fuel salt adjusted on line'],
    ['Moving parts in the core loop', 'Electromagnetic pumps, no impellers', 'None', 'One helium circulator', 'One fuel-salt pump'],
    ['Signature safety feature', 'Natural-draft air cooling of the vessel', 'Heat leaves by conduction, no coolant to lose', 'Fuel coatings hold fission products above 1,600 °C', 'Freeze plug drains the fuel to a safe tank'],
    ['Where in the model', 'Main plant, powering the data center', 'Park plot A, canister open', 'Park plot B, with two salt tanks', 'Park plot C, reactor cell'],
  ],
  outro: [
    'The sodium pool and the molten-salt designs run hot at low pressure, so they avoid a thick pressure vessel. The gas-cooled design accepts high pressure in return for an inert coolant that cannot boil. The heat-pipe design removes pumps and valves from the core entirely, at the cost of lower power per module.',
    'All four reject their waste heat to air. None of them needs cooling water.',
  ],
};
