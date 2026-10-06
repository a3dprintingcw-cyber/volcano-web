// Checks that the backend charges exactly what the printed menu says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { menu as source } from '../menu/menu.mjs';
import { priceLines } from '../src/worker.js';

// Build the menu in the shape the API uses, with the same ids the seed assigns.
let itemId = 0;
let optionId = 0;
let groupId = 0;
const menu = source.map((cat) => ({
  name: cat.name,
  items: cat.items.map((item) => ({
    id: ++itemId,
    name: item.name,
    price_cents: (item.price || 0) * 100,
    alcohol: !!item.alcohol,
    available: true,
    groups: (item.groups || []).map((g) => ({
      id: ++groupId,
      name: g.name,
      min: g.min,
      max: g.max,
      options: g.choices.map((c) => ({ id: ++optionId, name: c.name, price_cents: (c.price || 0) * 100, alcohol: !!c.alcohol, available: true })),
    })),
  })),
}));
const items = menu.flatMap((c) => c.items);
const find = (name) => items.find((i) => i.name === name);
const line = (name, choices = [], quantity = 1) => {
  const item = find(name);
  return {
    item_id: item.id,
    quantity,
    option_ids: choices.map(([group, option]) => item.groups.find((g) => g.name === group).options.find((o) => o.name === option).id),
  };
};
const price = (name, choices) => priceLines(menu, [line(name, choices)]).total / 100;

test('signature items cost what the menu says', () => {
  assert.equal(price('Double Stacker'), 30);
  assert.equal(price('Single Slam Burger'), 28);
  assert.equal(price('Chicken Loaded', [['Chicken', 'Birria']]), 22);
  assert.equal(price("Chick'n Crisp Bowl"), 26);
  assert.equal(price('Porkchop Spanish Style Loaded'), 24);
  assert.equal(price('Chicken Tacos', [['Chicken', 'Crispy']]), 22);
  assert.equal(price('Lomitu Kapsalon'), 32);
  assert.equal(price('Surf & Turf Plater', [['Meat', 'Picanha']]), 42);
  assert.equal(price('Nachos', [['Topping', 'Grilled chicken']]), 25);
  assert.equal(price('Nachos', [['Topping', 'Rib-eye']]), 28);
});

test('basics: regular, large and plain prices', () => {
  const table = {
    Chicken: [20, 29, 18, 27],
    Porkchop: [21, 30, 19, 28],
    Ribs: [23, 32, 21, 30],
    Chorizo: [23, 31, 21, 29],
    Shrimps: [26, 35, 24, 33],
    Lomitu: [28, 37, 26, 35],
  };
  for (const [name, [regular, large, plainRegular, plainLarge]] of Object.entries(table)) {
    assert.equal(price(name, [['Size', 'Regular']]), regular, name);
    assert.equal(price(name, [['Size', 'Large']]), large, name);
    assert.equal(price(name, [['Size', 'Plain, regular']]), plainRegular, name);
    assert.equal(price(name, [['Size', 'Plain, large']]), plainLarge, name);
  }
  assert.equal(price('Wings', [['Size', 'Large'], ['Flavor', 'Teriyaki']]), 30);
  assert.equal(price('Karko', [['Size', 'Large']]), 36);
  assert.equal(price('Karko', [['Size', 'Plain, large']]), 34);
  assert.equal(price('Picanha', [['Size', 'Large']]), 39);
  assert.equal(price('Picanha', [['Size', 'Plain, large']]), 37);
});

test('upgrades add 3 or 4', () => {
  assert.equal(price('Chicken', [['Size', 'Regular'], ['Fries', 'Upgrade to Cajun fries']]), 23);
  assert.equal(price('Lomitu', [['Size', 'Regular'], ['Fries', 'Upgrade to Cajun fries'], ['Style', 'Upgrade to Kapsalon']]), 35);
  assert.equal(price('Ribs', [['Size', 'Large'], ['Style', 'Upgrade to Spanish style']]), 36);
});

test('mix platters', () => {
  assert.equal(price('Basic Mix 2', [['Choose 2', 'Ribs'], ['Choose 2', 'Wings']]), 35);
  assert.equal(price('Basic Mix 3', [['Choose 3', 'Ribs'], ['Choose 3', 'Wings'], ['Choose 3', 'Chorizo']]), 45);
  assert.equal(price('Basic Mix 4', [['Choose 4', 'Ribs'], ['Choose 4', 'Wings'], ['Choose 4', 'Chorizo'], ['Choose 4', 'Chicken']]), 50);
  assert.equal(price('Premium Mix 2', [['Choose 2', 'Lomitu'], ['Choose 2', 'Shrimp']]), 55);
  assert.equal(price('Premium Mix 3', [['Choose 3', 'Lomitu'], ['Choose 3', 'Shrimp'], ['Choose 3', 'Picanha']]), 65);
  assert.equal(price('Premium Mix 4', [['Choose 4', 'Lomitu'], ['Choose 4', 'Shrimp'], ['Choose 4', 'Picanha'], ['Choose 4', 'Karko']]), 75);
});

test('sides and beverages', () => {
  assert.equal(price('French Fries', [['Size', 'Regular']]), 8);
  assert.equal(price('French Fries', [['Size', 'Large']]), 14);
  assert.equal(price('Cajun Fries', [['Size', 'Regular']]), 11);
  assert.equal(price('Cajun Fries', [['Size', 'Large']]), 17);
  assert.equal(price('Mac & Cheese'), 8);
  assert.equal(price('Salad'), 8);
  assert.equal(price('Crispy Corn', [['Size', 'Regular']]), 7);
  assert.equal(price('Crispy Corn', [['Size', 'Large']]), 12);
  assert.equal(price('Water'), 4);
  assert.equal(price('Arizona', [['Flavor', 'Watermelon']]), 4);
  assert.equal(price('Soda', [['Choice', 'Sprite']]), 5);
  assert.equal(price('Soda', [['Choice', 'Fria']]), 5);
  assert.equal(price('Fresh Juice', [['Flavor', 'Passion fruit']]), 6);
  assert.equal(price('Beer & Smirnoff', [['Choice', 'Heineken']]), 7);
  assert.equal(price('Cocktail', [['Choice', 'Eruption']]), 18);
  assert.equal(price('Frozen'), 20);
  assert.equal(price('Frozen', [['Alcohol', 'Add alcohol']]), 25);
});

test('quantities multiply and lines add up', () => {
  const result = priceLines(menu, [line('Double Stacker', [], 2), line('Water', [], 3)]);
  assert.equal(result.total, (60 + 12) * 100);
  assert.equal(result.alcohol, false);
});

test('alcohol is flagged', () => {
  assert.equal(priceLines(menu, [line('Cocktail', [['Choice', 'Eruption']])]).alcohol, true);
  assert.equal(priceLines(menu, [line('Frozen', [['Alcohol', 'Add alcohol']])]).alcohol, true);
  assert.equal(priceLines(menu, [line('Frozen')]).alcohol, false);
});

test('bad orders are refused', () => {
  assert.throws(() => priceLines(menu, []), /empty/);
  assert.throws(() => priceLines(menu, [line('Chicken')]), /Size/); // size is required
  assert.throws(() => priceLines(menu, [line('Basic Mix 2', [['Choose 2', 'Ribs']])]), /Choose 2/); // one meat short
  assert.throws(() => priceLines(menu, [line('Basic Mix 2', [['Choose 2', 'Ribs'], ['Choose 2', 'Wings'], ['Choose 2', 'Chorizo']])]), /Choose 2/);
  assert.throws(() => priceLines(menu, [{ ...line('Water'), quantity: 0 }]), /quantity/);
  assert.throws(() => priceLines(menu, [{ ...line('Water'), quantity: 500 }]), /quantity/);
  assert.throws(() => priceLines(menu, [{ item_id: 99999, quantity: 1, option_ids: [] }]), /no longer on the menu/);
  // an option that belongs to a different item
  const foreign = find('Chicken').groups[0].options[0].id;
  assert.throws(() => priceLines(menu, [{ ...line('Water'), option_ids: [foreign] }]), /not valid/);
  // two sizes at once
  const sizes = find('Chicken').groups[0].options.slice(0, 2).map((o) => o.id);
  assert.throws(() => priceLines(menu, [{ item_id: find('Chicken').id, quantity: 1, option_ids: sizes }]), /Size/);
});

test('sold out items are refused', () => {
  const copy = structuredClone(menu);
  copy.flatMap((c) => c.items).find((i) => i.name === 'Water').available = false;
  assert.throws(() => priceLines(copy, [line('Water')]), /sold out/);
});
