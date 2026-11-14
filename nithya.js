/* ── Project Nithya — Shared JS ── */

const SUPABASE_URL  = 'https://hdmnkxwpsxlxtrlseaqj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkbW5reHdwc3hseHRybHNlYXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzcxNjIsImV4cCI6MjA4OTk1MzE2Mn0.vEO1ivlzVx5zWwwb5tpFOStZ9ii9X5w49O0Tcr8BFEU';

/* Lazily initialised — only after CDN script has loaded */
function getSB() {
  if (window._nithya_sb) return window._nithya_sb;
  const { createClient } = window.supabase;
  window._nithya_sb = createClient(SUPABASE_URL, SUPABASE_ANON);
  return window._nithya_sb;
}

/* ── Nav float on scroll ── */
function initNav() {
  const nav = document.querySelector('nav');
  if (!nav) return;
  let floating = false;
  window.addEventListener('scroll', () => {
    const should = window.scrollY > 72;
    if (should !== floating) {
      floating = should;
      nav.classList.toggle('nav--float', should);
    }
  }, { passive: true });
}

/* ── Smooth anchor scroll ── */
function initScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) {
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
      }
    });
  });
}

/* ── Help request form ── */
async function submitHelpRequest(formEl, page) {
  const btn  = formEl.querySelector('button[type="submit"]');
  const wrap = formEl.closest('.reach-card') || formEl.closest('.reach-form-wrap');

  const sel = (formEl.querySelector('[name="situation"]')?.value || '').trim();
  const msg = (formEl.querySelector('[name="message"]')?.value  || '').trim();
  const payload = {
    name:              (formEl.querySelector('[name="name"]')?.value   || '').trim() || 'Anonymous',
    email:             (formEl.querySelector('[name="email"]')?.value  || '').trim() || null,
    phone:             (formEl.querySelector('[name="phone"]')?.value  || '').trim() || null,
    situation:         msg ? `${sel} — ${msg}` : sel,
    urgency:           formEl.querySelector('[name="urgency"]')?.value || 'normal',
    preferred_contact: formEl.querySelector('[name="pref"]')?.value    || null,
    page,
  };

  if (!payload.situation) { showFieldError(formEl, 'situation', "Please tell us a little about what's happening."); return; }

  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const { error } = await getSB().from('nithya_help_requests').insert([payload]);
    if (error) throw error;
    showSuccess(wrap, 'reach');
  } catch (err) {
    console.error(err);
    btn.textContent = 'Try again';
    btn.disabled = false;
    showToast('Something went wrong. Please try again, or email us directly.', 'error');
  }
}

/* ── Volunteer form ── */
async function submitVolunteer(formEl) {
  const btn = formEl.querySelector('button[type="submit"]');
  const payload = {
    name:  (formEl.querySelector('[name="name"]')?.value  || '').trim(),
    email: (formEl.querySelector('[name="email"]')?.value || '').trim(),
    role:  formEl.querySelector('[name="role"]')?.value   || 'Other',
  };
  if (!payload.name || !payload.email) { showToast('Please fill in your name and email.', 'warn'); return; }

  btn.textContent = 'Sending…';
  btn.disabled = true;
  try {
    const { error } = await getSB().from('nithya_volunteers').insert([payload]);
    if (error) throw error;
    showSuccess(formEl.closest('.vol-wrap') || formEl, 'vol');
  } catch {
    btn.textContent = 'Try again'; btn.disabled = false;
    showToast('Something went wrong. Please try again.', 'error');
  }
}

/* ── Donation coming-soon popup ── */
function showDonationComingSoon() {
  // Remove any existing popup
  var existing = document.getElementById('don-popup');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'don-popup';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9000',
    'display:flex;align-items:center;justify-content:center',
    'background:rgba(6,41,82,.38)',
    'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)',
    'padding:24px',
    'animation:donFadeIn .18s ease',
  ].join(';');

  overlay.innerHTML = [
    '<style>@keyframes donFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes donSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}</style>',
    '<div style="',
      'background:#F5F0E8;border-radius:20px;',
      'padding:36px 32px;max-width:380px;width:100%;',
      'box-shadow:0 12px 60px rgba(6,41,82,.22);',
      'text-align:center;position:relative;',
      'animation:donSlideUp .22s cubic-bezier(.22,1,.36,1)',
    '">',
      '<button id="don-popup-close" style="',
        'position:absolute;top:14px;right:16px;',
        'background:none;border:none;cursor:pointer;',
        'font-size:18px;color:#5080AA;line-height:1;padding:4px;',
      '">&#x2715;</button>',
      '<div style="font-size:28px;margin-bottom:14px">🌸</div>',
      '<h3 style="',
        'font-family:Cormorant Garamond,serif;font-size:22px;font-weight:500;',
        'color:#062952;margin:0 0 10px;',
      '">Coming soon</h3>',
      '<p style="',
        'font-size:14px;color:#2B5C94;line-height:1.65;margin:0 0 22px;font-weight:300;',
      '">Online donations have not been enabled yet.<br>',
      'To express your interest or donate directly, please reach out to the Project Nithya team.</p>',
      '<a href="#support" id="don-popup-cta" style="',
        'display:inline-block;background:#E8899E;color:#fff;',
        'border-radius:100px;padding:11px 26px;',
        'font-size:14px;font-family:DM Sans,sans-serif;',
        'text-decoration:none;transition:opacity .2s;',
      '">Contact the team</a>',
    '</div>',
  ].join('');

  document.body.appendChild(overlay);

  document.getElementById('don-popup-close').addEventListener('click', function () {
    overlay.remove();
  });
  document.getElementById('don-popup-cta').addEventListener('click', function () {
    overlay.remove();
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

/* ── Donation intent form ── */
async function submitDonation(formEl) {
  const btn = formEl.querySelector('button[type="submit"]');
  const payload = {
    name:   (formEl.querySelector('[name="name"]')?.value   || '').trim() || 'Anonymous',
    email:  (formEl.querySelector('[name="email"]')?.value  || '').trim() || '',
    amount: (formEl.querySelector('[name="amount"]')?.value || '').trim() || null,
  };
  btn.textContent = 'Sending…';
  btn.disabled = true;
  try {
    const { error } = await getSB().from('nithya_donations').insert([payload]);
    if (error) throw error;
    showSuccess(formEl.closest('.don-wrap') || formEl, 'don');
  } catch {
    btn.textContent = 'Try again'; btn.disabled = false;
    showToast('Something went wrong.', 'error');
  }
}

/* ── Helpers ── */
function showSuccess(container, type) {
  const messages = {
    reach: { h: "We've received your message.", p: 'Someone from our team will read this and reach out within 24 hours. You are not alone in this.' },
    vol:   { h: 'Thank you for stepping forward.', p: "We'll be in touch soon with the next steps to join our volunteer network." },
    don:   { h: 'Thank you for your generosity.', p: "Your support makes this work possible. We'll reach out with payment details shortly." },
  };
  const m = messages[type] || messages.reach;
  if (!container) return;
  container.innerHTML = `
    <div class="success-state">
      <div class="success-icon">✓</div>
      <h3>${m.h}</h3>
      <p>${m.p}</p>
    </div>`;
}

function showFieldError(form, name, msg) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return;
  el.classList.add('field-error');
  el.focus();
  showToast(msg, 'warn');
  el.addEventListener('input', () => el.classList.remove('field-error'), { once: true });
}

function showToast(msg, level = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast--${level}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--show'));
  setTimeout(() => { t.classList.remove('toast--show'); setTimeout(() => t.remove(), 400); }, 4000);
}

/* ── Editable site text ──
   Elements marked data-edit="page.section.tagN" can be changed from the
   admin portal (Website Text). Saved text lives in nithya_site_content;
   anything never edited keeps the default written in the HTML.
   ?nithya-edit=1 is the admin preview: it skips loading and lets the
   admin editor drive the page instead. */
const NithyaContent = (function () {
  const ALLOWED = { EM: 1, STRONG: 1, B: 1, I: 1, BR: 1 };
  const DROP    = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1 };
  const originals = {};
  // The admin preview frame is named "nithya-edit" (survives URL redirects).
  const editMode  = window.name === 'nithya-edit' || /[?&]nithya-edit=1(&|$)/.test(location.search);
  let page = null;

  /* Only plain text plus italic / bold / line breaks survive. Used both when
     the admin saves and when visitors load, so stored text can never inject
     markup into the site. */
  function sanitize(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html == null ? '' : html);
    (function clean(node) {
      Array.from(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) return;
        if (ch.nodeType !== 1 || DROP[ch.tagName]) { ch.remove(); return; }
        clean(ch);
        if (ALLOWED[ch.tagName]) {
          while (ch.attributes.length) ch.removeAttribute(ch.attributes[0].name);
        } else {
          ch.replaceWith.apply(ch, Array.from(ch.childNodes));
        }
      });
    })(tpl.content);
    const box = document.createElement('div');
    box.appendChild(tpl.content);
    return box.innerHTML.replace(/\s+/g, ' ').trim();
  }

  function elements(key) {
    return key
      ? document.querySelectorAll('[data-edit="' + CSS.escape(key) + '"]')
      : document.querySelectorAll('[data-edit]');
  }

  function captureOriginals() {
    elements().forEach(function (el) {
      const k = el.dataset.edit;
      if (!(k in originals)) originals[k] = el.innerHTML;
    });
  }

  /* map: { key: html }. Keys missing from the map go back to the HTML default. */
  function apply(map) {
    map = map || {};
    elements().forEach(function (el) {
      const k = el.dataset.edit;
      const next = (k in map) ? sanitize(map[k]) : originals[k];
      if (next != null && el.innerHTML !== next) el.innerHTML = next;
    });
  }

  /* ── Photos for empty image cards (data-edit-img="page.section.photoN") ──
     A slot is either an <img> (src is set) or a placeholder box (a cover
     <img class="slot-img"> is placed inside it). */
  const IMG_BASE   = SUPABASE_URL + '/storage/v1/object/public/assets/site/';
  const imgOriginals = {};

  function imageSlots(key) {
    return key
      ? document.querySelectorAll('[data-edit-img="' + CSS.escape(key) + '"]')
      : document.querySelectorAll('[data-edit-img]');
  }

  // Only photos uploaded through the admin portal (or, in the admin preview,
  // a local not-yet-uploaded file) can ever be shown.
  function imageUrlOk(u) {
    u = String(u || '');
    return u.indexOf(IMG_BASE) === 0 || (editMode && u.indexOf('blob:') === 0);
  }
  function posOk(p) { return /^\d{1,3}% \d{1,3}%$/.test(String(p || '')); }

  function captureImageOriginals() {
    imageSlots().forEach(function (el) {
      const k = el.dataset.editImg;
      if (k in imgOriginals) return;
      imgOriginals[k] = el.tagName === 'IMG'
        ? { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' }
        : { html: el.innerHTML, role: el.getAttribute('role'), label: el.getAttribute('aria-label') };
    });
  }

  function setSlot(el, img) {
    const k = el.dataset.editImg, o = imgOriginals[k];
    const ok = img && imageUrlOk(img.url);
    const pos = ok && posOk(img.pos) ? img.pos : '50% 50%';
    if (el.tagName === 'IMG') {
      if (ok) {
        if (el.getAttribute('src') !== img.url) el.setAttribute('src', img.url);
        el.setAttribute('alt', img.alt || o.alt);
        el.style.objectPosition = pos;
      } else {
        el.setAttribute('src', o.src);
        el.setAttribute('alt', o.alt);
        el.style.objectPosition = '';
      }
      el.classList.toggle('has-img', !!ok);
      return;
    }
    if (ok) {
      let pic = el.querySelector(':scope > img.slot-img');
      if (!pic) {
        pic = document.createElement('img');
        pic.className = 'slot-img';
        pic.loading = 'lazy';
        pic.decoding = 'async';
        el.appendChild(pic);
      }
      if (pic.getAttribute('src') !== img.url) pic.setAttribute('src', img.url);
      pic.alt = img.alt || '';
      pic.style.objectPosition = pos;
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      el.classList.add('has-img');
    } else if (el.classList.contains('has-img')) {
      el.innerHTML = o.html;
      if (o.role) el.setAttribute('role', o.role);
      if (o.label) el.setAttribute('aria-label', o.label);
      el.classList.remove('has-img');
    }
  }

  /* map: { key: {url, alt, pos} }. Keys missing from the map go back to empty. */
  function applyImages(map) {
    map = map || {};
    imageSlots().forEach(function (el) { setSlot(el, map[el.dataset.editImg] || null); });
  }

  function cacheKey() { return 'nithya.content.' + page; }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch (_) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(cacheKey(), JSON.stringify(data)); } catch (_) { /* private mode */ }
  }

  function getRows(table, cols) {
    return fetch(
      SUPABASE_URL + '/rest/v1/' + table + '?select=' + cols + '&page=eq.' + encodeURIComponent(page),
      { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } }
    ).then(function (res) { return res.ok ? res.json() : null; })   // not set up yet → null
     .catch(function () { return null; });                           // offline → null
  }

  async function load() {
    // Last-seen content first (no flash for returning visitors), then refresh.
    const cached = readCache();
    if (cached && cached.text)   apply(cached.text);
    if (cached && cached.images) applyImages(cached.images);
    const [textRows, imgRows] = await Promise.all([
      getRows('nithya_site_content', 'key,html'),
      imageSlots().length ? getRows('nithya_site_images', 'key,url,alt,pos') : Promise.resolve(null),
    ]);
    const next = { text: cached && cached.text, images: cached && cached.images };
    if (textRows) {
      next.text = {};
      textRows.forEach(function (r) { next.text[r.key] = r.html; });
      apply(next.text);
    }
    if (imgRows) {
      next.images = {};
      imgRows.forEach(function (r) { next.images[r.key] = { url: r.url, alt: r.alt, pos: r.pos }; });
      applyImages(next.images);
    }
    if (textRows || imgRows) writeCache(next);
  }

  function init() {
    page = document.body && document.body.dataset.contentPage;
    if (!page) return;
    captureOriginals();
    captureImageOriginals();
    if (editMode) {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'nithya-edit-ready', page: page }, location.origin);
      }
      return;
    }
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    get page() { return page; },
    editMode: editMode,
    originals: originals,
    sanitize: sanitize,
    apply: apply,
    elements: elements,
    imgOriginals: imgOriginals,
    imageSlots: imageSlots,
    applyImages: applyImages,
    imageUrlOk: imageUrlOk,
  };
})();
window.NithyaContent = NithyaContent;

/* ── Intersection reveal ── */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); } });
  }, { threshold: 0.18 });
  document.querySelectorAll('[data-reveal]').forEach(el => obs.observe(el));
}

/* ── Mobile menu ── */
function toggleMobileMenu() {
  const menu   = document.getElementById('mobileMenu');
  const burger = document.getElementById('navBurger');
  if (!menu || !burger) return;
  const open = menu.classList.toggle('is-open');
  burger.classList.toggle('is-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMobileMenu() {
  const menu   = document.getElementById('mobileMenu');
  const burger = document.getElementById('navBurger');
  if (!menu || !burger) return;
  menu.classList.remove('is-open');
  burger.classList.remove('is-open');
  document.body.style.overflow = '';
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initScroll();
  initReveal();

  /* Hamburger handled via onclick in HTML — nothing needed here */

  /* Close mobile menu when a link inside it is clicked */
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', closeMobileMenu);
    });
  }
});
