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

/* ── Intersection reveal ── */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); } });
  }, { threshold: 0.18 });
  document.querySelectorAll('[data-reveal]').forEach(el => obs.observe(el));
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initScroll();
  initReveal();
});
