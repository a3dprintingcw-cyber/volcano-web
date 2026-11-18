// Epson Server Direct Print: for the rooftop's Epson TM-m30II ("Sushi Printer Rooftop").
//
// The Epson asks this server every few seconds whether there is something to print, the same
// idea as Star CloudPRNT downstairs, only Epson's own format (ePOS-Print XML).
// It shares the print queue in cloudprnt.js, so each website order prints once:
// first the kitchen ticket, then the customer receipt.
//
// Protocol (form posts from the printer):
//   ConnectionType=GetRequest   we answer with a job as XML, or an empty 200 when there is none
//   ConnectionType=SetResponse  the printer reports how the job went (ResponseFile, XML)
//
// The printer keeps working for Lightspeed as before: this only adds website orders.

import { formatMinutes, localClock } from './hours.js';
import { getSetting, markPrinted, nextJob, noteSeen, parseJob, pk, putSetting, receiptText } from './cloudprnt.js';

const NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';
const INFLIGHT_SECONDS = 60;

const ascii = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '');
const xml = (text) => ascii(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

// One line of text with its own size and weight. Settings carry on, so each line sets them all.
const line = (text, { w = 1, h = 1, bold = false, align = 'left', reverse = false } = {}) =>
  `<text align="${align}"/><text width="${w}" height="${h}"/><text em="${bold}"/><text reverse="${reverse}"/><text>${xml(text)}&#10;</text>`;

// The kitchen ticket: big number, pickup time and dishes, so it reads from a distance.
export function kitchenEpos(order, offsetMinutes) {
  const time = (sec) => formatMinutes(localClock(sec * 1000, offsetMinutes).minutes);
  const out = [];
  out.push(line(order.venue === 'rooftop' ? 'VOLCANO EXPERIENCE - WEBSITE' : 'VOLCANO - WEBSITE', { align: 'center', bold: true }));
  out.push(line(` #${order.number} `, { w: 4, h: 4, bold: true, align: 'center', reverse: true }));
  out.push(line(order.pickup_type === 'scheduled' ? `PICKUP ${time(order.pickup_at)}` : `ASAP ${time(order.pickup_at)}`, { w: 2, h: 2, bold: true, align: 'center' }));
  out.push(line(order.customer_name, { w: 2, h: 2, align: 'center' }));
  out.push(line(`${order.phone || ''}   placed ${time(order.created_at)}`, { align: 'center' }));
  out.push(line('------------------------------------------------'));
  for (const item of order.items) {
    out.push(line(`${item.quantity} x ${item.name}`, { w: 1, h: 2, bold: true }));
    for (const option of item.options || []) out.push(line(`   + ${option}`, { bold: true }));
    if (item.note) out.push(line(`   NOTE: ${item.note}`, { bold: true }));
  }
  if (order.notes) {
    out.push(line('------------------------------------------------'));
    out.push(line(` NOTE: ${order.notes} `, { bold: true, reverse: true }));
  }
  out.push(line('------------------------------------------------'));
  const pay =
    order.payment_method === 'sentoo' ? (order.payment_status === 'paid' ? 'PAID ONLINE' : 'ONLINE, NOT PAID YET')
      : order.payment_method === 'cash' ? 'PAY CASH AT PICKUP'
        : order.payment_method === 'card' ? 'PAY CARD AT PICKUP' : 'PAY AT PICKUP';
  out.push(line(pay, { w: 1, h: 2, bold: true, align: 'center' }));
  out.push('<feed line="3"/><cut type="feed"/>');
  return out.join('');
}

// The customer receipt: the same layout as the Star prints, as plain lines.
export function receiptEpos(order, offsetMinutes) {
  const lines = receiptText(order, offsetMinutes).split('\n');
  return `<text align="left"/><text width="1" height="1"/><text em="false"/><text reverse="false"/><text>${lines.map(xml).join('&#10;')}&#10;</text><feed line="2"/><cut type="feed"/>`;
}

// Epson job ids allow at most 30 characters: kind letter plus the order id without dashes, shortened.
const jobId = (token) => {
  const job = parseJob(token);
  return `${job.kind}${job.id.replace(/-/g, '').slice(0, 28)}`;
};

function requestXml(id, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<PrintRequestInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid>${id}</printjobid></Parameter><PrintData><epos-print xmlns="${NS}">${body}</epos-print></PrintData></ePOSPrint></PrintRequestInfo>`;
}

const empty = () => new Response('', { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } });

export async function handleEpson(request, db, loadOrders, settings, venue = 'rooftop') {
  if (request.method !== 'POST') return empty();
  let form;
  try {
    form = await request.formData();
  } catch {
    return empty();
  }
  const type = String(form.get('ConnectionType') || '');
  const inflightKey = pk(venue, 'epson_inflight');

  if (type === 'SetResponse') {
    const file = String(form.get('ResponseFile') || '');
    const id = (/<printjobid>([^<]*)<\/printjobid>/.exec(file) || [])[1] || '';
    const ok = /<response[^>]*success="true"/.test(file);
    const inflight = await getSetting(db, inflightKey, null);
    if (inflight && inflight.id === id) {
      if (ok) await markPrinted(db, inflight.token, venue);
      await putSetting(db, inflightKey, null);
    }
    await putSetting(db, pk(venue, 'epson_last_result'), { at: Date.now(), ok, id });
    return empty();
  }

  // GetRequest: anything to print?
  await noteSeen(db, `Epson ${ascii(form.get('Name') || '')}`.trim(), venue);
  const token = await nextJob(db, venue);
  if (!token) return empty();
  // Do not hand out the same job twice while the printer is still busy with it.
  const inflight = await getSetting(db, inflightKey, null);
  const now = Date.now();
  if (inflight && inflight.token === token && now - inflight.at < INFLIGHT_SECONDS * 1000) return empty();

  const job = parseJob(token);
  const [order] = await loadOrders(db, 'id = ?', [job.id]);
  if (!order) {
    await markPrinted(db, `${job.kind}:${job.id}`, venue);
    return empty();
  }
  const id = jobId(token);
  await putSetting(db, inflightKey, { token, id, at: now });
  const offset = settings.timezone_offset_minutes || 0;
  const body = job.kind === 'r' ? receiptEpos(order, offset) : kitchenEpos(order, offset);
  return new Response(requestXml(id, body), { headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store' } });
}
