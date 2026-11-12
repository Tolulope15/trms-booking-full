(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#c9382c', '#2b6fd1', '#b86a00', '#7b4fb0', '#1b8579', '#b03a7b', '#5c6b1f', '#3b5a8a'];
  const f12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  let cfg, taken = new Set(), now = '', kids = [], seq = 0, busy = false, timer = null, formBuilt = false, fromChooser = false;

  const show = id => ['loading', 'notice', 'chooser', 'form', 'done'].forEach(x => { $('#' + x).hidden = x !== id; $('#bar').hidden = id !== 'form'; });
  const notice = (title, text) => { $('#notice').innerHTML = `<h2>${esc(title)}</h2><p>${text}</p>`; show('notice'); };

  // ---------- which event?
  let list;
  try { list = await TRMS.listEvents(); } catch (e) { return notice('Could not load the booking times', 'Check your connection and refresh this page.'); }
  $('#school').textContent = list.schoolName;
  const wanted = new URLSearchParams(location.search).get('e');
  async function openEvent(id) {
    let ev;
    try { ev = await TRMS.getEvent(id); } catch (e) { return notice('Could not load the booking times', 'Check your connection and refresh this page.'); }
    if (!ev.ok) return notice('This booking link is not active', 'Please ask the school office for the current link.');
    startForm(ev);
  }
  if (wanted) await openEvent(wanted);
  else {
    const open = list.events.filter(e => !e.closed);
    if (!open.length) notice('No bookings are open right now', 'Please check back later or contact the school office.');
    else if (open.length === 1) await openEvent(open[0].id);
    else {
      fromChooser = true;
      $('#eventCards').innerHTML = open.map(e => `<button class="eventcard" type="button" data-id="${esc(e.id)}"><b>${esc(e.dateLabel)}</b><span>${esc(e.title)}, ${f12(e.startTime)} to ${f12(e.endTime)}</span><span class="go">Book this day</span></button>`).join('');
      $('#eventCards').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openEvent(b.dataset.id); });
      show('chooser');
    }
  }

  // ---------- booking form
  const key = (c, s) => c + '|' + s;
  const clsName = id => (cfg.classes.find(c => c.id === id) || {}).name || '';
  const slotLabel = s => (cfg.slots.find(x => x.start === s) || {}).label || s;
  const isPast = s => `${cfg.date}T${s.start}` <= now;

  function startForm(ev) {
    cfg = ev; now = ev.now; kids = []; seq = 0; $('#kids').innerHTML = ''; $('#err').hidden = true;
    clearInterval(timer);
    $('#school').textContent = cfg.schoolName; $('#event').textContent = cfg.title;
    $('#len').textContent = cfg.slotMinutes;
    $('#when').textContent = `${cfg.dateLabel}, ${f12(cfg.startTime)} to ${f12(cfg.endTime)}`;
    if (cfg.closed) return notice('Bookings are closed', `Booking for ${esc(cfg.title)} on ${esc(cfg.dateLabel)} closed on ${esc(cfg.closesLabel)}. Please contact the school office.`);
    $('#closes').textContent = `Booking closes ${cfg.closesLabel}.`;
    $('#changeEvent').hidden = !fromChooser;
    TRMS.getTaken(cfg.id).then(r => { taken = new Set(r.taken || []); now = r.now || now; buildFirst(); }).catch(() => notice('Could not load the booking times', 'Check your connection and refresh this page.'));
  }
  function buildFirst() {
    buildKid(newKid()); refreshAll(); show('form');
    timer = setInterval(poll, 8000);
  }

  function newKid() {
    const k = { id: ++seq, name: '', classId: '', slot: '', color: COLORS[(seq - 1) % COLORS.length] };
    kids.push(k); return k;
  }

  // slots a child can still pick: not booked, not already started, not a time used for a sibling
  function freeSlots(k) {
    const used = new Set(kids.filter(o => o !== k && o.slot).map(o => o.slot));
    return cfg.slots.filter(s => !taken.has(key(k.classId, s.start)) && !used.has(s.start) && !isPast(s));
  }

  function buildKid(k) {
    const el = document.createElement('section');
    el.className = 'kid'; el.dataset.id = k.id; el.style.setProperty('--rod', k.color);
    el.innerHTML = `
      <div class="kid-head"><h3></h3><button type="button" class="linkbtn" data-remove>Remove</button></div>
      <label for="kn${k.id}">Child's name</label>
      <input type="text" id="kn${k.id}" autocomplete="off">
      <fieldset><legend>Class</legend><div class="chips"></div></fieldset>
      <div class="slot-area"></div>`;
    const chips = $('.chips', el);
    cfg.classes.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = c.name; b.dataset.cls = c.id; b.setAttribute('aria-pressed', 'false');
      chips.appendChild(b);
    });
    $('input', el).addEventListener('input', e => { k.name = e.target.value; $('h3', el).textContent = k.name.trim() || `Child ${kids.indexOf(k) + 1}`; renderBar(); });
    el.addEventListener('click', e => {
      const chip = e.target.closest('.chip'), slot = e.target.closest('.slot');
      if (chip) { k.classId = chip.dataset.cls; k.slot = ''; refreshAll(); }
      else if (slot) { k.slot = k.slot === slot.dataset.start ? '' : slot.dataset.start; refreshAll(); }
      else if (e.target.closest('[data-remove]')) { kids = kids.filter(o => o !== k); el.remove(); refreshAll(); }
    });
    $('#kids').appendChild(el);
    return el;
  }

  function refreshKid(k) {
    const el = $(`.kid[data-id="${k.id}"]`);
    $('h3', el).textContent = k.name.trim() || `Child ${kids.indexOf(k) + 1}`;
    $('[data-remove]', el).hidden = kids.length < 2;
    el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cls === k.classId)));
    const area = $('.slot-area', el);
    if (!k.classId) { area.innerHTML = '<p class="hint">Choose a class to see the times that are still free.</p>'; return; }
    const free = freeSlots(k);
    const teacher = (cfg.classes.find(c => c.id === k.classId) || {}).teacher;
    if (!free.length) {
      area.innerHTML = `<p class="empty">Every time for ${esc(clsName(k.classId))} is booked or has passed. Please contact the school office.</p>`;
      return;
    }
    const groups = {};
    free.forEach(s => { (groups[s.start.slice(0, 2)] = groups[s.start.slice(0, 2)] || []).push(s); });
    const hourName = h => { const n = +h; return `${n % 12 || 12} ${n >= 12 ? 'PM' : 'AM'}`; };
    area.innerHTML = `<p class="slot-count">${free.length} free time${free.length > 1 ? 's' : ''} for ${esc(clsName(k.classId))}${teacher ? ' with ' + esc(teacher) : ''}</p>` +
      Object.keys(groups).map(h => `<div class="hour"><h4>${hourName(h)}</h4><div class="slots">${groups[h].map(s => `<button type="button" class="slot" data-start="${s.start}" aria-pressed="${k.slot === s.start}">${s.label}</button>`).join('')}</div></div>`).join('');
  }

  function renderBar() {
    const picked = kids.filter(k => k.slot);
    $('#picks').innerHTML = picked.length
      ? picked.map(k => `<span class="pick" style="--rod:${k.color}">${esc(k.name.trim() || 'Child')}: ${esc(slotLabel(k.slot))}</span>`).join('')
      : '<span class="none">No time picked yet</span>';
    $('#confirm').textContent = picked.length > 1 ? `Confirm ${picked.length} meetings` : 'Confirm booking';
  }
  function refreshAll() { kids.forEach(refreshKid); renderBar(); }

  // drop any pick that someone else took, or that has started
  function dropLostPicks() {
    const lost = [];
    kids.forEach(k => {
      if (!k.slot) return;
      const s = cfg.slots.find(x => x.start === k.slot);
      if (taken.has(key(k.classId, k.slot)) || (s && isPast(s))) { lost.push(`${k.name.trim() || 'Your child'}'s ${slotLabel(k.slot)} slot`); k.slot = ''; }
    });
    return lost;
  }
  function showErr(items, title) {
    const e = $('#err');
    e.hidden = !items.length;
    e.innerHTML = items.length ? `<b>${esc(title)}</b><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    if (items.length) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // keep the free list live while the page is open
  async function poll() {
    if (document.hidden || busy) return;
    try {
      const r = await TRMS.getTaken(cfg.id);
      if (!r.ok) return;
      taken = new Set(r.taken); now = r.now;
      if (r.closed) { clearInterval(timer); return notice('Bookings are closed', `Booking for ${esc(cfg.title)} on ${esc(cfg.dateLabel)} has just closed. Please contact the school office.`); }
      const lost = dropLostPicks();
      if (lost.length) showErr(lost.map(l => l + ' is no longer available. Pick another time.'), 'A time you chose is gone');
      refreshAll();
    } catch (e) {}
  }

  function validate() {
    const p = [];
    if (!$('#pname').value.trim()) p.push('Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('#pemail').value.trim())) p.push('Enter a valid email address.');
    if ($('#pphone').value.replace(/\D/g, '').length < 7) p.push('Enter a phone number.');
    kids.forEach((k, i) => {
      const who = k.name.trim() || `Child ${i + 1}`;
      if (!k.name.trim()) p.push(`Enter the name of child ${i + 1}.`);
      if (!k.classId) p.push(`Choose a class for ${who}.`);
      else if (!k.slot) p.push(`Pick a time for ${who}.`);
    });
    return p;
  }

  $('#addKid').addEventListener('click', () => {
    const k = newKid(); buildKid(k); refreshAll();
    $(`.kid[data-id="${k.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#changeEvent').addEventListener('click', () => { clearInterval(timer); show('chooser'); });

  $('#confirm').addEventListener('click', async () => {
    showErr([]);
    const problems = validate();
    if (problems.length) return showErr(problems, 'Finish these before booking');
    busy = true; const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Booking…';
    let res;
    try {
      res = await TRMS.book({
        eventId: cfg.id, parentName: $('#pname').value, email: $('#pemail').value, phone: $('#pphone').value,
        bookings: kids.map(k => ({ childName: k.name, classId: k.classId, start: k.slot }))
      });
    } catch (e) { res = { ok: false, code: 'NET', message: 'No connection. Check your internet and try again.' }; }
    busy = false; btn.disabled = false;

    if (res.ok) return showDone(res);
    if (res.code === 'CLOSED') { clearInterval(timer); return notice('Bookings are closed', esc(res.message)); }
    if (res.code === 'TAKEN' || res.code === 'PAST') {
      try { const r = await TRMS.getTaken(cfg.id); taken = new Set(r.taken); now = r.now; } catch (e) {}
      const lines = (res.taken || []).map(t => {
        const k = kids.find(o => o.classId === t.classId && o.slot === t.start);
        if (k) k.slot = '';
        return `${k ? (k.name.trim() || 'Your child') : 'A child'}'s ${slotLabel(t.start)} slot in ${clsName(t.classId)} was just taken by another parent.`;
      });
      lines.push(...dropLostPicks().map(l => l + ' has already started.'));
      refreshAll();
      return showErr((lines.length ? lines : [res.message]).concat('Your other choices are kept. Pick a new time where needed.'), 'Nothing was booked');
    }
    refreshAll();
    showErr([res.message || 'Something went wrong. Please try again.'], 'Nothing was booked');
  });

  function showDone(res) {
    clearInterval(timer); show('done');
    const d = $('#done'), email = $('#pemail').value.trim();
    d.innerHTML = `
      <div class="panel">
        <h2>You're booked</h2>
        <p>${res.demo ? '' : res.emailed === false ? 'Your booking is saved, but we could not send the email. Please screenshot this page.' : `A confirmation is on its way to <b>${esc(email)}</b>. Check your spam folder if you don't see it.`}</p>
        <p><b>${esc(cfg.dateLabel)}</b> at ${esc(cfg.venue)}. Please arrive a few minutes early.</p>
        ${res.bookings.map((b, i) => `<div class="ticket" style="--rod:${(kids[i] || {}).color || COLORS[0]}"><div><b>${esc(b.child)}</b><br>${esc(b.className)}${b.teacher ? ' with ' + esc(b.teacher) : ''}</div><div class="t">${esc(b.time)}</div></div>`).join('')}
        ${res.demo ? '<p class="demo-note">Demo mode: no email was sent and nothing left this device.</p>' : ''}
        <p style="margin-top:18px"><button class="secondary" id="again" type="button">Book for another family</button></p>
      </div>`;
    $('#again').addEventListener('click', () => location.reload());
    window.scrollTo(0, 0);
  }
})();
