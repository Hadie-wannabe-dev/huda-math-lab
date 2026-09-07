/**
 * POST /api/register
 * Body: { parentName, parentEmail, parentPhone, childName, session }
 * session is 'Session 1', 'Session 2', or 'Both'. 'Both' is stored as two rows.
 */

const SEATS_PER_SESSION = 20;
const REAL_SESSIONS = ['Session 1', 'Session 2'];
const VALID_CHOICES = ['Session 1', 'Session 2', 'Both'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function validate(body) {
  const parentName = String(body.parentName ?? '').trim();
  const parentEmail = String(body.parentEmail ?? '').trim().toLowerCase();
  const parentPhone = String(body.parentPhone ?? '').trim();
  const childName = String(body.childName ?? '').trim().replace(/\s+/g, ' ');
  const session = String(body.session ?? '').trim();

  if (parentName.length < 2) return { error: 'Enter the parent or guardian name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(parentEmail)) {
    return { error: 'Enter a valid email address — this is where the invoice goes.' };
  }
  if (parentPhone.replace(/\D/g, '').length < 10) {
    return { error: 'Enter a phone number with at least 10 digits.' };
  }
  if (childName.length < 2) return { error: "Enter the child's name." };
  if (!VALID_CHOICES.includes(session)) {
    return { error: 'Choose Session 1, Session 2, or Both.' };
  }

  return { value: { parentName, parentEmail, parentPhone, childName, session } };
}

function isUniqueViolation(err) {
  const text = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
  return /UNIQUE constraint failed/i.test(text);
}

// Inserts one row for one session, computing Confirmed vs Waitlist atomically.
async function registerOne(env, f, session) {
  const sql = `
    INSERT INTO registrations
      (parent_name, parent_email, parent_phone, child_name, session, status, waitlist_spot)
    SELECT
      ?, ?, ?, ?, ?,
      CASE WHEN taken.n < ${SEATS_PER_SESSION} THEN 'Confirmed' ELSE 'Waitlist' END,
      CASE WHEN taken.n < ${SEATS_PER_SESSION} THEN NULL ELSE taken.n - ${SEATS_PER_SESSION} + 1 END
    FROM (SELECT COUNT(*) AS n FROM registrations WHERE session = ?) AS taken
    RETURNING id, child_name, session, status, waitlist_spot, created_at;
  `;
  try {
    const row = await env.DB.prepare(sql)
      .bind(f.parentName, f.parentEmail, f.parentPhone, f.childName, session, session)
      .first();
    return { session, ok: true, row };
  } catch (err) {
    if (isUniqueViolation(err)) return { session, duplicate: true };
    throw err;
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  const { error, value } = validate(body);
  if (error) return json({ error }, 400);

  const targets = value.session === 'Both' ? REAL_SESSIONS : [value.session];

  try {
    const results = [];
    for (const s of targets) {
      results.push(await registerOne(env, value, s));
    }

    const created = results.filter((r) => r.ok);
    const dupes = results.filter((r) => r.duplicate).map((r) => r.session);

    // Everything was already on file — nothing to add.
    if (created.length === 0) {
      return json(
        {
          error: `${value.childName} is already signed up for ${dupes.join(' and ')} under this email. Check the Login page for the current status.`,
          code: 'DUPLICATE',
        },
        400
      );
    }

    return json(
      {
        ok: true,
        registrations: created.map((r) => ({
          id: r.row.id,
          childName: r.row.child_name,
          session: r.row.session,
          status: r.row.status,
          waitlistSpot: r.row.waitlist_spot,
          createdAt: r.row.created_at,
        })),
        duplicates: dupes, // sessions skipped because they already existed
      },
      201
    );
  } catch (err) {
    console.error('register failed:', err);
    return json({ error: 'The sign-up did not save. Try again in a moment.' }, 500);
  }
}
