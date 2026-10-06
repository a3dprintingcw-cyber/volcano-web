// Volcano Street Food menu, transcribed from the printed menu (October 2026).
// Prices are in guilders (XCG). This file only seeds the database: once the
// site is live, prices and availability are edited on the admin page.

const one = (name, choices, { required = true } = {}) => ({
  name,
  min: required ? 1 : 0,
  max: 1,
  choices: choices.map((c) => (typeof c === 'string' ? { name: c, price: 0 } : c)),
});

const pick = (name, n, choices) => ({
  name,
  min: n,
  max: n,
  choices: choices.map((c) => ({ name: c, price: 0 })),
});

// Upgrades listed on the menu. Offered on Basics and Mix Platters.
const upgrades = () => [
  one('Fries', [{ name: 'Upgrade to Cajun fries', price: 3 }], { required: false }),
  one(
    'Style',
    [
      { name: 'Upgrade to Kapsalon', price: 4 },
      { name: 'Upgrade to Loaded', price: 4 },
      { name: 'Upgrade to Spanish style', price: 4 },
    ],
    { required: false }
  ),
];

// Basics come as Regular / Large, and as Plain in both sizes.
const basic = (name, [regular, large, plainRegular, plainLarge], extra = {}) => ({
  name,
  price: 0,
  ...extra,
  groups: [
    one(
      'Size',
      [
        regular != null && { name: 'Regular', price: regular },
        large != null && { name: 'Large', price: large },
        plainRegular != null && { name: 'Plain, regular', price: plainRegular },
        plainLarge != null && { name: 'Plain, large', price: plainLarge },
      ].filter(Boolean)
    ),
    ...(extra.groups || []),
    ...upgrades(),
  ],
});

const BASIC_MEATS = ['Chicken', 'Porkchop', 'Wings', 'Ribs', 'Chorizo'];
const PREMIUM_MEATS = ['Lomitu', 'Shrimp', 'Karko', 'Rib-eye', 'Picanha'];

const mix = (tier, n, price, meats, extra = {}) => ({
  name: `${tier} Mix ${n}`,
  desc: `Choose ${n}: ${meats.join(', ').toLowerCase()}`,
  price,
  ...extra,
  groups: [pick(`Choose ${n}`, n, meats), ...upgrades()],
});

const sized = (name, regular, large, extra = {}) => ({
  name,
  price: 0,
  ...extra,
  groups: [
    one('Size', [
      { name: 'Regular', price: regular },
      { name: 'Large', price: large },
    ]),
  ],
});

export const menu = [
  {
    slug: 'burgers',
    name: 'Burgers',
    items: [
      { name: 'Double Stacker', price: 30, image: 'burger', desc: 'Two patty, double cheese, bacon, caramelized onion & volcano sauce' },
      { name: 'Single Slam Burger', price: 28, desc: 'One patty, double cheese, bacon, caramelized onion & volcano sauce' },
      { name: "Mac 'N Cheese Burger", price: 28, desc: 'Mac & cheese, one patty, tomato, lettuce & burger sauce' },
      { name: 'BLTC Smashed Burger', price: 28, desc: 'Caramelized onions, one patty, bacon, tomato, lettuce & burger sauce' },
      { name: 'Crispy Chicken Burger', price: 28, desc: 'Crispy chicken, cole slaw, pickles & lava sauce' },
    ],
  },
  {
    slug: 'loaded',
    name: 'Loaded',
    items: [
      { name: 'Philly Cheese Steak Loaded', price: 28, image: 'philly-loaded', desc: 'Fries, rib-eye steak, cheese, onions, paprika & volcano sauce' },
      { name: 'Shrimps Loaded', price: 28, image: 'shrimps-loaded', desc: 'Fries, shrimps, bacon, cheese & volcano sauce' },
      { name: 'Chopped Cheese Loaded', price: 28, desc: 'Fries, burger patty chopped, cheese, bacon & volcano sauce' },
      {
        name: 'Chicken Loaded',
        price: 22,
        image: 'chicken-loaded',
        desc: 'Fries, chicken, cheese, pico de gallo & volcano sauce',
        groups: [one('Chicken', ['Grilled', 'Birria'])],
      },
      { name: "Chick'n Crisp Bowl", price: 26, image: 'crisp-bowl', desc: 'Salad, fries, cheese, crispy chicken & lava sauce' },
      { name: 'Porkchop Spanish Style Loaded', price: 24, image: 'porkchop-spanish', desc: 'Fries, mozzarella cheese, volcano sauce, onions & pepper' },
    ],
  },
  {
    slug: 'tacos',
    name: 'Tacos',
    items: [
      { name: 'Surf & Turf Tacos', price: 30, desc: '3 pcs shrimps & rib-eye taco, guacamole, pico de gallo & volcano sauce' },
      { name: 'Taco Trio', price: 28, image: 'taco-trio', desc: '1 pc grilled chicken taco, 1 pc beef taco & 1 pc shrimp taco' },
      { name: 'Beef Tacos', price: 30, desc: '3 pcs beef taco, guacamole, pico de gallo & volcano sauce' },
      { name: 'Shrimp Tacos', price: 30, desc: '3 pcs shrimp tacos, guacamole, pico de gallo & volcano sauce' },
      {
        name: 'Chicken Tacos',
        price: 22,
        desc: '3 pcs chicken tacos, guacamole, pico de gallo & volcano sauce',
        groups: [one('Chicken', ['Crispy', 'Grilled', 'Birria'])],
      },
    ],
  },
  {
    slug: 'kapsalon-and-more',
    name: 'Kapsalon & more',
    items: [
      { name: 'Cheese Steak Kapsalon', price: 28, desc: 'Fries, cheese, rib-eye, lettuce & garlic' },
      { name: 'Chicken Kapsalon', price: 24, desc: 'Fries, cheese, grilled chicken, lettuce & garlic' },
      { name: 'Lomitu Kapsalon', price: 32, desc: 'Fries, cheese, tenderloin, lettuce & garlic' },
      {
        name: 'Bucket of Bones',
        price: 28,
        desc: 'Ribs & wings with fries, salad or corn',
        groups: [one('Side', ['Fries', 'Salad', 'Corn'])],
      },
      {
        name: 'Surf & Turf Plater',
        price: 42,
        desc: 'Picanha or lomito, with shrimp',
        groups: [one('Meat', ['Picanha', 'Lomito'])],
      },
      {
        name: 'Nachos',
        price: 25,
        image: 'nachos',
        desc: 'With grilled or birria chicken, chopped cheese, lomitu or rib-eye',
        groups: [
          one('Topping', [
            'Grilled chicken',
            'Birria chicken',
            { name: 'Chopped cheese', price: 3 },
            { name: 'Lomitu', price: 3 },
            { name: 'Rib-eye', price: 3 },
          ]),
        ],
      },
    ],
  },
  {
    slug: 'basics',
    name: 'Basics',
    note: 'Regular, large or plain. Upgrade to Cajun fries, Kapsalon, Loaded or Spanish style.',
    items: [
      basic('Chicken', [20, 29, 18, 27]),
      basic('Wings', [20, 30, 18, 28], { groups: [one('Flavor', ['Teriyaki', 'Lemon pepper'])] }),
      basic('Porkchop', [21, 30, 19, 28], { image: 'porkchop-plate' }),
      basic('Ribs', [23, 32, 21, 30]),
      basic('Chorizo', [23, 31, 21, 29]),
      basic('Shrimps', [26, 35, 24, 33]),
      basic('Lomitu', [28, 37, 26, 35], { desc: 'Tenderloin', image: 'steak-fries' }),
      basic('Karko', [null, 36, null, 34], { desc: 'Conch' }),
      basic('Picanha', [null, 39, null, 37]),
    ],
  },
  {
    slug: 'mix-platters',
    name: 'Mix platters',
    items: [
      mix('Basic', 2, 35, BASIC_MEATS, { image: 'mix-platter' }),
      mix('Basic', 3, 45, BASIC_MEATS),
      mix('Basic', 4, 50, BASIC_MEATS),
      mix('Premium', 2, 55, PREMIUM_MEATS),
      mix('Premium', 3, 65, PREMIUM_MEATS),
      mix('Premium', 4, 75, PREMIUM_MEATS),
    ],
  },
  {
    slug: 'sides',
    name: 'Sides',
    items: [
      sized('French Fries', 8, 14, { image: 'french-fries' }),
      sized('Cajun Fries', 11, 17, { image: 'cajun-fries' }),
      { name: 'Mac & Cheese', price: 8, image: 'mac-cheese', desc: 'Topped with bacon' },
      { name: 'Salad', price: 8, image: 'salad' },
      sized('Crispy Corn', 7, 12, { image: 'crispy-corn' }),
    ],
  },
  {
    slug: 'beverages',
    name: 'Beverages',
    items: [
      { name: 'Water', price: 4 },
      { name: 'Arizona', price: 4, groups: [one('Flavor', ['Watermelon', 'Punch', 'Lemon'])] },
      { name: 'Soda', price: 5, groups: [one('Choice', ['Cola', 'Fria', 'Sprite', 'Royal Club Ginger Ale'])] },
      { name: 'Fresh Juice', price: 6, groups: [one('Flavor', ['Lemon', 'Punch', 'Kiwi punch', 'Passion fruit'])] },
      { name: 'Beer & Smirnoff', price: 7, alcohol: true, groups: [one('Choice', ['Amstel Bright', 'Heineken', 'Smirnoff'])] },
      { name: 'Cocktail', price: 18, alcohol: true, image: 'cocktail', groups: [one('Choice', ['El Volcanico', 'Eruption', 'Explosion'])] },
      { name: 'Frozen', price: 20, image: 'frozen', groups: [one('Alcohol', [{ name: 'Add alcohol', price: 5, alcohol: true }], { required: false })] },
    ],
  },
];

// ---------- customising a dish ----------
// What a customer can ask to leave off each dish, taken from its ingredients on the menu.
export const REMOVABLE = {
  'Double Stacker': ['Cheese', 'Bacon', 'Caramelized onion', 'Volcano sauce'],
  'Single Slam Burger': ['Cheese', 'Bacon', 'Caramelized onion', 'Volcano sauce'],
  "Mac 'N Cheese Burger": ['Tomato', 'Lettuce', 'Burger sauce'],
  'BLTC Smashed Burger': ['Caramelized onions', 'Bacon', 'Tomato', 'Lettuce', 'Burger sauce'],
  'Crispy Chicken Burger': ['Cole slaw', 'Pickles', 'Lava sauce'],
  'Philly Cheese Steak Loaded': ['Cheese', 'Onions', 'Paprika', 'Volcano sauce'],
  'Shrimps Loaded': ['Bacon', 'Cheese', 'Volcano sauce'],
  'Chopped Cheese Loaded': ['Cheese', 'Bacon', 'Volcano sauce'],
  'Chicken Loaded': ['Cheese', 'Pico de gallo', 'Volcano sauce'],
  "Chick'n Crisp Bowl": ['Salad', 'Cheese', 'Lava sauce'],
  'Porkchop Spanish Style Loaded': ['Mozzarella cheese', 'Volcano sauce', 'Onions', 'Pepper'],
  'Surf & Turf Tacos': ['Guacamole', 'Pico de gallo', 'Volcano sauce'],
  'Beef Tacos': ['Guacamole', 'Pico de gallo', 'Volcano sauce'],
  'Shrimp Tacos': ['Guacamole', 'Pico de gallo', 'Volcano sauce'],
  'Chicken Tacos': ['Guacamole', 'Pico de gallo', 'Volcano sauce'],
  'Cheese Steak Kapsalon': ['Cheese', 'Lettuce', 'Garlic'],
  'Chicken Kapsalon': ['Cheese', 'Lettuce', 'Garlic'],
  'Lomitu Kapsalon': ['Cheese', 'Lettuce', 'Garlic'],
};

// Dishes served on fries, where the menu's "upgrade to Cajun fries" applies.
export const CAJUN_UPGRADE = [
  'Philly Cheese Steak Loaded',
  'Shrimps Loaded',
  'Chopped Cheese Loaded',
  'Chicken Loaded',
  "Chick'n Crisp Bowl",
  'Porkchop Spanish Style Loaded',
  'Cheese Steak Kapsalon',
  'Chicken Kapsalon',
  'Lomitu Kapsalon',
];

// These were added after the first menu load, so they are also applied to the live
// database by migrations/0005_customise.sql (generated by scripts/build-customise.mjs).
for (const item of menu.flatMap((c) => c.items)) {
  item.groups = item.groups || [];
  if (CAJUN_UPGRADE.includes(item.name)) {
    item.groups.push({ ...one('Fries', [{ name: 'Upgrade to Cajun fries', price: 3 }], { required: false }), added: true });
  }
  if (REMOVABLE[item.name]) {
    const choices = REMOVABLE[item.name].map((name) => ({ name: `No ${name.toLowerCase()}`, price: 0 }));
    item.groups.push({ name: 'Leave out', min: 0, max: choices.length, choices, added: true });
  }
}

export const settings = {
  restaurant_name: 'Volcano Street Food',
  phone: '+599 9 565 2266',
  timezone_offset_minutes: -240, // Curaçao is UTC-4 all year
  // Opening hours per weekday, 0 = Sunday. null = closed. Minutes after midnight.
  hours: {
    0: { open: 18 * 60, close: 24 * 60 },
    1: null,
    2: { open: 18 * 60, close: 24 * 60 },
    3: { open: 18 * 60, close: 24 * 60 },
    4: { open: 18 * 60, close: 24 * 60 },
    5: { open: 18 * 60, close: 24 * 60 },
    6: { open: 18 * 60, close: 24 * 60 },
  },
  prep_minutes: 20,
  last_order_minutes_before_close: 15,
  ordering_paused: false,
  paused_message: '',
};
