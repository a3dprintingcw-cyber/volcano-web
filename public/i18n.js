// All customer-facing wording, in English and Papiamento.
// To correct a translation, change the text in the "pap" list below. Nothing else needs to change.
// {curly} words are filled in by the site (a time, a price, a name): keep them as they are.
import { store } from '/shared.js';

const TEXT = {
  en: {
    'lang.switch': 'Papiamentu',
    'skip': 'Skip to the menu',
    'hero.sub': 'Order here, pick it up hot.',
    'hero.cta': 'See the menu',
    'hero.today': 'Today: {hours}',
    'hero.closed_today': 'Closed today',
    'hero.wait': 'Ready for pickup in about {n} minutes',
    'status.closed_now': 'Closed now',
    'status.orders_closed': 'Online orders closed',

    'avail.open_until': 'Open until {time}',
    'avail.opens_at': 'Opens at {time}. Order now and pick up tonight.',
    'avail.closed_today': 'Closed today. {next}',
    'avail.closed_tonight': 'Closed for tonight. {next}',
    'avail.closing': 'The kitchen is closing, so we have stopped taking online orders. {next}',
    'avail.paused': 'Online ordering is paused right now. Please check back soon.',
    'avail.next_tomorrow': 'We open again tomorrow at {time}.',
    'avail.next_day': 'We open again {day} at {time}.',
    'avail.next_none': 'Online ordering is closed.',

    'day.0': 'Sunday',
    'day.1': 'Monday',
    'day.2': 'Tuesday',
    'day.3': 'Wednesday',
    'day.4': 'Thursday',
    'day.5': 'Friday',
    'day.6': 'Saturday',
    'hours.range': '{open} to {close}',
    'hours.closed': 'Closed',

    'foot.about': 'About us',
    'foot.about_1': 'Bold street food, cooked fresh every day: burgers, loaded fries, tacos, kapsalon and plates from the grill.',
    'foot.about_2': 'Order here and pick it up, or come eat with us on the rooftop terrace.',
    'foot.veg': 'Ask for our vegetarian options.',
    'foot.find': 'Find us',
    'foot.maps': 'Open in Google Maps',
    'foot.hours': 'Opening hours',

    'menu.loading': 'Loading the menu…',
    'menu.retry': 'Try again',
    'menu.popular': 'Popular',
    'menu.popular_note': 'What people order most.',
    'menu.from': 'from',
    'menu.sold_out': 'Sold out',
    'menu.sold_out_short': '(sold out)',

    'item.optional': 'Optional',
    'item.choose_n': 'Choose {n}',
    'item.choose_one': 'Choose one',
    'item.note': 'Anything we should know?',
    'item.note_example': 'No onions, sauce on the side…',
    'item.quantity': 'Quantity',
    'item.less': 'One less',
    'item.more': 'One more',
    'item.close': 'Close',
    'item.missing_more': 'Choose {n} more',
    'item.missing': 'Choose {name}',
    'item.add': 'Add to order, {price}',

    'cart.added': 'Added: {item}',
    'cart.view': 'View your order',
    'cart.title': 'Your order',
    'cart.empty': 'Your order is empty. Pick something from the menu to get started.',
    'cart.note': 'Note: {note}',
    'cart.remove': 'Remove',
    'cart.total': 'Total',
    'cart.saved': 'Your order is saved on this device for when we are open.',
    'cart.asap': 'As soon as possible, about {n} minutes',
    'cart.details': 'Pickup details',
    'cart.time': 'Pickup time',
    'cart.name': 'Your name',
    'cart.phone': 'Phone number',
    'cart.phone_hint': 'So we can reach you about your order',
    'cart.kitchen_note': 'Note for the kitchen',
    'cart.age': 'I am 18 or older. I will show ID at pickup if asked.',
    'cart.payment': 'Payment',
    'cart.pay_online': 'Pay now online',
    'cart.pay_online_hint': 'With your bank or card, through Sentoo',
    'cart.pay_pickup': 'Pay at pickup',
    'cart.pay_test': 'Test mode: online payments are practice payments. No real money is charged.',
    'cart.pay_note': 'Pay when you pick up your order.',
    'cart.placing': 'Placing your order…',
    'cart.to_payment': 'Continue to payment, {price}',
    'cart.place': 'Place order, {price}',
    'cart.err_name': 'Please enter your name so we can call it out at pickup.',
    'cart.err_phone': 'Please enter a phone number we can reach you on.',
    'cart.err_age': 'Please confirm you are 18 or older to order alcohol.',
    'again.button': 'Order the same again: {items}',
    'again.more': ' and {n} more',
    'track.link': 'Follow your order #{n}',

    'order.back': 'Back to the menu',
    'order.finding': 'Finding your order…',
    'order.number': 'Order number',
    'order.for': 'for {name}',
    'order.new': 'We got your order',
    'order.new_detail': 'We will start cooking soon. Pick up around {time}.',
    'order.preparing': 'We are making your order',
    'order.preparing_detail': 'Pick up around {time}.',
    'order.ready': 'Ready for pickup',
    'order.ready_detail': 'Come and get it, {name}. Tell us your order number.',
    'order.done': 'Picked up',
    'order.done_detail': 'Enjoy your food, and thank you for ordering.',
    'order.cancelled': 'Order cancelled',
    'order.cancelled_you': 'You cancelled this order. Nothing is owed. You are welcome to order again.',
    'order.cancelled_other': 'This order was cancelled. Call us if that is a surprise.',
    'order.cancelled_payment': 'The payment was not completed in time, so this order was cancelled. Nothing was charged. You are welcome to order again.',
    'order.step_new': 'Received',
    'order.step_preparing': 'Cooking',
    'order.step_ready': 'Ready',
    'order.pickup_at': 'Pickup at',
    'order.paid_online': 'Paid online. Thank you.',
    'order.paid': 'Paid. Thank you.',
    'order.paid_test': 'This was a test payment, no real money was charged.',
    'order.not_paid': 'Not paid yet.',
    'order.your_note': 'Your note: {note}',
    'order.call': 'Need to change something? Call {phone}',
    'order.cancel': 'Cancel this order',
    'order.cancel_confirm': 'Tap again to cancel this order',
    'order.again': 'Order again',
    'order.not_found': 'Order not found',
    'order.not_found_detail': 'Check the link, or call us and we will look it up.',
    'order.load_failed': 'Could not load your order',
    'order.no_code': 'This link is missing its order code.',
    'order.ready_title': 'Ready! Order {n}',

    'pay.confirming': 'Confirming your payment',
    'pay.confirming_detail': 'Your bank is still processing it. This usually takes less than a minute. Keep this page open and it will update by itself.',
    'pay.problem': 'Payment problem',
    'pay.problem_detail': 'A technical problem stopped the payment and Sentoo has been notified. Please call us so we can sort out your order.',
    'pay.rejected': 'Payment was rejected',
    'pay.bank_said': 'Your bank said: {message}.',
    'pay.rejected_detail': 'Nothing was charged. You can try again, with another bank or card if you like.',
    'pay.cancelled': 'Payment was cancelled',
    'pay.cancelled_detail': 'Nothing was charged. Your order is held until it is paid.',
    'pay.waiting': 'Waiting for your payment',
    'pay.waiting_detail': 'Your order goes to the kitchen as soon as it is paid.',
    'pay.retry': 'Try payment again',
    'pay.now': 'Pay now',
  },

  pap: {
    'lang.switch': 'English',
    'skip': 'Bai na e menú',
    'hero.sub': 'Pidi aki, buska bo kuminda kayente.',
    'hero.cta': 'Mira e menú',
    'hero.today': 'Awe: {hours}',
    'hero.closed_today': 'Será awe',
    'hero.wait': 'Kla pa buska den mas o ménos {n} minüt',
    'status.closed_now': 'Será awor',
    'status.orders_closed': 'Pedido online ta será',

    'avail.open_until': 'Habrí te {time}',
    'avail.opens_at': 'Nos ta habri {time}. Pidi awor i buska awe nochi.',
    'avail.closed_today': 'Será awe. {next}',
    'avail.closed_tonight': 'Será pa awe nochi. {next}',
    'avail.closing': 'Kushina ta sera, p’esei nos no ta tuma pedido online mas. {next}',
    'avail.paused': 'Pedido online ta pousa pa un ratu. Purba atrobe djis akí.',
    'avail.next_tomorrow': 'Nos ta habri atrobe mañan {time}.',
    'avail.next_day': 'Nos ta habri atrobe {day} {time}.',
    'avail.next_none': 'Pedido online ta será.',

    'day.0': 'Djadumingu',
    'day.1': 'Djaluna',
    'day.2': 'Djamars',
    'day.3': 'Djarason',
    'day.4': 'Djaweps',
    'day.5': 'Djabièrnè',
    'day.6': 'Djasabra',
    'hours.range': '{open} te {close}',
    'hours.closed': 'Será',

    'foot.about': 'Tokante nos',
    'foot.about_1': 'Street food ku hopi smak, prepará fresku tur dia: burger, loaded fries, taco, kapsalon i plato for di grill.',
    'foot.about_2': 'Pidi aki i pasa buska, òf bin kome serka nos riba e rooftop terrace.',
    'foot.veg': 'Puntra pa nos opshonnan vegetariano.',
    'foot.find': 'Unda nos ta',
    'foot.maps': 'Habri den Google Maps',
    'foot.hours': 'Orario',

    'menu.loading': 'Kargando e menú…',
    'menu.retry': 'Purba atrobe',
    'menu.popular': 'Popular',
    'menu.popular_note': 'Loke hende ta pidi mas tantu.',
    'menu.from': 'for di',
    'menu.sold_out': 'Kaba',
    'menu.sold_out_short': '(kaba)',

    'item.optional': 'Opshonal',
    'item.choose_n': 'Skohe {n}',
    'item.choose_one': 'Skohe un',
    'item.note': 'Algu ku nos mester sa?',
    'item.note_example': 'Sin siboyo, salsa apart…',
    'item.quantity': 'Kantidat',
    'item.less': 'Un ménos',
    'item.more': 'Un mas',
    'item.close': 'Sera',
    'item.missing_more': 'Skohe {n} mas',
    'item.missing': 'Skohe {name}',
    'item.add': 'Pone den pedido, {price}',

    'cart.added': 'Añadí: {item}',
    'cart.view': 'Mira bo pedido',
    'cart.title': 'Bo pedido',
    'cart.empty': 'Bo pedido ta bashí. Skohe algu for di e menú pa kuminsá.',
    'cart.note': 'Nota: {note}',
    'cart.remove': 'Kita',
    'cart.total': 'Total',
    'cart.saved': 'Bo pedido ta wardá riba e aparato akí pa ora nos ta habrí.',
    'cart.asap': 'Mas lihé posibel, mas o ménos {n} minüt',
    'cart.details': 'Detaye pa buska',
    'cart.time': 'Ora pa buska',
    'cart.name': 'Bo nòmber',
    'cart.phone': 'Number di telefòn',
    'cart.phone_hint': 'Pa nos por yama bo tokante bo pedido',
    'cart.kitchen_note': 'Nota pa kushina',
    'cart.age': 'Mi tin 18 aña òf mas. Mi ta mustra ID ora di buska si nan pidi.',
    'cart.payment': 'Pago',
    'cart.pay_online': 'Paga awor online',
    'cart.pay_online_hint': 'Ku bo banko òf karchi, via Sentoo',
    'cart.pay_pickup': 'Paga ora di buska',
    'cart.pay_test': 'Modo di tèst: pago online ta pago di prueba. No ta kobra plaka real.',
    'cart.pay_note': 'Paga ora bo buska bo pedido.',
    'cart.placing': 'Mandando bo pedido…',
    'cart.to_payment': 'Sigui pa paga, {price}',
    'cart.place': 'Manda pedido, {price}',
    'cart.err_name': 'Yena bo nòmber pa nos por yama bo ora bo pedido ta kla.',
    'cart.err_phone': 'Yena un number di telefòn kaminda nos por alkansá bo.',
    'cart.err_age': 'Konfirmá ku bo tin 18 aña òf mas pa pidi alkohòl.',
    'again.button': 'Pidi meskos atrobe: {items}',
    'again.more': ' i {n} mas',
    'track.link': 'Sigui bo pedido #{n}',

    'order.back': 'Bèk na e menú',
    'order.finding': 'Buskando bo pedido…',
    'order.number': 'Number di pedido',
    'order.for': 'pa {name}',
    'order.new': 'Nos a risibí bo pedido',
    'order.new_detail': 'Nos ta kuminsá kushiná djis akí. Buska rònt di {time}.',
    'order.preparing': 'Nos ta prepará bo pedido',
    'order.preparing_detail': 'Buska rònt di {time}.',
    'order.ready': 'Kla pa buska',
    'order.ready_detail': 'Bin busk’é, {name}. Bisa nos bo number di pedido.',
    'order.done': 'Buská',
    'order.done_detail': 'Bon apetit, i danki pa bo pedido.',
    'order.cancelled': 'Pedido kanselá',
    'order.cancelled_you': 'Bo a kanselá e pedido akí. Bo no debe nada. Bo por pidi atrobe ki ora ku bo ke.',
    'order.cancelled_other': 'E pedido akí a wòrdu kanselá. Yama nos si bo no tabata sa.',
    'order.cancelled_payment': 'E pago no a kaba na tempu, p’esei e pedido a wòrdu kanselá. No a kobra nada. Bo por pidi atrobe.',
    'order.step_new': 'Risibí',
    'order.step_preparing': 'Kushinando',
    'order.step_ready': 'Kla',
    'order.pickup_at': 'Buska na',
    'order.paid_online': 'Pagá online. Danki.',
    'order.paid': 'Pagá. Danki.',
    'order.paid_test': 'Esaki tabata un pago di prueba, no a kobra plaka real.',
    'order.not_paid': 'Ainda no ta pagá.',
    'order.your_note': 'Bo nota: {note}',
    'order.call': 'Mester kambia algu? Yama {phone}',
    'order.cancel': 'Kanselá e pedido akí',
    'order.cancel_confirm': 'Primi atrobe pa kanselá e pedido',
    'order.again': 'Pidi atrobe',
    'order.not_found': 'No por a haña e pedido',
    'order.not_found_detail': 'Kontrolá e link, òf yama nos i nos ta busk’é.',
    'order.load_failed': 'No por a karga bo pedido',
    'order.no_code': 'E link akí ta falta e kódigo di pedido.',
    'order.ready_title': 'Kla! Pedido {n}',

    'pay.confirming': 'Konfirmando bo pago',
    'pay.confirming_detail': 'Bo banko ta prosesando e pago ainda. Normalmente esaki ta tuma ménos ku un minüt. Laga e página akí habrí, e ta aktualisá su mes.',
    'pay.problem': 'Problema ku pago',
    'pay.problem_detail': 'Un problema tékniko a stòp e pago i Sentoo a haña notifikashon. Por fabor yama nos pa nos regla bo pedido.',
    'pay.rejected': 'Pago a wòrdu rechasá',
    'pay.bank_said': 'Bo banko a bisa: {message}.',
    'pay.rejected_detail': 'No a kobra nada. Bo por purba atrobe, ku otro banko òf karchi si bo ke.',
    'pay.cancelled': 'Pago a wòrdu kanselá',
    'pay.cancelled_detail': 'No a kobra nada. Nos ta warda bo pedido te ora e ta pagá.',
    'pay.waiting': 'Wardando bo pago',
    'pay.waiting_detail': 'Bo pedido ta bai kushina asina e ta pagá.',
    'pay.retry': 'Purba paga atrobe',
    'pay.now': 'Paga awor',
  },
};

const LANG_KEY = 'volcano_lang_v1';

function pickLanguage() {
  const saved = store.get(LANG_KEY, null);
  if (saved && TEXT[saved]) return saved;
  // A phone set to Papiamento gets Papiamento. Everyone else starts in English.
  return (navigator.languages || [navigator.language || '']).some((l) => String(l).toLowerCase().startsWith('pap')) ? 'pap' : 'en';
}

export const lang = pickLanguage();
document.documentElement.lang = lang;

// The wording for a key, with {placeholders} filled in. Falls back to English.
export function t(key, values = {}) {
  const text = TEXT[lang][key] ?? TEXT.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

export function switchLanguage() {
  store.set(LANG_KEY, lang === 'en' ? 'pap' : 'en');
  location.reload();
}

// Fills in the fixed wording in the page: any element with data-t="key".
// data-t-attr="aria-label" puts the wording in an attribute instead of the text.
export function translatePage(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) {
    const attr = el.getAttribute('data-t-attr');
    if (attr) el.setAttribute(attr, t(el.dataset.t));
    else el.textContent = t(el.dataset.t);
  }
  for (const button of root.querySelectorAll('[data-lang-switch]')) {
    button.textContent = t('lang.switch');
    button.hidden = false;
    button.addEventListener('click', switchLanguage);
  }
}

// "6 PM", "6:15 PM": times are written the same in both languages.
export function formatTime(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${mm === 0 ? h12 : `${h12}:${String(mm).padStart(2, '0')}`} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

// The opening status the server sends, in the customer's language.
export function noticeText(availability) {
  const notice = availability.notice;
  if (!notice) return availability.message;
  if (notice.key === 'custom') return notice.text;
  const next = notice.next
    ? notice.next.days_ahead === 1
      ? t('avail.next_tomorrow', { time: formatTime(notice.next.open) })
      : t('avail.next_day', { day: t(`day.${notice.next.day}`), time: formatTime(notice.next.open) })
    : t('avail.next_none');
  const time = formatTime(notice.close ?? notice.open ?? 0);
  return t(`avail.${notice.key}`, { time, next });
}

// "6 PM to 12 AM" or "Closed", for one day of the opening hours.
export const hoursText = (day) => (day.open == null ? t('hours.closed') : t('hours.range', { open: formatTime(day.open), close: formatTime(day.close) }));
