// Talks to the Google Apps Script backend for the after-school clubs module.
// (Clubs need the live backend: set apiUrl in config.js, same as the meetings module.)
const CLUBS = (() => {
  const C = window.TRMS_CONFIG || {};
  const live = !!C.apiUrl;
  const none = () => Promise.resolve({ ok: false, code: 'NOAPI', message: 'The Google backend is not connected. Paste your Web app URL into config.js first.' });
  async function remote(action, payload, query) {
    const opts = payload
      ? { method: 'POST', body: JSON.stringify({ action, ...payload }) } // plain-text body: no CORS preflight
      : { method: 'GET' };
    const url = payload ? C.apiUrl : `${C.apiUrl}?action=${action}${query || ''}&_=${Date.now()}`;
    const r = await fetch(url, opts);
    return r.json();
  }
  return {
    live,
    listTerms: () => live ? remote('clubterms') : none(),
    getTerm: id => live ? remote('clubterm', null, '&id=' + encodeURIComponent(id)) : none(),
    signup: req => live ? remote('clubSignup', req) : none(),
    admin: (op, passcode, extra) => live ? remote('clubAdmin', { op, passcode, ...extra }) : none()
  };
})();
