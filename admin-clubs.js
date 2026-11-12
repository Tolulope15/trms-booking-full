(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₦' + String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const DAYLIST = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday']];
  // Starting list copied from the school's current club form (check every price before you publish).
  const A = (name, price) => ({ name, price });
  const LOWER = ['nursery-1', 'nursery-2', 'year-1', 'year-2', 'year-3'];
  const DEFAULT_DAYS = {
    mon: { classes: LOWER, note: 'Children in the music club are expected to focus on one instrument so that they can be well grounded in it.', activities: [A('Music Club (Guitar and Violin)', 10000), A('Creative Art (Writers, Literary and Debating / Public Speaking)', 15000)] },
    tue: { classes: LOWER, note: '', activities: [A('Igbo Language Club', 10000), A('Yoruba Language Club', 10000), A('Math Club', 10000), A('French', 10000), A('Cookery / Etiquette Club', 25000)] },
    wed: { classes: LOWER, note: 'Children in the music club are expected to focus on one instrument so that they can be well grounded in it.', activities: [A('Mad Science', 25000), A('Music Club (Harmonica, Recorder, Piano)', 15000), A('Ballet / Dance Club', 25000), A('Swimming', 30000)] },
    thu: { note: '', activities: [A('Chess Club', 10000), A('Phonics / Spelling Bee', 10000), A('French Club', 10000), A('Coding and Robotics Club', 35000), A('Creative Art (Writer, Literary and Debating / Public Speaking Club)', 15000)] },
    fri: { note: '', activities: [A('Football', 30000), A('Mad Science', 25000), A('Music Club (Trumpet, Saxophone, Drums)', 15000), A('Art and Craft Club', 15000), A('Drama', 10000), A('Gymnastics', 25000)] }
  };
  let pass = '', data = null, tab = 'bills', filter = 'all', query = '';
  try { pass = sessionStorage.getItem('trms-admin') || ''; } catch (e) {}

  async function call(op, extra) {
    const r = await CLUBS.admin(op, pass, { termId: data ? data.termId : undefined, ...extra });
    if (!r.ok) throw r;
    data = r; return r;
  }
  const termLink = id => new URL('clubs.html?t=' + encodeURIComponent(id), location.href).href;

  async function signIn(p) {
    pass = p;
    try {
      await call('list');
      try { sessionStorage.setItem('trms-admin', pass); } catch (e) {}
      $('#login').hidden = true; $('#dash').hidden = false;
      if (!data.terms.length) tab = 'new';
      render();
    } catch (e) {
      pass = ''; try { sessionStorage.removeItem('trms-admin'); } catch (x) {}
      const el = $('#loginErr'); el.hidden = false; el.textContent = e.message || 'Could not connect. Try again.';
      $('#login').hidden = false; $('#dash').hidden = true;
    }
  }

  // ---------- derived data
  function bills() {
    const m = {};
    data.signups.forEach(s => {
      const b = m[s.billNo] = m[s.billNo] || { billNo: s.billNo, parent: s.parent, email: s.email, phone: s.phone, created: s.created, children: [], total: 0, paidRows: 0 };
      b.children.push(s); b.total += s.total; if (s.status === 'paid') { b.paidRows++; b.paidAt = s.paidAt; b.payNote = s.payNote; }
    });
    return Object.keys(m).map(k => { const b = m[k]; b.paid = b.paidRows === b.children.length; return b; }).sort((a, b) => a.billNo < b.billNo ? 1 : -1);
  }
  function rosters() {
    const out = {};
    data.signups.forEach(s => s.lines.forEach(l => { (out[l.day + '|' + l.activityId] = out[l.day + '|' + l.activityId] || []).push({ child: s.child, className: s.className, parent: s.parent, phone: s.phone, paid: s.status === 'paid' }); }));
    Object.values(out).forEach(a => a.sort((x, y) => x.className.localeCompare(y.className) || x.child.localeCompare(y.child)));
    return out;
  }
  const counts = () => { const r = rosters(), c = {}; Object.keys(r).forEach(k => c[k] = r[k].length); return c; };
  const classOrder = id => data.classes.findIndex(c => c.id === id);

  // ---------- header, stats, tabs
  function renderHeader() {
    const has = data.terms.length > 0;
    $('#termPick').hidden = !has; $('#newTerm').hidden = tab === 'new' || !has && false;
    $('#termSel').innerHTML = data.terms.map(t => `<option value="${esc(t.id)}" ${t.id === data.termId ? 'selected' : ''}>${esc(t.title)}${t.status === 'archived' ? ' (archived)' : t.closed ? ' (closed)' : ''}</option>`).join('');
    const t = data.term;
    $('#title').textContent = tab === 'new' ? 'New club term' : t ? t.title : 'After-school clubs';
    $('#sub').textContent = tab === 'new' ? '' : t ? `${data.classes.filter(c => t.classes.includes(c.id)).map(c => c.name).join(', ')}.` +
      (t.closesLabel ? ` Sign-ups close ${t.closesLabel}.` : ' No sign-up deadline.') + (t.status === 'archived' ? ' This term is archived and hidden from parents.' : '') : '';
  }
  function renderStats() {
    const b = bills(), billed = b.reduce((s, x) => s + x.total, 0), paid = b.filter(x => x.paid).reduce((s, x) => s + x.total, 0);
    const card = (n, l, cls) => `<div class="stat ${cls || ''}"><b>${n}</b><span>${l}</span></div>`;
    $('#stats').innerHTML = card(data.signups.length, 'children signed up') + card(b.length, 'bills') + card(money(billed), 'billed') + card(money(paid), 'paid', 'ok') + card(money(billed - paid), 'still to pay', billed - paid ? 'warn' : '');
  }
  function renderTabs() {
    const unpaid = bills().filter(b => !b.paid).length;
    const tabs = [['bills', 'Bills', `${unpaid} unpaid`], ['lists', 'Activity lists', 'Who is in each club'], ['settings', 'Term settings', 'Prices, link, deadline']];
    $('#tabs').innerHTML = tabs.map(t => `<button class="tab" role="tab" data-tab="${t[0]}" aria-selected="${t[0] === tab}">${esc(t[1])}<small>${esc(t[2])}</small></button>`).join('');
  }

  function render() {
    renderHeader();
    const editing = tab === 'settings' || tab === 'new';
    $('#viewer').hidden = tab === 'new' || !data.term; $('#settingsBox').hidden = !editing;
    if (!data.term && tab !== 'new') tab = 'new';
    if (tab !== 'new') { renderStats(); renderTabs(); }
    $('#pane').hidden = editing;
    if (editing) return renderSettings();
    if (tab === 'bills') renderBills(); else renderLists();
  }

  // ---------- bills
  function renderBills() {
    let list = bills();
    if (filter === 'unpaid') list = list.filter(b => !b.paid); if (filter === 'paid') list = list.filter(b => b.paid);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(b => (b.billNo + ' ' + b.parent + ' ' + b.email + ' ' + b.phone + ' ' + b.children.map(c => c.child).join(' ')).toLowerCase().includes(q));
    $('#pane').innerHTML = `
      <div class="filters"><label for="f_status" class="sr">Show</label>
        <select id="f_status"><option value="all" ${filter === 'all' ? 'selected' : ''}>All bills</option><option value="unpaid" ${filter === 'unpaid' ? 'selected' : ''}>Unpaid only</option><option value="paid" ${filter === 'paid' ? 'selected' : ''}>Paid only</option></select>
        <label for="f_q" class="sr">Search</label><input type="search" id="f_q" placeholder="Search by parent, child or bill number" value="${esc(query)}"></div>
      <div class="tablewrap"><table class="rt"><thead><tr><th>Bill</th><th>Parent</th><th>Phone</th><th>Children</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>` +
      (list.length ? list.map(b => `<tr><td data-l="Bill"><b>${esc(b.billNo)}</b></td><td data-l="Parent">${esc(b.parent)}<br><small>${esc(b.email)}</small></td><td data-l="Phone">${esc(b.phone)}</td>
        <td data-l="Children">${b.children.map(c => esc(c.child) + ' (' + esc(c.className) + ')').join('<br>')}</td><td data-l="Total" class="num"><b>${money(b.total)}</b></td>
        <td data-l="Status">${b.paid ? `<span class="badge booked">Paid</span>` : '<span class="badge blocked">Unpaid</span>'}</td>
        <td class="act"><button class="mini ${b.paid ? '' : 'go'}" data-open="${esc(b.billNo)}">${b.paid ? 'Details' : 'Mark paid'}</button></td></tr>`).join('')
        : `<tr><td colspan="7" class="emptyrow">${data.signups.length ? 'No bills match.' : 'No sign-ups yet. Share the parent link from Term settings.'}</td></tr>`) + '</tbody></table></div>';
  }

  function openBill(billNo) {
    const b = bills().find(x => x.billNo === billNo), dlg = $('#dlg'); if (!b) return;
    dlg.innerHTML = `<form method="dialog" class="movebox">
      <h2>Bill ${esc(b.billNo)}</h2>
      <p><b>${esc(b.parent)}</b><br>${esc(b.phone)}<br>${esc(b.email)}</p>
      ${b.children.map(c => `<div class="billkid"><div class="bk-head"><b>${esc(c.child)}</b> (${esc(c.className)}) <span>${money(c.total)}</span></div>
        <ul class="lines">${c.lines.map(l => `<li><span>${esc(l.dayLabel)}: ${esc(l.name)}</span><span>${money(l.price)}</span></li>`).join('')}</ul>
        ${b.paid ? '' : `<button type="button" class="mini danger" data-cancel="${esc(c.id)}">Cancel this child's sign-up</button>`}</div>`).join('')}
      <div class="totalrow"><span>Total</span><b>${money(b.total)}</b></div>
      ${b.paid ? `<p class="okline">Paid on ${esc(b.paidAt)}${b.payNote ? ': ' + esc(b.payNote) : ''}</p>`
        : `<label for="d_note">Payment note (optional)</label><input type="text" id="d_note" placeholder="For example: GTB transfer, reference 12345"><p class="hint">Marking paid emails the parent a receipt.</p>`}
      <div class="error" id="d_err" hidden></div>
      <div class="formactions">
        ${b.paid ? `<button class="secondary" type="button" data-unpay="${esc(b.billNo)}">Mark unpaid</button>` : `<button class="primary" type="button" data-pay="${esc(b.billNo)}">Mark paid and email receipt</button>`}
        <button class="secondary" type="button" data-resend="${esc(b.billNo)}">Email the bill again</button>
        <button class="secondary" type="button" data-close>Close</button>
      </div></form>`;
    dlg.dataset.bill = billNo; dlg.showModal();
  }

  // ---------- activity lists
  function renderLists() {
    const r = rosters(), t = data.term;
    $('#pane').innerHTML = data.days.map(d => {
      const acts = (t.days[d.key] || {}).activities || [];
      return `<section class="daylist"><h2>${esc(d.label)}</h2>` + (acts.length ? acts.map(a => {
        const rows = r[d.key + '|' + a.id] || [];
        return `<div class="actcard"><div class="ac-head"><b>${esc(a.name)}</b><span>${rows.length} child${rows.length === 1 ? '' : 'ren'} &middot; ${money(a.price)} each</span></div>` +
          (rows.length ? `<div class="tablewrap"><table class="rt"><thead><tr><th>Child</th><th>Class</th><th>Parent</th><th>Phone</th><th>Payment</th></tr></thead><tbody>${rows.map(x =>
            `<tr><td data-l="Child">${esc(x.child)}</td><td data-l="Class">${esc(x.className)}</td><td data-l="Parent">${esc(x.parent)}</td><td data-l="Phone">${esc(x.phone)}</td><td data-l="Payment">${x.paid ? '<span class="badge booked">Paid</span>' : '<span class="badge blocked">Unpaid</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint" style="margin:6px 0 0">No children yet.</p>') + '</div>';
      }).join('') : '<p class="hint">No activities on this day.</p>') + '</section>';
    }).join('');
  }

  // ---------- term form (edit or create)
  function actRow(a, n) {
    return `<div class="actrow" data-id="${esc(a.id || '')}"><input type="text" class="a_name" placeholder="Activity name" value="${esc(a.name || '')}" aria-label="Activity name">
      <input type="text" inputmode="numeric" class="a_price" placeholder="Price" value="${a.price === undefined ? '' : esc(a.price)}" ${n ? 'readonly title="Has sign-ups, so the price is locked"' : ''} aria-label="Price in naira">
      ${n ? `<span class="cnt">${n} signed up</span>` : '<button type="button" class="mini danger" data-rmact>Remove</button>'}</div>`;
  }
  function renderSettings() {
    const creating = tab === 'new', box = $('#settingsBox'), cnt = creating ? {} : counts();
    const src = creating
      ? { title: '', classes: data.term ? data.term.classes.slice() : ['nursery-1', 'nursery-2', 'year-1', 'year-2', 'year-3', 'year-4', 'year-5', 'year-6'], closesAt: '', notifyEmails: (data.term && data.term.notifyEmails) || 'trmsdrive@gmail.com', payNote: '',
          days: JSON.parse(JSON.stringify(data.term ? data.term.days : DEFAULT_DAYS)) }
      : data.term;
    if (creating) Object.values(src.days).forEach(d => d.activities.forEach(a => { delete a.id; }));
    const v = x => esc(x == null ? '' : x);
    box.innerHTML = `
      <h2>${creating ? 'New club term' : 'Term details'}</h2>
      ${creating ? `<p class="hint" style="margin:-4px 0 12px">${data.term ? 'Activities and prices are copied from the term you were viewing.' : 'The activities and prices below come from the school\'s current club form. Check every price before you publish.'}</p>` : ''}
      <div class="grid2">
        <div class="full"><label for="s_title">Title</label><input type="text" id="s_title" value="${v(src.title)}" placeholder="After-School Activities, 1st Term 2026-2027"></div>
        <div class="full"><fieldset><legend>Classes that can sign up</legend><div class="checks">${data.classes.map(c => `<label class="check"><input type="checkbox" data-cls="${esc(c.id)}" ${src.classes.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div></fieldset></div>
        <div><label for="s_closesAt">Sign-ups close (optional)</label><input type="datetime-local" id="s_closesAt" value="${v(src.closesAt)}"><p class="hint">Leave empty to keep sign-up open.</p></div>
        <div><label for="s_notify">Send a copy of every sign-up to</label><input type="text" id="s_notify" value="${v(src.notifyEmails)}"><p class="hint">Separate several emails with commas.</p></div>
        <div class="full"><label for="s_payNote">Extra payment note (optional)</label><input type="text" id="s_payNote" value="${v(src.payNote)}" placeholder="For example: Please pay before Friday 5 December."><p class="hint">Shown on the bill. Bank details come from the school's setup.</p></div>
      </div>
      <h2>Activities and prices (per term)</h2>
      <p class="hint" style="margin:-4px 0 4px">Parents choose one activity per day, or None. ${creating ? '' : 'Activities that already have sign-ups cannot be removed or repriced.'}</p>
      ${DAYLIST.map(([k, label]) => { const d = src.days[k] || { note: '', activities: [] }; return `<div class="dayedit" data-day="${k}"><h3>${label}</h3>
        <fieldset class="dayclasses"><legend>Classes that can join ${label}</legend><div class="checks">${data.classes.filter(c => src.classes.includes(c.id)).map(c => `<label class="check"><input type="checkbox" data-daycls="${esc(c.id)}" ${(!d.classes || !d.classes.length || d.classes.includes(c.id)) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div></fieldset>
        <label for="n_${k}">Note for parents (optional)</label><textarea id="n_${k}" rows="2">${v(d.note)}</textarea>
        <div class="acts">${d.activities.map(a => actRow(a, cnt[k + '|' + a.id] || 0)).join('')}</div>
        <button class="mini" type="button" data-addact="${k}">Add activity</button></div>`; }).join('')}
      <div class="error" id="s_err" role="alert" hidden></div>
      <div class="formactions"><button class="primary" id="s_save" type="button">${creating ? 'Create term' : 'Save changes'}</button>${creating && data.terms.length ? '<button class="secondary" id="s_cancel" type="button">Cancel</button>' : ''}<span class="hint" id="s_ok" role="status"></span></div>
      ${creating ? '' : `<div class="dangerzone"><h2>Parent sign-up link</h2><p class="hint" style="margin-bottom:8px">Send this link to parents. It opens this term's form.</p>
        <div class="linkrow"><input type="text" id="s_link" readonly value="${esc(termLink(data.term.id))}"><button class="secondary" id="s_copy" type="button">Copy link</button></div>
        <h2 style="margin-top:22px">${data.term.status === 'archived' ? 'Restore this term' : 'Archive this term'}</h2>
        <p class="hint" style="margin-bottom:10px">${data.term.status === 'archived' ? 'Parents can sign up again through the link.' : 'Hides the term from parents and turns its link off. Sign-ups and bills are kept.'}</p>
        <button class="mini ${data.term.status === 'archived' ? '' : 'danger'}" id="s_archive" type="button" style="min-height:42px;padding:0 16px">${data.term.status === 'archived' ? 'Restore term' : 'Archive term'}</button></div>`}`;
  }
  function collect() {
    const g = id => $('#' + id).value, days = {}; let bad = '';
    document.querySelectorAll('.dayedit').forEach(el => {
      const acts = [];
      el.querySelectorAll('.actrow').forEach(row => {
        const name = $('.a_name', row).value.trim(), raw = $('.a_price', row).value.trim();
        if (!name && !raw) return;
        const price = Number(raw.replace(/[^\d]/g, ''));
        if (!name) bad = 'Give every activity a name.'; else if (raw === '' || isNaN(price)) bad = `Enter a price for "${name}".`;
        acts.push({ id: row.dataset.id || undefined, name, price });
      });
      days[el.dataset.day] = { note: $('textarea', el).value, activities: acts, classes: [...el.querySelectorAll('[data-daycls]')].filter(i => i.checked).map(i => i.dataset.daycls) };
    });
    return { error: bad, settings: { title: g('s_title'), classes: [...document.querySelectorAll('[data-cls]')].filter(i => i.checked).map(i => i.dataset.cls), closesAt: g('s_closesAt'),
      notifyEmails: g('s_notify'), payNote: g('s_payNote'), days } };
  }

  // ---------- clicks
  document.addEventListener('click', async e => {
    const t = e.target, id = t.id;
    try {
      const tabBtn = t.closest('[data-tab]'); if (tabBtn) { tab = tabBtn.dataset.tab; return render(); }
      if (id === 'newTerm') { tab = 'new'; return render(); }
      if (id === 's_cancel') { tab = 'bills'; return render(); }
      const add = t.closest('[data-addact]');
      if (add) { const holder = add.closest('.dayedit').querySelector('.acts'); holder.insertAdjacentHTML('beforeend', actRow({}, 0)); holder.lastElementChild.querySelector('.a_name').focus(); return; }
      if (t.closest('[data-rmact]')) { t.closest('.actrow').remove(); return; }
      if (id === 's_save') {
        const err = $('#s_err'); err.hidden = true; $('#s_ok').textContent = '';
        const c = collect(); if (c.error) { err.hidden = false; err.textContent = c.error; return; }
        try {
          if (tab === 'new') { await call('createTerm', { settings: c.settings, termId: undefined }); tab = 'settings'; render(); $('#s_ok').textContent = 'Term created. Copy the parent link below and send it out.'; window.scrollTo(0, document.body.scrollHeight); }
          else { await call('saveTerm', { settings: c.settings }); render(); $('#s_ok').textContent = 'Saved. Parents see the changes straight away.'; }
        } catch (x) { err.hidden = false; err.textContent = x.message || 'Could not save. Try again.'; }
        return;
      }
      if (id === 's_copy') { const i = $('#s_link'); try { await navigator.clipboard.writeText(i.value); } catch (x) { i.select(); document.execCommand('copy'); } t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy link'; }, 1800); return; }
      if (id === 's_archive') {
        const arch = data.term.status === 'archived';
        if (!arch && !confirm('Archive this term? Parents will no longer be able to sign up. Existing sign-ups and bills are kept.')) return;
        await call(arch ? 'restoreTerm' : 'archiveTerm'); return render();
      }
      const open = t.closest('[data-open]'); if (open) return openBill(open.dataset.open);
      const dlg = $('#dlg');
      if (t.closest('[data-close]')) return dlg.close();
      const derr = $('#d_err');
      const showErr = x => { if (derr) { derr.hidden = false; derr.textContent = x.message || 'That did not work. Try again.'; } else alert(x.message || 'That did not work.'); };
      const pay = t.closest('[data-pay]');
      if (pay) { try { const r = await call('markPaid', { billNo: pay.dataset.pay, note: ($('#d_note') || {}).value || '' }); dlg.close(); render(); alert(r.emailed === false ? 'Marked paid, but the receipt email could not be sent. Please tell the parent yourself.' : 'Marked paid. The parent has been emailed a receipt.'); } catch (x) { showErr(x); } return; }
      const unpay = t.closest('[data-unpay]');
      if (unpay) { if (!confirm('Mark this bill as unpaid? No email is sent.')) return; try { await call('markUnpaid', { billNo: unpay.dataset.unpay }); dlg.close(); render(); } catch (x) { showErr(x); } return; }
      const resend = t.closest('[data-resend]');
      if (resend) { try { const r = await call('resendBill', { billNo: resend.dataset.resend }); alert(r.emailed === false ? 'The email could not be sent. Try again later.' : 'The bill has been emailed again.'); } catch (x) { showErr(x); } return; }
      const cancel = t.closest('[data-cancel]');
      if (cancel) {
        if (!confirm('Cancel this child\'s sign-up? The parent is emailed and the bill total drops.')) return;
        try { await call('cancel', { id: cancel.dataset.cancel }); dlg.close(); render(); } catch (x) { showErr(x); } return;
      }
    } catch (err) { alert(err.message || 'That did not work. Try again.'); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'f_q') { query = e.target.value; const pos = e.target.selectionStart; renderBills(); const q = $('#f_q'); q.focus(); q.setSelectionRange(pos, pos); } });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-cls]')) { // keep each day's class boxes in step with the term's classes
      const on = [...document.querySelectorAll('[data-cls]')].filter(i => i.checked).map(i => i.dataset.cls);
      document.querySelectorAll('.dayclasses .checks').forEach(box => {
        const was = {}; box.querySelectorAll('[data-daycls]').forEach(i => { was[i.dataset.daycls] = i.checked; });
        box.innerHTML = data.classes.filter(c => on.includes(c.id)).map(c => `<label class="check"><input type="checkbox" data-daycls="${esc(c.id)}" ${was[c.id] === false ? '' : 'checked'}> ${esc(c.name)}</label>`).join('');
      });
    } if (e.target.id === 'f_status') { filter = e.target.value; renderBills(); } });

  $('#termSel').addEventListener('change', async e => { try { await call('list', { termId: e.target.value }); tab = 'bills'; filter = 'all'; query = ''; render(); } catch (x) { alert(x.message || 'Could not open that term.'); } });
  $('#go').addEventListener('click', () => signIn($('#pass').value));
  $('#pass').addEventListener('keydown', e => { if (e.key === 'Enter') signIn($('#pass').value); });
  $('#refresh').addEventListener('click', async () => { try { await call('list'); render(); } catch (e) { alert(e.message || 'Could not refresh.'); } });
  setInterval(async () => { if (!document.hidden && !$('#dash').hidden && !$('#dlg').open && (tab === 'bills' || tab === 'lists') && !(document.activeElement && document.activeElement.id === 'f_q')) { try { await call('list'); render(); } catch (e) {} } }, 30000);

  // ---------- Excel
  $('#xlsx').addEventListener('click', () => {
    if (!window.XLSX) return alert('The Excel library could not load. Check your internet connection and try again.');
    const wb = XLSX.utils.book_new(), t = data.term, b = bills(), r = rosters();
    const sheet = (rows, widths, name) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]); ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
    sheet(b.slice().sort((x, y) => x.billNo < y.billNo ? -1 : 1).map(x => ({ Bill: x.billNo, Parent: x.parent, Phone: x.phone, Email: x.email, Children: x.children.map(c => c.child + ' (' + c.className + ')').join('; '),
      Total: x.total, Status: x.paid ? 'Paid' : 'Unpaid', 'Paid on': x.paid ? x.paidAt : '', 'Payment note': x.paid ? x.payNote : '' })), [12, 24, 16, 30, 40, 12, 9, 12, 30], 'Bills');
    sheet(data.signups.slice().sort((x, y) => classOrder(x.classId) - classOrder(y.classId) || x.child.localeCompare(y.child)).map(s => {
      const row = { Class: s.className, Child: s.child, Bill: s.billNo, Parent: s.parent, Phone: s.phone };
      data.days.forEach(d => { const l = s.lines.find(z => z.day === d.key); row[d.label] = l ? l.name : ''; });
      row.Total = s.total; row.Status = s.status === 'paid' ? 'Paid' : 'Unpaid'; return row; }), [12, 24, 12, 24, 16, 28, 28, 28, 28, 28, 12, 9], 'Children by class');
    const lists = []; data.days.forEach(d => ((t.days[d.key] || {}).activities || []).forEach(a => (r[d.key + '|' + a.id] || []).forEach(x =>
      lists.push({ Day: d.label, Activity: a.name, Child: x.child, Class: x.className, Parent: x.parent, Phone: x.phone, Payment: x.paid ? 'Paid' : 'Unpaid' }))));
    sheet(lists, [12, 36, 24, 12, 24, 16, 9], 'Activity lists');
    XLSX.writeFile(wb, `TRMS-clubs-${t.title.replace(/[^\w]+/g, '-')}.xlsx`);
  });

  // ---------- Print: one page per day, children listed under each activity
  $('#print').addEventListener('click', () => {
    const t = data.term, r = rosters();
    $('#printArea').innerHTML = data.days.map(d => {
      const acts = (t.days[d.key] || {}).activities || [];
      return `<section><img class="logo-sm" src="logo.png" alt="" onerror="this.remove()"><h2>${esc(d.label)}</h2><p>${esc(t.title)}</p>` + acts.map(a => {
        const rows = r[d.key + '|' + a.id] || [];
        return `<h3 style="margin:14px 0 4px">${esc(a.name)} (${rows.length})</h3><table><thead><tr><th>Child</th><th>Class</th><th>Parent phone</th><th>Paid</th><th>Present</th></tr></thead><tbody>` +
          (rows.length ? rows.map(x => `<tr><td>${esc(x.child)}</td><td>${esc(x.className)}</td><td>${esc(x.phone)}</td><td>${x.paid ? 'Yes' : 'No'}</td><td></td></tr>`).join('') : '<tr><td colspan="5">No children</td></tr>') + '</tbody></table>';
      }).join('') + '</section>';
    }).join('');
    window.print();
  });

  if (pass) signIn(pass);
})();
