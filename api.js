// Talks to the Google Apps Script backend (live) or to localStorage (demo).
const TRMS = (() => {
  const C = window.TRMS_CONFIG;
  const live = !!C.apiUrl;

  // ---------- helpers shared by demo mode and the settings preview
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const pad = n => String(n).padStart(2, '0');
  const hhmm = min => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  const fmt = min => { let h = Math.floor(min / 60); const m = min % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; };
  const label = (a, b) => { const A = fmt(a), B = fmt(b); return A.slice(-2) === B.slice(-2) ? `${A.slice(0, -3)} – ${B}` : `${A} – ${B}`; };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateLabel = ymd => { const [y, m, d] = ymd.split('-').map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`; };
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function parseBreaks(text) {
    const out = [];
    const parts = String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const a = hhmm(+m[1] * 60 + +m[2]), b = hhmm(+m[3] * 60 + +m[4]);
      if (toMin(a) >= toMin(b)) return null;
      out.push({ start: a, end: b });
    }
    return out;
  }
  function makeSlots(c) {
    const out = [], len = +c.slotMinutes;
    for (let t = toMin(c.startTime); t + len <= toMin(c.endTime); t += len) {
      const clash = (c.breaks || []).some(b => t < toMin(b.end) && t + len > toMin(b.start));
      if (!clash) out.push({ start: hhmm(t), end: hhmm(t + len), label: label(t, t + len) });
    }
    return out;
  }
  // Checks the event form. Returns { error } or { slots, ev }.
  function checkSettings(s) {
    const date = String(s.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T12:00:00Z').getTime())) return { error: 'Choose a valid date.' };
    if (!TIME_RE.test(s.startTime || '') || !TIME_RE.test(s.endTime || '')) return { error: 'Choose a start and end time.' };
    if (toMin(s.startTime) >= toMin(s.endTime)) return { error: 'The end time must be after the start time.' };
    const len = +s.slotMinutes;
    if (!(len >= 5 && len <= 60)) return { error: 'Slot length must be between 5 and 60 minutes.' };
    const breaks = parseBreaks(s.breaksText);
    if (breaks === null) return { error: 'Write breaks like 12:00-12:30, 14:00-14:10.' };
    const emails = String(s.notifyEmails || '').split(/[,\s;]+/).filter(Boolean);
    if (!emails.length || emails.some(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { error: 'Enter at least one valid email for booking copies.' };
    if (s.closesAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.closesAt)) return { error: 'Choose a valid booking deadline, or leave it empty.' };
    const ev = { title: String(s.title || '').trim() || 'Parents/Teachers Conference', date, startTime: s.startTime, endTime: s.endTime, slotMinutes: len, breaks,
      venue: String(s.venue || '').trim() || C.demo.venue, closesAt: s.closesAt || '', notifyEmails: emails, teachers: s.teachers || {} };
    const slots = makeSlots(ev);
    if (!slots.length) return { error: 'Those times leave no room for even one slot.' };
    return { slots, ev };
  }
  // Booking closes when the event ends, or earlier if the admin set an earlier deadline.
  function derive(ev) {
    const now = nowLocal(), endAt = `${ev.date}T${ev.endTime}`;
    const closeAt = ev.closesAt && ev.closesAt < endAt ? ev.closesAt : endAt;
    return { ...ev, dateLabel: dateLabel(ev.date), slots: makeSlots(ev), now, closeAt, closed: now >= closeAt,
      closesLabel: `${dateLabel(closeAt.slice(0, 10))}, ${fmt(toMin(closeAt.slice(11, 16)))}` };
  }

  // ---------- live mode
  async function remote(action, payload, query) {
    const opts = payload
      ? { method: 'POST', body: JSON.stringify({ action, ...payload }) } // plain-text body: no CORS preflight
      : { method: 'GET' };
    const url = payload ? C.apiUrl : `${C.apiUrl}?action=${action}${query || ''}&_=${Date.now()}`;
    const r = await fetch(url, opts);
    return r.json();
  }

  // ---------- demo mode
  const KEY = 'trms-demo-v3';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  const newId = date => 'e' + date.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6);

  function db() {
    let d = load();
    if (!d) {
      const dm = C.demo, id = newId(dm.date);
      const ev = { id, title: dm.title, date: dm.date, startTime: dm.startTime, endTime: dm.endTime, slotMinutes: dm.slotMinutes, breaks: [], venue: dm.venue, closesAt: '',
        notifyEmails: [dm.adminEmail], teachers: {}, status: 'active' };
      d = { events: [ev], bookings: [], blocked: [], n: 1 };
      // pretend other parents already booked some slots
      dm.classes.slice(0, 6).forEach((cl, i) => makeSlots(ev).forEach((s, j) => {
        if ((i * 7 + j * 3) % 5 === 0) d.bookings.push({ id: 'DEMO' + d.n++, created: new Date().toISOString(), eventId: id, classId: cl.id, className: cl.name, teacher: '',
          start: s.start, time: s.label, child: 'Sample child', parent: 'Sample parent', email: 'parent' + i + j + '@example.com', phone: '08000000000', status: 'booked' });
      }));
      save(d);
    }
    return d;
  }
  const active = (d, id) => d.bookings.filter(b => b.status === 'booked' && (!id || b.eventId === id));
  const keyOf = (c, s) => c + '|' + s;
  const takenKeys = id => { const d = db(); return active(d, id).map(b => keyOf(b.classId, b.start)).concat(d.blocked.filter(b => b.eventId === id).map(b => keyOf(b.classId, b.start))); };
  const classesFor = ev => C.demo.classes.map(c => ({ id: c.id, name: c.name, teacher: (ev.teachers || {})[c.id] || '' }));
  const summary = d => ({ id: d.id, title: d.title, date: d.date, dateLabel: d.dateLabel, startTime: d.startTime, endTime: d.endTime, slotMinutes: d.slotMinutes, venue: d.venue, closed: d.closed, closesLabel: d.closesLabel });

  function demoList() {
    const evs = db().events.filter(e => e.status === 'active').map(derive).sort((a, b) => a.date < b.date ? -1 : 1);
    return { ok: true, schoolName: C.demo.schoolName, shortName: C.demo.shortName, events: evs.map(summary) };
  }
  function demoEvent(id) {
    const e = db().events.find(x => x.id === id && x.status === 'active');
    if (!e) return { ok: false, code: 'NOTFOUND' };
    const d = derive(e);
    return { ...summary(d), ok: true, schoolName: C.demo.schoolName, shortName: C.demo.shortName, now: d.now, slots: d.slots, classes: classesFor(d) };
  }
  function demoTaken(id) {
    const e = db().events.find(x => x.id === id && x.status === 'active');
    if (!e) return { ok: false, code: 'NOTFOUND' };
    const d = derive(e);
    return { ok: true, taken: takenKeys(id), now: d.now, closed: d.closed };
  }

  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function demoBook(req) {
    const d = db(), found = d.events.find(e => e.id === req.eventId && e.status === 'active');
    if (!found) return { ok: false, code: 'NOTFOUND', message: 'This booking link is no longer active.' };
    const ev = derive(found), classes = classesFor(ev);
    if (ev.closed) return { ok: false, code: 'CLOSED', message: `Bookings closed on ${ev.closesLabel}. Please contact the school office.` };
    const name = clean(req.parentName), email = clean(req.email).toLowerCase(), phone = clean(req.phone);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !phone || !req.bookings || !req.bookings.length)
      return { ok: false, code: 'INVALID', message: 'Please check your details.' };
    const starts = new Set(), conflicts = [], items = [];
    const taken = new Set(takenKeys(ev.id));
    const mine = new Set(active(d, ev.id).filter(b => b.email === email).map(b => b.start));
    for (const b of req.bookings) {
      const cl = classes.find(c => c.id === b.classId), sl = ev.slots.find(s => s.start === b.start);
      if (!cl || !sl || !clean(b.childName) || starts.has(b.start)) return { ok: false, code: 'INVALID', message: 'Please check the appointments.' };
      if (`${ev.date}T${sl.start}` <= ev.now) return { ok: false, code: 'PAST', message: 'A time you chose has already started. Pick a later time.' };
      starts.add(b.start);
      if (taken.has(keyOf(b.classId, b.start))) conflicts.push({ classId: b.classId, start: b.start });
      else if (mine.has(b.start)) return { ok: false, code: 'OVERLAP', message: 'This email already has an appointment at one of those times. Choose different times.' };
      items.push({ cl, sl, child: clean(b.childName) });
    }
    if (conflicts.length) return { ok: false, code: 'TAKEN', taken: conflicts, message: 'Some slots were just taken.' };
    const out = items.map(({ cl, sl, child }) => {
      const row = { id: 'DEMO' + d.n++, created: new Date().toISOString(), eventId: ev.id, classId: cl.id, className: cl.name, teacher: cl.teacher,
        start: sl.start, time: sl.label, child, parent: name, email, phone, status: 'booked' };
      d.bookings.push(row); return row;
    });
    save(d);
    return { ok: true, demo: true, bookings: out };
  }

  function adminView(eventId) {
    const d = db();
    const events = d.events.map(e => { const x = derive(e);
      return { id: x.id, title: x.title, date: x.date, dateLabel: x.dateLabel, status: x.status, closed: x.closed, closesLabel: x.closesLabel, startTime: x.startTime, endTime: x.endTime,
        slotMinutes: x.slotMinutes, venue: x.venue, closesAt: x.closesAt, notifyEmails: x.notifyEmails.join(', '), teachers: { ...x.teachers },
        breaksText: x.breaks.map(b => `${b.start}-${b.end}`).join(', '), slotCount: x.slots.length, booked: active(d, x.id).length }; })
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const sel = events.find(e => e.id === eventId) || events.find(e => e.status === 'active') || events[0];
    const ev = d.events.find(e => e.id === sel.id);
    return { ok: true, events, eventId: sel.id, classes: classesFor(ev), slots: makeSlots(ev), bookings: active(d, sel.id), blocked: d.blocked.filter(b => b.eventId === sel.id) };
  }

  function demoAdmin(req) {
    if (req.passcode !== C.demo.adminPasscode) return { ok: false, code: 'AUTH', message: 'Wrong passcode.' };
    const d = db(), op = req.action;
    let eventId = req.eventId;
    if (op === 'createEvent') {
      const r = checkSettings(req.settings || {});
      if (r.error) return { ok: false, code: 'SETTINGS', message: r.error };
      r.ev.id = newId(r.ev.date); r.ev.status = 'active'; d.events.push(r.ev); eventId = r.ev.id; save(d);
    } else if (op !== 'list') {
      const ev = d.events.find(e => e.id === eventId);
      if (!ev) return { ok: false, code: 'NOTFOUND', message: 'That event no longer exists.' };
      if (op === 'saveEvent') {
        const r = checkSettings(req.settings || {});
        if (r.error) return { ok: false, code: 'SETTINGS', message: r.error };
        const act = active(d, ev.id);
        if (act.length && r.ev.date !== ev.date) return { ok: false, code: 'DATE', message: `There are ${act.length} bookings for ${dateLabel(ev.date)}. Cancel them, or create a new event for the new date.` };
        const valid = new Set(r.slots.map(s => s.start));
        const stranded = act.filter(b => !valid.has(b.start)).length;
        if (stranded) return { ok: false, code: 'SLOTS', message: `${stranded} existing booking${stranded > 1 ? 's fall' : ' falls'} outside the new times. Cancel ${stranded > 1 ? 'them' : 'it'} first or keep the current times.` };
        Object.assign(ev, r.ev, { id: ev.id, status: ev.status });
      }
      if (op === 'archiveEvent') ev.status = 'archived';
      if (op === 'restoreEvent') ev.status = 'active';
      if (op === 'cancel') { const b = d.bookings.find(x => x.id === req.id); if (b) b.status = 'cancelled'; }
      if (op === 'move') {
        const b = active(d, ev.id).find(x => x.id === req.id);
        if (!b) return { ok: false, code: 'NOTFOUND', message: 'That booking no longer exists.' };
        const sl = derive(ev).slots.find(s => s.start === req.newStart);
        if (!sl) return { ok: false, code: 'INVALID', message: 'Choose a valid time.' };
        if (sl.start === b.start) return { ok: false, code: 'INVALID', message: 'That is already the booked time.' };
        if (takenKeys(ev.id).includes(keyOf(b.classId, sl.start))) return { ok: false, code: 'TAKEN', message: 'That time is already booked or blocked.' };
        if (active(d, ev.id).some(x => x.id !== b.id && x.email === b.email && x.start === sl.start)) return { ok: false, code: 'OVERLAP', message: 'This parent already has another meeting at that time.' };
        b.start = sl.start; b.time = sl.label; save(d);
        return { ...adminView(eventId), demo: true, emailed: false };
      }
      if (op === 'block' && !takenKeys(ev.id).includes(keyOf(req.classId, req.start))) d.blocked.push({ eventId: ev.id, classId: req.classId, start: req.start });
      if (op === 'unblock') d.blocked = d.blocked.filter(b => !(b.eventId === ev.id && b.classId === req.classId && b.start === req.start));
      save(d);
    }
    return adminView(eventId);
  }

  // ---------- public API
  return {
    live, checkSettings, dateLabel, fmt, toMin,
    listEvents: async () => live ? remote('events') : demoList(),
    getEvent: async id => live ? remote('event', null, '&id=' + encodeURIComponent(id)) : demoEvent(id),
    getTaken: async id => live ? remote('taken', null, '&id=' + encodeURIComponent(id)) : demoTaken(id),
    book: async req => live ? remote('book', req) : demoBook(req),
    admin: async (op, passcode, extra) => live ? remote('admin', { op, passcode, ...extra }) : demoAdmin({ action: op, passcode, ...extra }),
    resetDemo: () => { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
})();
