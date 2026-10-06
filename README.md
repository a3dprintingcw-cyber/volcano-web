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
src/         the backend: worker.js (API), hours.js (opening hours and pickup slots), sentoo.js (online payment), push.js (phone notifications)
migrations/  database setup, applied once and in order: tables, then the menu
db/          seed.sql, the menu as SQL (generated from menu/menu.mjs)
menu/        menu.mjs: the menu as transcribed from the printed menu
scripts/     build-seed.mjs turns menu.mjs into db/seed.sql. mock-sentoo.mjs stands in for Sentoo locally
test/        price, opening-hours and payment tests
```

## What each side can do

Customers:
- Browse the menu one section at a time, add dishes with their choices, and check out for pickup.
- See the current wait time, which the kitchen sets.
- Follow the order live. The page chimes, vibrates and changes its title when the food is ready.
- Get a notification on their phone when the food is ready, even with the site closed (one tap on the order page to allow it). On iPhone this needs the site on the home screen first.
- Cancel their own order until the kitchen starts cooking (two taps). Orders already paid online have to be cancelled by phone, because of the refund.
- "Order the same again" with one tap on their next visit.
- Add the site to their phone's home screen, where it opens like an app.

Kitchen (staff PIN):
- Live board with New, Cooking and Ready for pickup. The browser tab shows how many new orders are waiting.
- Wait time control (plus and minus 5 minutes) for busy moments.
- Print a ticket, mark paid, cancel, pause online orders. Marking an order ready notifies the customer by itself.

Owner (manager PIN):
- Sales today, the last 7 days and best sellers of the last 30 days.
- Prices, sold-out switches, opening hours and settings.

Behind the scenes:
- Every 10 minutes the server closes online payments that were started and abandoned.
- Security headers on every page (`public/_headers`): the site loads nothing from other websites and cannot be framed.

## How ordering works

- Prices are always calculated on the server from the database. The browser only sends item ids and choices.
- Orders are for the same day. Before opening, customers can pre-order for tonight. While open, they can choose "as soon as possible" or a 15 minute slot.
- Online orders stop 15 minutes before closing. Preparation time is 20 minutes. Both can be changed on the admin page.
- Customers pay at pickup, or online through Sentoo when that is set up (see below). The kitchen marks pickup payments as paid on the board.
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

The site is connected to this repository in Cloudflare (Workers & Pages, Workers Builds). Every push to `main` builds and publishes it with:

```
npm run deploy     # applies new database migrations, then publishes the Worker
```

The database is the D1 database named `volcano`. Its id is in `wrangler.jsonc`.

To publish by hand from your own computer instead: `npx wrangler login`, then `npm run deploy`.

A custom domain can be attached later in the Cloudflare dashboard under the Worker's Settings, Domains and Routes.

### Staff access

Set the two PINs and a session secret once, in the Cloudflare dashboard under the Worker's Settings, Variables and Secrets (type: Secret), or from the command line. They are stored encrypted by Cloudflare and are never in this repository.

```
npx wrangler secret put STAFF_PIN        # for the kitchen board
npx wrangler secret put ADMIN_PIN        # for prices, hours and settings
npx wrangler secret put SESSION_SECRET   # any long random text
```

Use at least 6 digits for the staff PIN and a longer one for the manager PIN. After 8 wrong PINs from one network, sign-in is locked for 15 minutes. Changing `SESSION_SECRET` signs everyone out.

## Online payment (Sentoo)

Online payment switches on by itself once the two Sentoo details are set. Without them the site offers pay at pickup only.

1. In the Cloudflare dashboard, open the `volcano-web` Worker, then Settings, then Variables and Secrets. Add both as type Secret:
   - `SENTOO_MERCHANT_ID`: the merchant id from the Sentoo portal
   - `SENTOO_SECRET`: the merchant secret from the Sentoo portal
2. In the Sentoo portal (sandbox: https://portal.sandbox.sentoo.io), on the merchant edit page:
   - add the site's hostname as an allowed hostname for the return URL, for example `volcano-web.a3dprinting.workers.dev`
   - set the Payment status URL (webhook) to `https://<site>/api/sentoo/webhook`

`SENTOO_ENV` in `wrangler.jsonc` chooses the Sentoo system: `sandbox` (test payments, no real money) or `production`. While it is `sandbox`, the checkout, the order page and the kitchen board all say the payment is a test.

How it works:

- An order paid online is created as `awaiting_payment` and is not shown to the kitchen. The customer is sent to Sentoo's payment page.
- Sentoo sends the customer back to the order page and calls the webhook. Neither is trusted for the result: the server asks Sentoo's status API, and only that answer marks an order paid and releases it to the kitchen. Changing `attempt=` in the address does nothing.
- A rejected or cancelled attempt keeps the same Sentoo link, so the customer can try again. If the payment expires (30 minutes) or is cancelled at Sentoo, the order is cancelled.
- Sentoo allows 10 status lookups per transaction per hour. The server spaces its lookups to stay under that, however often the browser asks.
- Refunds are made in the Sentoo portal. A cancelled order that was paid online is flagged on the kitchen board.

Going live: Sentoo requires its test scenarios (TC001 to TC005 in their documentation) to be run in the sandbox and confirmed through their review form before they issue production details. After that, replace the two secrets with the production ones and set `SENTOO_ENV` to `production`.

To try it locally without a Sentoo account, run `node scripts/mock-sentoo.mjs` and use the Sentoo lines from `.dev.vars.example`.

## Changing the menu

Day to day, use `/admin/`: change prices, and switch items or single choices off when they sell out.

To add or remove dishes, edit `menu/menu.mjs`, then run `npm run menu:reload:remote`. This reloads the whole menu from the file, so prices changed on the admin page go back to what the file says. Orders and settings are kept.

Photos live in `public/img/` as `name-420.webp` (list) and `name-900.webp` (detail). The `image` field of a dish in `menu.mjs` is that name.

## Fonts

Bowlby One and Barlow are served from `public/fonts/`. Both are under the SIL Open Font License.
