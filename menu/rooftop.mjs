// Volcano Experience (the rooftop) sushi menu, transcribed from the menu board (November 2026).
// Prices are in guilders (XCG), 9% tax included. This file only seeds the database:
// once live, prices and availability are edited on the admin page.
//
// The rooftop menu is kept apart from the street food menu on purpose:
//   - its rows use their own id range (categories from 101, items, groups from 10001, options from 100001)
//   - "npm run menu:reload:remote" (street food) never touches these rows, and
//     "npm run rooftop:reload:remote" never touches the street food rows.

// Every roll can get extra toppings, XCG 10 each (as on the menu board).
const toppings = () => ({
  name: 'Extra topping',
  min: 0,
  max: 4,
  choices: ['Shrimp tempura mix', 'Tuna tempura mix', 'Salmon tempura mix', 'Crab & seaweed mix'].map((name) => ({ name, price: 10 })),
});

const roll = (name, price, desc) => ({ name, price, desc, groups: [toppings()] });

export const rooftopMenu = [
  {
    slug: 'appetizer',
    name: 'Appetizer',
    items: [
      { name: 'Wakame salad (vegetarian)', price: 9.99, desc: 'Japanese seasoned seaweed' },
      { name: 'Marine salad', price: 16.99, desc: 'Crab, seaweed, mayo, cured fish roe' },
      { name: 'Ikasansai salad (cooked)', price: 15.99, desc: 'Japanese seasoned squid with mountain vegetables' },
      { name: 'Neptune salad (raw)', price: 24, desc: 'Salmon, tuna, crab, seaweed, cured fish roe, sesame, spicy mayo' },
      { name: 'Gyoza beef (cooked)', price: 12, desc: '5 pieces deep fried beef dumpling' },
      { name: 'Gyoza shrimp (cooked)', price: 12, desc: '5 pieces deep fried shrimp dumpling' },
      { name: 'Ebi fried (cooked)', price: 22, desc: '5 pieces deep fried jumbo shrimp in Japanese-style breadcrumbs' },
      { name: 'Sake fried (cooked)', price: 24, desc: '5 pieces deep fried salmon in Japanese-style breadcrumbs' },
      { name: 'Salmon sashimi (raw)', price: 15.99, desc: '3 pieces perfect-cutting premium salmon' },
      { name: 'Tuna sashimi (raw)', price: 15.99, desc: '3 pieces perfect-cutting premium tuna' },
      { name: 'Salmon nigiri (raw)', price: 18.5, desc: '3 pieces hand-pressed sushi, premium salmon and sushi rice' },
      { name: 'Tuna nigiri (raw)', price: 18.5, desc: '3 pieces hand-pressed sushi, premium tuna and sushi rice' },
      { name: 'Unagi nigiri (cooked)', price: 20, desc: '3 pieces hand-pressed sushi, eel and sushi rice' },
      { name: 'Kappamaki (vegetarian)', price: 15, desc: '8 pieces tiny cucumber sushi roll' },
      { name: 'Tekka maki (raw)', price: 15, desc: '8 pieces tiny tuna sushi roll' },
      { name: 'Hosomaki salmon', price: 15, desc: '8 pieces tiny salmon sushi roll' },
    ],
  },
  {
    slug: 'famous-rolls',
    name: 'Famous Rolls',
    note: 'Each roll is 10 pieces',
    items: [
      roll('California Roll', 20, 'Crab, avocado, cucumber, cured fish roe, sesame'),
      roll('Alaska Roll (raw)', 24, 'Fresh salmon, avocado, cream cheese, sesame'),
      roll('Spicy Tuna Roll (raw)', 24, 'Fresh tuna, scallion, cured fish roe, spicy sauce, sesame'),
      roll('Ebiten Roll (cooked)', 22, 'Tempura fried shrimp, avocado, cream cheese, sesame'),
      roll('Dynamite Roll', 22, 'Spicy crab, avocado, cured fish roe, sesame'),
      roll('Vegie Roll (vegetarian)', 20, 'Avocado, cucumber, seaweed, cream cheese, sesame'),
    ],
  },
  {
    slug: 'tempura-fried-rolls',
    name: 'Tempura Fried Rolls',
    note: 'Each roll is 12 pieces',
    items: [
      roll('Tempura Tokyo Roll (cooked)', 32, 'Tempura fried shrimp, crab, cream cheese, topped with shrimp tempura mix, sweet eel sauce'),
      roll('Tempura Yummy Roll (cooked)', 32, 'Tempura fried shrimp, crab, cream cheese, topped with tuna tempura mix, garlic sauce & honey mustard'),
      roll('Tempura Superstar Roll (cooked)', 32, 'Tempura fried shrimp, plantain, cream cheese, topped with salmon cream mix, seaweed, sweet eel sauce'),
      roll('Tempura Crab Roll', 32, 'Fried outside, cured inside. Crab salad, cured fish roe, avocado, cream cheese, topped with salmon tempura mix, teriyaki sauce'),
      roll('Tempura Fuji Roll', 32, 'Fried outside, cured inside. Smoked salmon, tempura crab, avocado, cream cheese, scallion, topped with sweet chili shrimp'),
      roll('Tempura Sakura Roll', 32, 'Fried outside, raw inside. Fresh salmon, avocado, cucumber, seaweed, cream cheese, sesame'),
      roll('Tempura Tiger Special Roll (cooked)', 32, 'Cooked salmon, avocado, cream cheese, topped with shrimp tempura mix, sweet eel sauce'),
      roll('Tempura Tiger Roll', 28, 'Fried outside, raw inside. Fresh salmon, cured fish roe, avocado, cream cheese, sweet eel sauce'),
      roll('Tempura Dragon Roll', 28, 'Fried outside, raw inside. Fresh salmon, spicy crab, avocado, cream cheese, sweet eel sauce'),
    ],
  },
  {
    slug: 'signature-rolls',
    name: 'Signature Rolls',
    note: 'Each roll is 10 pieces',
    items: [
      roll('Latin Roll (cooked)', 26, 'Tempura fried shrimp, avocado, cream cheese, sesame, plantain fried on top, eel sauce'),
      roll('Vivid Sunset Roll', 30, 'Fresh salmon, eel, crab, avocado, sesame, cured fish roe all around'),
      roll('Sumo Roll (raw)', 36, 'Fresh salmon, eel, avocado, cream cheese, cured fish roe, sesame, topped with shrimp tempura mix'),
      roll('Aburi Lava Roll (cooked)', 36, 'Tempura fried shrimp, crab, torched salmon with spicy mayo on top, sweet eel sauce'),
      roll('Unagi California Roll (cooked)', 60, 'Crab, avocado, cucumber, sesame, tender chunky kabayaki eel on top, sweet eel sauce'),
      roll('Futo Maki (cooked)', 36, 'Stunning huge sushi roll filled with crab, eel, tamago omelet, avocado, seaweed, cucumber'),
      roll('Kaiyo Roll (raw)', 32, 'No rice. Chunky premium fresh salmon, crab salad, avocado, cured fish roe, sesame, spicy mayo'),
    ],
  },
];

// Rooftop settings, kept in the settings table under the key "rooftop".
// Anything not set here falls back to the street food settings (time zone, phone, ...).
export const rooftopSettings = {
  hours: {
    0: { open: 18 * 60, close: 23 * 60 },
    1: null,
    2: { open: 18 * 60, close: 23 * 60 },
    3: { open: 18 * 60, close: 23 * 60 },
    4: { open: 18 * 60, close: 23 * 60 },
    5: { open: 18 * 60, close: 23 * 60 },
    6: { open: 18 * 60, close: 23 * 60 },
  },
  prep_minutes: 20,
  last_order_minutes_before_close: 15,
  // Starts paused, so no order arrives before the rooftop board and printer are set up.
  // Switch it on in the manager page (Experience, Hours and ordering).
  ordering_paused: true,
  paused_message: 'Online ordering for the rooftop opens soon. Order at the rooftop bar for now.',
};
