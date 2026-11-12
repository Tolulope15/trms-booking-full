(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '₦' + String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const COLORS = ['#c9382c', '#2b6fd1', '#b86a00', '#7b4fb0', '#1b8579', '#b03a7b', '#5c6b1f', '#3b5a8a'];
  let term, kids = [], seq = 0, busy = false, fromChooser = false;

  const show = id => { ['loading', 'notice', 'chooser', 'form', 'done'].forEach(x => { $('#' + x).hidden = x !== id; }); $('#bar').hidden = id !== 'form'; };
  const notice = (title, text) => { $('#notice').innerHTML = `<h2>${esc(title)}</h2><p>${text}</p>`; show('notice'); };

  if (!CLUBS.live) return notice('Not connected yet', 'The club sign-up needs the Google backend. Paste your Web app URL into <b>config.js</b> and reload.');

  // ---------- form
  const shownDays = () => term.days.filter(d => d.activities.length);
  const allowed = (d, k) => !k.classId || (d.classes || []).includes(k.classId);
  const kidDays = k => shownDays().filter(d => allowed(d, k));
  const className = id => (term.classes.find(c => c.id === id) || {}).name || '';
  const priceOf = (dayKey, id) => { const d = term.days.find(x => x.key === dayKey); const a = d && d.activities.find(z => z.id === id); return a ? a.price : 0; };
  const kidTotal = k => term.days.reduce((s, d) => s + (k.picks[d.key] && k.picks[d.key] !== 'none' ? priceOf(d.key, k.picks[d.key]) : 0), 0);
  const chosenCount = k => kidDays(k).filter(d => k.picks[d.key]).length;

  function startForm() {
    kids = []; seq = 0; $('#kids').innerHTML = ''; $('#err').hidden = true;
    $('#termTitle').textContent = term.title;
    const w = $('#termWhen'); w.hidden = !term.closesLabel; w.textContent = term.closesLabel ? `Sign up before ${term.closesLabel}` : '';
    $('#changeTerm').hidden = !fromChooser;
    const old = $('#restrict'); if (old) old.remove();
    const rs = term.days.filter(d => d.activities.length && d.classes.length < term.classes.length);
    if (rs.length) {
      const groups = {};
      term.classes.forEach(c => { const open = term.days.filter(d => d.activities.length && d.classes.includes(c.id)); if (open.length < shownDays().length) { const key = open.map(d => d.label).join(', ') || 'no days'; (groups[key] = groups[key] || []).push(c.name); } });
      const lines = Object.keys(groups).map(k => `<li><b>${esc(groups[k].join(', '))}</b>: ${esc(k)} only</li>`).join('');
      $('.intro').insertAdjacentHTML('beforeend', `<div class="restrict" id="restrict"><b>Please note</b><ul>${lines}</ul><p>All other classes can pick activities on every day. Choose your child's class first and the days that do not apply are closed automatically.</p></div>`);
    }
    addKid(); show('form');
  }
  function newKid() {
    const k = { id: ++seq, name: '', classId: '', picks: {}, locked: {}, color: COLORS[(seq - 1) % COLORS.length] };
    term.days.forEach(d => { if (!d.activities.length) k.picks[d.key] = 'none'; });
    kids.push(k); return k;
  }
  function addKid() { const k = newKid(); buildKid(k); syncAll(); return k; }

  function dayHtml(k, d) {
    const name = `k${k.id}-${d.key}`;
    if (!allowed(d, k)) return `<fieldset class="dayblock locked" data-day="${d.key}"><legend>${esc(d.label)}</legend><p class="daynote">No club on ${esc(d.label)} for ${esc(className(k.classId))}. Only ${esc(d.classes.map(className).join(', '))} can join this day.</p></fieldset>`;
    return `<fieldset class="dayblock" data-day="${d.key}"><legend>${esc(d.label)}</legend>
      ${d.note ? `<p class="daynote">${esc(d.note)}</p>` : ''}
      <div class="opts">
        ${d.activities.map(a => `<label class="opt"><input type="radio" name="${name}" value="${esc(a.id)}"><span class="nm">${esc(a.name)}</span><span class="pr">${money(a.price)}</span></label>`).join('')}
        <label class="opt none"><input type="radio" name="${name}" value="none"><span class="nm">None, no club on ${esc(d.label)}</span><span class="pr"></span></label>
      </div></fieldset>`;
  }

  function buildKid(k) {
    const el = document.createElement('section');
    el.className = 'kid'; el.dataset.id = k.id; el.style.setProperty('--rod', k.color);
    el.innerHTML = `
      <div class="kid-head"><h3></h3><button type="button" class="linkbtn" data-remove>Remove</button></div>
      <label for="kn${k.id}">Child's full name</label>
      <input type="text" id="kn${k.id}" autocomplete="off">
      <fieldset><legend>Class</legend><div class="chips">${term.classes.map(c => `<button type="button" class="chip" data-cls="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div></fieldset>
      <div class="days">${shownDays().map(d => dayHtml(k, d)).join('')}</div>
      <div class="kidsum"><span class="prog"></span><b class="ktotal"></b></div>`;
    $('input[type=text]', el).addEventListener('input', e => { k.name = e.target.value; syncKid(k); renderBar(); });
    el.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (chip) { k.classId = chip.dataset.cls; applyClass(k); syncKid(k); renderBar(); }
      else if (e.target.closest('[data-remove]')) { kids = kids.filter(o => o !== k); el.remove(); syncAll(); }
    });
    el.addEventListener('change', e => {
      const r = e.target.closest('input[type=radio]'); if (!r) return;
      k.picks[r.closest('.dayblock').dataset.day] = r.value; syncKid(k); renderBar();
    });
    $('#kids').appendChild(el);
  }

  // A class may be excluded from some days: lock those days and keep the picks on the others.
  function applyClass(k) {
    shownDays().forEach(d => {
      if (!allowed(d, k)) { k.picks[d.key] = 'none'; k.locked[d.key] = true; }
      else if (k.locked[d.key]) { delete k.picks[d.key]; delete k.locked[d.key]; }
    });
    const el = $(`.kid[data-id="${k.id}"]`);
    el.querySelector('.days').innerHTML = shownDays().map(d => dayHtml(k, d)).join('');
    shownDays().forEach(d => { const v = k.picks[d.key]; if (v && allowed(d, k)) { const r = el.querySelector(`input[name="k${k.id}-${d.key}"][value="${v}"]`); if (r) r.checked = true; } });
  }
  function syncKid(k) {
    const el = $(`.kid[data-id="${k.id}"]`); if (!el) return;
    $('h3', el).textContent = k.name.trim() || `Child ${kids.indexOf(k) + 1}`;
    $('[data-remove]', el).hidden = kids.length < 2;
    el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cls === k.classId)));
    el.querySelectorAll('.opt').forEach(o => { const i = o.querySelector('input'); const on = !!i.checked; o.classList.toggle('on', on); });
    const n = kidDays(k).length;
    $('.prog', el).textContent = `${chosenCount(k)} of ${n} days chosen`;
    $('.ktotal', el).textContent = `${money(kidTotal(k))}`;
  }
  function renderBar() {
    const total = kids.reduce((s, k) => s + kidTotal(k), 0);
    $('#totalText').innerHTML = total ? `<span class="pick" style="--rod:var(--forest)">Total ${money(total)} for ${kids.length} child${kids.length > 1 ? 'ren' : ''}</span>` : '<span class="none">Nothing chosen yet</span>';
  }
  function syncAll() { kids.forEach(syncKid); renderBar(); }

  function showErr(items, title) {
    const e = $('#err'); e.hidden = !items.length;
    e.innerHTML = items.length ? `<b>${esc(title)}</b><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    if (items.length) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      const missing = kidDays(k).filter(d => !k.picks[d.key]).map(d => d.label);
      if (missing.length) p.push(`${who}: choose an activity or None for ${missing.join(', ')}.`);
      else if (!term.days.some(d => k.picks[d.key] && k.picks[d.key] !== 'none')) p.push(`${who}: pick at least one activity.`);
    });
    return p;
  }

  $('#addKid').addEventListener('click', () => { const k = addKid(); $(`.kid[data-id="${k.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#changeTerm').addEventListener('click', () => show('chooser'));

  $('#confirm').addEventListener('click', async () => {
    if (busy) return;
    showErr([]);
    const problems = validate();
    if (problems.length) return showErr(problems, 'Finish these before confirming');
    busy = true; const btn = $('#confirm'); btn.disabled = true; btn.textContent = 'Creating your bill…';
    let res;
    try {
      res = await CLUBS.signup({
        termId: term.id, parentName: $('#pname').value, email: $('#pemail').value, phone: $('#pphone').value,
        children: kids.map(k => ({ childName: k.name, classId: k.classId, picks: k.picks }))
      });
    } catch (e) { res = { ok: false, code: 'NET', message: 'No connection. Check your internet and try again.' }; }
    busy = false; btn.disabled = false; btn.textContent = 'Confirm and get bill';
    if (res.ok) return showDone(res);
    if (res.code === 'CLOSED') return notice('Sign-ups are closed', esc(res.message));
    showErr([res.message || 'Something went wrong. Please try again.'], 'Nothing was saved');
  });

  function showDone(res) {
    show('done');
    const email = $('#pemail').value.trim(), b = res.bank || {};
    $('#done').innerHTML = `
      <div class="panel">
        <h2>You're signed up</h2>
        <p>${res.emailed === false ? 'Your sign-up is saved, but we could not send the email. Please screenshot this page and pay using the details below.' : `Your bill has been emailed to <b>${esc(email)}</b>. Check your spam folder if you don't see it.`}</p>
        <div class="billhead"><span>Bill number</span><b>${esc(res.billNo)}</b></div>
        ${res.children.map((c, i) => `<div class="ticket" style="--rod:${(kids[i] || {}).color || COLORS[0]}"><div><b>${esc(c.child)}</b> (${esc(c.className)})
          <ul class="lines">${c.lines.map(l => `<li><span>${esc(l.dayLabel)}: ${esc(l.name)}</span><span>${money(l.price)}</span></li>`).join('')}</ul></div><div class="t">${money(c.total)}</div></div>`).join('')}
        <div class="totalrow"><span>Total to pay</span><b>${money(res.total)}</b></div>
        <div class="bank">
          <b>How to pay</b>
          <dl><dt>Bank</dt><dd>${esc(b.bankName)}</dd><dt>Account number</dt><dd><b id="acct">${esc(b.accountNumber)}</b> <button class="mini" id="copyAcct" type="button">Copy</button></dd>
          <dt>Account name</dt><dd>${esc(b.accountName)}</dd><dt>Reference</dt><dd><b>${esc(res.billNo)}</b></dd></dl>
          <p>After paying, email your proof of payment to <b>${esc(b.evidenceEmail)}</b> and quote <b>${esc(res.billNo)}</b>. You will get a receipt email when the school confirms your payment.</p>
          ${res.payNote ? `<p>${esc(res.payNote)}</p>` : ''}
        </div>
        <p style="margin-top:18px"><button class="secondary" id="again" type="button">Sign up another family</button></p>
      </div>`;
    $('#again').addEventListener('click', () => location.reload());
    $('#copyAcct').addEventListener('click', async e => {
      const t = b.accountNumber; try { await navigator.clipboard.writeText(t); } catch (x) { const r = document.createRange(); r.selectNode($('#acct')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); }
      e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1800);
    });
    window.scrollTo(0, 0);
  }
  // ---------- which sign-up?
  async function main() {
  let list;
  try { list = await CLUBS.listTerms(); } catch (e) { return notice('Could not load the clubs', 'Check your connection and refresh this page.'); }
  if (!list.ok) return notice('Could not load the clubs', esc(list.message || 'Please refresh this page.'));
  $('#school').textContent = list.schoolName;

  async function openTerm(id) {
    let t;
    try { t = await CLUBS.getTerm(id); } catch (e) { return notice('Could not load the clubs', 'Check your connection and refresh this page.'); }
    if (!t.ok) return notice('This sign-up link is not active', 'Please ask the school office for the current link.');
    term = t; $('#event').textContent = t.title;
    if (t.closed) return notice('Sign-ups are closed', `Sign-up for ${esc(t.title)} closed on ${esc(t.closesLabel)}. Please contact the school office.`);
    startForm();
  }
  const wanted = new URLSearchParams(location.search).get('t');
  if (wanted) await openTerm(wanted);
  else {
    const open = list.terms.filter(t => !t.closed);
    if (!open.length) notice('No club sign-ups are open right now', 'Please check back later or contact the school office.');
    else if (open.length === 1) await openTerm(open[0].id);
    else {
      fromChooser = true;
      $('#termCards').innerHTML = open.map(t => `<button class="eventcard" type="button" data-id="${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(t.classes.join(', '))}</span><span class="go">Sign up</span></button>`).join('');
      $('#termCards').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openTerm(b.dataset.id); });
      show('chooser');
    }
  }
  }
  main();
})();
