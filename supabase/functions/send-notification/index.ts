// Project Nithya — Resend email notification edge function
// Triggered by Supabase Database Webhooks on INSERT to any of the three tables.

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const TO         = 'projectnithya27@gmail.com';
const FROM       = 'Project Nithya <onboarding@resend.dev>';
// ↑ Replace with your verified domain once set up in Resend, e.g.:
//   'Project Nithya <notify@yourdomain.org>'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { table, record } = await req.json();

  let subject = '';
  let html    = '';

  if (table === 'nithya_help_requests') {
    subject = `New Help Request — ${record.name || 'Anonymous'}`;
    html = `
      <h2 style="color:#1479C7">New Help Request</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 12px;color:#666;width:160px">Name</td><td style="padding:6px 12px">${esc(record.name)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${esc(record.email) || '—'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Phone</td><td style="padding:6px 12px">${esc(record.phone) || '—'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Urgency</td><td style="padding:6px 12px">${esc(record.urgency)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Preferred contact</td><td style="padding:6px 12px">${esc(record.preferred_contact) || '—'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Page</td><td style="padding:6px 12px">${esc(record.page) || '—'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;vertical-align:top">Situation</td>
            <td style="padding:6px 12px;white-space:pre-wrap">${esc(record.situation)}</td></tr>
      </table>
      <p style="font-size:12px;color:#999;margin-top:24px">Received ${new Date().toISOString()}</p>
    `;

  } else if (table === 'nithya_donations') {
    subject = `New Donation Intent — ${record.name || 'Anonymous'}`;
    html = `
      <h2 style="color:#D4A800">New Donation Intent</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 12px;color:#666;width:120px">Name</td><td style="padding:6px 12px">${esc(record.name)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${esc(record.email) || '—'}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Amount</td><td style="padding:6px 12px">${esc(record.amount) || '—'}</td></tr>
      </table>
      <p style="font-size:12px;color:#999;margin-top:24px">Received ${new Date().toISOString()}</p>
    `;

  } else if (table === 'nithya_volunteers') {
    subject = `New Volunteer — ${record.name}`;
    html = `
      <h2 style="color:#E8899E">New Volunteer Sign-Up</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 12px;color:#666;width:120px">Name</td><td style="padding:6px 12px">${esc(record.name)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${esc(record.email)}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Role</td><td style="padding:6px 12px">${esc(record.role)}</td></tr>
      </table>
      <p style="font-size:12px;color:#999;margin-top:24px">Received ${new Date().toISOString()}</p>
    `;

  } else {
    return new Response('Unknown table', { status: 400 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: TO, subject, html }),
  });

  const body = await res.json();
  return new Response(JSON.stringify(body), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

function esc(s: unknown): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
