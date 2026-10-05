# Volcano Street Food: ordering website

Pickup ordering for Volcano Street Food. Customers order in the browser, the kitchen sees orders on a live board, and staff manage the menu and opening hours themselves. It replaces the Android app.

Everything runs on Cloudflare: one Worker serves the website and the API, and a D1 database holds the menu and the orders.

## What is in here

| Page | Address | Who it is for |
| --- | --- | --- |
| Ordering site | `/` | Customers: menu, choices, cart, checkout |
| Order status | `/order?id=…` | Customers: order number and live status |
| Kitchen board | `/kitchen/` | Staff: new, cooking and ready orders (staff PIN) |
| Menu and hours | `/admin/` | Sold-out switches with the staff PIN. Prices, hours and settings with the manager PIN |

```
public/      the website (plain HTML, CSS and JavaScript, no build step)
src/         the backend: worker.js (API) and hours.js (opening hours and pickup slots)
db/          schema.sql (tables) and seed.sql (the menu, generated)
menu/        menu.mjs: the menu as transcribed from the printed menu
scripts/     build-seed.mjs turns menu.mjs into db/seed.sql
test/        price and opening-hours tests
```

## How ordering works

- Prices are always calculated on the server from the database. The browser only sends item ids and choices.
- Orders are for the same day. Before opening, customers can pre-order for tonight. While open, they can choose "as soon as possible" or a 15 minute slot.
- Online orders stop 15 minutes before closing. Preparation time is 20 minutes. Both can be changed on the admin page.
- Payment is at pickup. The kitchen marks an order paid on the board. An online payment provider (Sentoo) can be added later: orders already carry a `payment_method` and `payment_status`.
- Orders with alcohol ask the customer to confirm they are 18 or older.
- Times use Curaçao time (UTC-4), whatever the customer's phone is set to.

## Run it on your computer

Needs Node.js 20 or newer.

```
npm install
cp .dev.vars.example .dev.vars     # then choose your own PINs in .dev.vars
npm run db:setup:local             # creates the local database and loads the menu
npm run dev                        # http://localhost:8787
npm test                           # checks prices against the menu and the opening hours logic
```

## Put it online (Cloudflare)

You need a free Cloudflare account. From this folder:

```
npx wrangler login                 # opens Cloudflare in your browser
npx wrangler d1 create volcano     # prints a database_id
```

Paste that `database_id` into `wrangler.jsonc` where the comment says so. Then:

```
npm run db:setup:remote            # creates the tables and loads the menu
npx wrangler deploy                # puts the site online
```

The site is then live at `https://volcano-web.<your-account>.workers.dev`. A custom domain can be attached later in the Cloudflare dashboard under the Worker's Settings, Domains and Routes.

### Staff access

Set the two PINs and a session secret once. They are stored encrypted by Cloudflare and are never in this repository.

```
npx wrangler secret put STAFF_PIN        # for the kitchen board
npx wrangler secret put ADMIN_PIN        # for prices, hours and settings
npx wrangler secret put SESSION_SECRET   # any long random text
```

Use at least 6 digits for the staff PIN and a longer one for the manager PIN. After 8 wrong PINs from one network, sign-in is locked for 15 minutes. Changing `SESSION_SECRET` signs everyone out.

## Changing the menu

Day to day, use `/admin/`: change prices, and switch items or single choices off when they sell out.

To add or remove dishes, edit `menu/menu.mjs`, then run `npm run db:setup:remote`. This reloads the whole menu from the file, so prices changed on the admin page go back to what the file says. Orders and settings are kept.

Photos live in `public/img/` as `name-420.webp` (list) and `name-900.webp` (detail). The `image` field of a dish in `menu.mjs` is that name.

## Fonts

Bowlby One and Barlow are served from `public/fonts/`. Both are under the SIL Open Font License.
