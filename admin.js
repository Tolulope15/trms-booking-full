(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SHORT = (window.TRMS_CONFIG.demo || {}).shortName || 'TRMS';
  let pass = '', data = null, tab = 'by-parent';
  try { pass = sessionStorage.getItem('trms-admin') || ''; } catch (e) {}

  const cur = () => data.events.find(e => e.id === data.eventId);
  async function call(op, extra) {
    const r = await TRMS.admin(op, pass, { eventId: data ? data.eventId : undefined, ...extra });
    if (!r.ok) throw r;
    data = r; return r;
  }
  const parentLink = id => new URL('index.html?e=' + encodeURIComponent(id), location.href).href;

  async function signIn(p) {
    pass = p;
    try {
      await call('list');
      try { sessionStorage.setItem('trms-admin', pass); } catch (e) {}
      $('#login').hidden = true; $('#dash').hidden = false;
      render();
    } catch (e) {
      pass = ''; try { sessionStorage.removeItem('trms-admin'); } catch (x) {}
      const el = $('#loginErr'); el.hidden = false; el.textContent = e.message || 'Could not connect. Try again.';
      $('#login').hidden = false; $('#dash').hidden = true;
    }
  }

  const bookingAt = (c, s) => data.bookings.find(b => b.classId === c && b.start === s);
  const isBlocked = (c, s) => data.blocked.some(b => b.classId === c && b.start === s);
  const label = ev => `${ev.dateLabel}, ${ev.title}${ev.status === 'archived' ? ' (archived)' : ev.closed ? ' (closed)' : ''}`;

  // ---------- header and event picker
  function renderHeader() {
    const ev = cur();
    $('#eventSel').innerHTML = data.events.map(e => `<option value="${esc(e.id)}" ${e.id === data.eventId ? 'selected' : ''}>${esc(label(e))}</option>`).join('');
    $('#title').textContent = `${ev.title}, ${ev.dateLabel}`;
    $('#sub').textContent = `${data.slots.length} slots of ${ev.slotMinutes} minutes for each of ${data.classes.length} classes. Bookings close ${ev.closesLabel}.` +
      (ev.status === 'archived' ? ' This event is archived and hidden from parents.' : '') + (TRMS.live ? '' : ' Demo mode.');
  }

  // ---------- viewing bookings
  function renderTabs() {
    const total = data.slots.length;
    const tabs = [{ id: 'by-parent', name: 'By parent', sub: `${data.bookings.length} bookings` }].concat(data.classes.map(c => {
      const n = data.bookings.filter(b => b.classId === c.id).length;
      return { id: c.id, name: c.name, sub: `${n} of ${total} booked` };
    })).concat([{ id: 'settings', name: 'Event settings', sub: 'Date, hours, link' }]);
    $('#tabs').innerHTML = tabs.map(t => `<button class="tab" role="tab" data-tab="${esc(t.id)}" aria-selected="${t.id === tab}">${esc(t.name)}<small>${esc(t.sub)}</small></button>`).join('');
  }

  function render() {
    renderHeader();
    const editing = tab === 'settings' || tab === 'new';
    $('#viewer').hidden = tab === 'new'; $('#settingsBox').hidden = !editing;
    $('#newEvent').hidden = tab === 'new';
    if (tab !== 'new') {
      renderTabs();
      $('#tablewrap').hidden = tab === 'settings';
      $('#stats').textContent = `${data.bookings.length} of ${data.classes.length * data.slots.length} slots booked`;
    }
    if (editing) return renderSettings();
    const t = $('#tbl');
    if (tab === 'by-parent') {
      const rows = data.bookings.slice().sort((a, b) => a.parent.localeCompare(b.parent) || a.start.localeCompare(b.start));
      t.innerHTML = `<thead><tr><th>Parent</th><th>Phone</th><th>Email</th><th>Child</th><th>Class</th><th>Time</th><th></th></tr></thead><tbody>` +
        (rows.length ? rows.map(b => `<tr><td data-l="Parent">${esc(b.parent)}</td><td data-l="Phone">${esc(b.phone)}</td><td data-l="Email">${esc(b.email)}</td><td data-l="Child">${esc(b.child)}</td><td data-l="Class">${esc(b.className)}</td><td data-l="Time">${esc(b.time)}</td>
          <td class="act"><button class="mini" data-move="${esc(b.id)}">Change time</button> <button class="mini danger" data-cancel="${esc(b.id)}">Cancel</button></td></tr>`).join('') : '<tr><td colspan="7" class="emptyrow">No bookings yet. Share the parent link from Event settings.</td></tr>') + '</tbody>';
    } else {
      const cl = data.classes.find(c => c.id === tab);
      t.innerHTML = `<thead><tr><th>Time</th><th>Status</th><th>Child</th><th>Parent</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>` +
        data.slots.map(s => {
          const b = bookingAt(cl.id, s.start), blk = isBlocked(cl.id, s.start);
          if (b) return `<tr><td data-l="Time"><b>${esc(s.label)}</b></td><td data-l="Status"><span class="badge booked">Booked</span></td><td data-l="Child">${esc(b.child)}</td><td data-l="Parent">${esc(b.parent)}</td><td data-l="Phone">${esc(b.phone)}</td><td data-l="Email">${esc(b.email)}</td><td class="act"><button class="mini" data-move="${esc(b.id)}">Change time</button> <button class="mini danger" data-cancel="${esc(b.id)}">Cancel</button></td></tr>`;
          const badge = blk ? '<span class="badge blocked">Blocked</span>' : '<span class="badge free">Free</span>';
          const btn = blk ? `<button class="mini" data-unblock="${esc(s.start)}">Unblock</button>` : `<button class="mini" data-block="${esc(s.start)}">Block</button>`;
          return `<tr class="free"><td data-l="Time"><b>${esc(s.label)}</b></td><td data-l="Status">${badge}</td><td class="skip" colspan="4"></td><td class="act">${btn}</td></tr>`;
        }).join('') + '</tbody>';
    }
  }

  // ---------- event form (edit or create)
  function renderSettings() {
    const creating = tab === 'new', ev = cur();
    const s = creating ? { ...ev, date: '', closesAt: '' } : ev;
    const v = x => esc(x == null ? '' : x);
    const box = $('#settingsBox');
    box.innerHTML = `
      <h2>${creating ? 'New event' : 'Event date and hours'}</h2>
      ${creating ? '<p class="hint" style="margin:-4px 0 12px">Hours and teacher names are copied from the event you were viewing. Change anything you need.</p>' : ''}
      <div class="grid2">
        <div class="full"><label for="s_title">Event name</label><input type="text" id="s_title" value="${v(s.title)}"></div>
        <div><label for="s_date">Date of the meetings</label><input type="date" id="s_date" value="${v(s.date)}"></div>
        <div><label for="s_slotMinutes">Length of each meeting</label>
          <select id="s_slotMinutes">${[5, 10, 15, 20, 30].map(n => `<option value="${n}" ${+s.slotMinutes === n ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></div>
        <div><label for="s_startTime">First meeting starts</label><input type="time" id="s_startTime" value="${v(s.startTime)}"></div>
        <div><label for="s_endTime">Last meeting ends</label><input type="time" id="s_endTime" value="${v(s.endTime)}"><p class="hint">Bookings close at this time on the day.</p></div>
        <div class="full"><label for="s_breaksText">Breaks (optional)</label><input type="text" id="s_breaksText" value="${v(s.breaksText)}" placeholder="12:00-12:30, 14:00-14:10"><p class="hint">Use 24-hour times. No slots are offered during a break.</p></div>
        <div class="full"><label for="s_venue">Venue</label><input type="text" id="s_venue" value="${v(s.venue)}"></div>
      </div>
      <div class="preview" id="s_preview" role="status"></div>

      <h2>Bookings and emails</h2>
      <div class="grid2">
        <div><label for="s_closesAt">Close bookings earlier (optional)</label><input type="datetime-local" id="s_closesAt" value="${v(s.closesAt)}"><p class="hint">Leave empty to accept bookings until the last meeting ends.</p></div>
        <div><label for="s_notifyEmails">Send a copy of every booking to</label><input type="text" id="s_notifyEmails" value="${v(s.notifyEmails)}"><p class="hint">Separate several emails with commas.</p></div>
      </div>

      <h2>Teachers</h2>
      <div class="grid2">${data.classes.map(c => `<div><label for="t_${esc(c.id)}">${esc(c.name)}</label><input type="text" id="t_${esc(c.id)}" data-teacher="${esc(c.id)}" value="${v((s.teachers || {})[c.id])}" placeholder="Teacher's name"></div>`).join('')}</div>

      <div class="error" id="s_err" role="alert" hidden></div>
      <div class="formactions">
        <button class="primary" id="s_save" type="button">${creating ? 'Create event' : 'Save changes'}</button>
        ${creating ? '<button class="secondary" id="s_cancel" type="button">Cancel</button>' : ''}
        <span class="hint" id="s_ok" role="status"></span>
      </div>

      ${creating ? '' : `
      <div class="dangerzone">
        <h2>Parent booking link</h2>
        <p class="hint" style="margin-bottom:8px">Send this link to parents. It opens the form for this day only.</p>
        <div class="linkrow"><input type="text" id="s_link" readonly value="${esc(parentLink(ev.id))}"><button class="secondary" id="s_copy" type="button">Copy link</button></div>
        <h2 style="margin-top:22px">${ev.status === 'archived' ? 'Restore this event' : 'Archive this event'}</h2>
        <p class="hint" style="margin-bottom:10px">${ev.status === 'archived' ? 'Parents can book again through the link.' : 'Hides the event from parents and turns its link off. All bookings stay here and in the Google Sheet.'}</p>
        <button class="mini ${ev.status === 'archived' ? '' : 'danger'}" id="s_archive" type="button" style="min-height:42px;padding:0 16px">${ev.status === 'archived' ? 'Restore event' : 'Archive event'}</button>
      </div>`}`;
    updatePreview();
  }
  $('#settingsBox').addEventListener('input', () => updatePreview());
  const collect = () => {
    const g = id => $('#' + id).value, teachers = {};
    document.querySelectorAll('[data-teacher]').forEach(i => teachers[i.dataset.teacher] = i.value);
    return { title: g('s_title'), date: g('s_date'), startTime: g('s_startTime'), endTime: g('s_endTime'), slotMinutes: g('s_slotMinutes'),
      breaksText: g('s_breaksText'), venue: g('s_venue'), closesAt: g('s_closesAt'), notifyEmails: g('s_notifyEmails'), teachers };
  };
  function updatePreview() {
    const el = $('#s_preview'); if (!el) return;
    const c = collect(), r = TRMS.checkSettings(c);
    el.classList.toggle('bad', !!r.error);
    if (r.error) { el.textContent = r.error; return; }
    const n = r.slots.length;
    el.textContent = `${TRMS.dateLabel(c.date)}: ${n} meetings of ${c.slotMinutes} minutes for each class, from ${TRMS.fmt(TRMS.toMin(c.startTime))} to ${TRMS.fmt(TRMS.toMin(c.endTime))}. Bookings close at ${TRMS.fmt(TRMS.toMin(c.endTime))} that day.`;
  }

  // ---------- change a booking's time (admin moves a parent to another free slot)
  function openMove(id) {
    const b = data.bookings.find(x => x.id === id), dlg = $('#moveDlg');
    const free = data.slots.filter(s => s.start !== b.start && !bookingAt(b.classId, s.start) && !isBlocked(b.classId, s.start) &&
      !data.bookings.some(o => o.id !== b.id && o.email.toLowerCase() === b.email.toLowerCase() && o.start === s.start));
    dlg.innerHTML = `<form method="dialog" class="movebox">
      <h2>Change time</h2>
      <p><b>${esc(b.child)}</b>, ${esc(b.className)}. Parent: ${esc(b.parent)} (${esc(b.email)}).<br>Current time: <b>${esc(b.time)}</b></p>
      ${free.length ? `<label for="m_time">New time</label>
        <select id="m_time">${free.map(s => `<option value="${esc(s.start)}">${esc(s.label)}</option>`).join('')}</select>
        <label for="m_note" style="margin-top:12px">Message to the parent (optional)</label>
        <textarea id="m_note" rows="3" placeholder="For example: We have moved your meeting because of the reason you told us."></textarea>
        <p class="hint">The parent gets an email showing the old time and the new time.</p>`
        : '<p class="empty">There are no free times left in this class for this parent.</p>'}
      <div class="error" id="m_err" hidden></div>
      <div class="formactions">${free.length ? '<button class="primary" id="m_ok" type="button">Change time and email parent</button>' : ''}<button class="secondary" id="m_cancel" type="button">Close</button></div>
    </form>`;
    dlg.dataset.id = id; dlg.showModal();
  }

  // ---------- clicks
  document.addEventListener('click', async e => {
    const id = e.target.id;
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; return render(); }
    try {
      if (id === 'newEvent') { tab = 'new'; return render(); }
      if (id === 's_cancel') { tab = 'by-parent'; return render(); }
      if (id === 's_save') {
        const err = $('#s_err'); err.hidden = true;
        try {
          if (tab === 'new') { await call('createEvent', { settings: collect(), eventId: undefined }); tab = 'settings'; render(); $('#s_ok').textContent = 'Event created. Copy the parent link below and send it out.'; }
          else { await call('saveEvent', { settings: collect() }); render(); $('#s_ok').textContent = 'Saved. Parents see the new times straight away.'; }
        } catch (x) { err.hidden = false; err.textContent = x.message || 'Could not save. Try again.'; }
        return;
      }
      if (id === 's_copy') {
        const input = $('#s_link');
        try { await navigator.clipboard.writeText(input.value); } catch (x) { input.select(); document.execCommand('copy'); }
        e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy link'; }, 1800); return;
      }
      if (id === 's_archive') {
        const ev = cur(), archived = ev.status === 'archived';
        if (!archived && !confirm('Archive this event? Parents will no longer be able to book. Existing bookings are kept.')) return;
        await call(archived ? 'restoreEvent' : 'archiveEvent'); return render();
      }
      if (id === 'm_cancel') { $('#moveDlg').close(); return; }
      if (id === 'm_ok') {
        const dlg = $('#moveDlg'), err = $('#m_err'); err.hidden = true;
        try {
          const r = await call('move', { id: dlg.dataset.id, newStart: $('#m_time').value, note: $('#m_note').value });
          dlg.close(); render();
          alert(r.demo ? 'Time changed. (Demo mode: no email was sent.)' : r.emailed === false ? 'Time changed, but the email could not be sent. Please tell the parent yourself.' : 'Time changed. The parent has been emailed.');
        } catch (x) { err.hidden = false; err.textContent = x.message || 'Could not change the time. Try again.'; }
        return;
      }
      const m = e.target.closest('[data-move]');
      if (m) return openMove(m.dataset.move);
      const c = e.target.closest('[data-cancel]'), b = e.target.closest('[data-block]'), u = e.target.closest('[data-unblock]');
      if (c) {
        const bk = data.bookings.find(x => x.id === c.dataset.cancel);
        if (!confirm(`Cancel ${bk.child}'s booking at ${bk.time}? The parent will be emailed and the slot becomes free.`)) return;
        await call('cancel', { id: bk.id }); render();
      } else if (b) { await call('block', { classId: tab, start: b.dataset.block }); render(); }
      else if (u) { await call('unblock', { classId: tab, start: u.dataset.unblock }); render(); }
    } catch (err) { alert(err.message || 'That did not work. Try again.'); }
  });

  $('#eventSel').addEventListener('change', async e => {
    try { await call('list', { eventId: e.target.value }); tab = 'by-parent'; render(); } catch (x) { alert(x.message || 'Could not open that event.'); }
  });
  $('#go').addEventListener('click', () => signIn($('#pass').value));
  $('#pass').addEventListener('keydown', e => { if (e.key === 'Enter') signIn($('#pass').value); });
  $('#refresh').addEventListener('click', async () => { try { await call('list'); render(); } catch (e) { alert(e.message || 'Could not refresh.'); } });
  setInterval(async () => { if (!document.hidden && !$('#dash').hidden && (tab === 'by-parent' || data.classes.some(c => c.id === tab))) { try { await call('list'); render(); } catch (e) {} } }, 20000);

  // ---------- Excel: one sheet per class (every slot listed) plus an "All bookings" sheet
  $('#xlsx').addEventListener('click', () => {
    if (!window.XLSX) return alert('The Excel library could not load. Check your internet connection and try again.');
    const ev = cur(), wb = XLSX.utils.book_new();
    data.classes.forEach(cl => {
      const rows = data.slots.map(s => {
        const b = bookingAt(cl.id, s.start);
        return { Time: s.label, Status: b ? 'Booked' : isBlocked(cl.id, s.start) ? 'Blocked' : 'Free', Child: b ? b.child : '', Parent: b ? b.parent : '', Phone: b ? b.phone : '', Email: b ? b.email : '' };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 9 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, cl.name.slice(0, 31));
    });
    const all = data.bookings.slice().sort((a, b) => a.parent.localeCompare(b.parent) || a.start.localeCompare(b.start))
      .map(b => ({ Parent: b.parent, Phone: b.phone, Email: b.email, Child: b.child, Class: b.className, Time: b.time }));
    const ws = XLSX.utils.json_to_sheet(all);
    ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 30 }, { wch: 24 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'All bookings');
    XLSX.writeFile(wb, `${SHORT}-${ev.title.replace(/[^\w]+/g, '-')}-${ev.date}.xlsx`);
  });

  // ---------- Print: one page per class
  $('#print').addEventListener('click', () => {
    const ev = cur();
    $('#printArea').innerHTML = data.classes.map(cl => `<section><img class="logo-sm" src="logo.png" alt="" onerror="this.remove()"><h2>${esc(cl.name)}</h2><p>${esc(ev.title)}, ${esc(ev.dateLabel)}${cl.teacher ? '. Teacher: ' + esc(cl.teacher) : ''}</p>
      <table><thead><tr><th>Time</th><th>Child</th><th>Parent</th><th>Phone</th><th>Signature</th></tr></thead><tbody>` +
      data.slots.map(s => { const b = bookingAt(cl.id, s.start); return `<tr><td>${esc(s.label)}</td><td>${b ? esc(b.child) : (isBlocked(cl.id, s.start) ? 'Blocked' : '')}</td><td>${b ? esc(b.parent) : ''}</td><td>${b ? esc(b.phone) : ''}</td><td></td></tr>`; }).join('') +
      '</tbody></table></section>').join('');
    window.print();
  });

  if (pass) signIn(pass);
})();
