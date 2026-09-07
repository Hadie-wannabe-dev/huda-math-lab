/**
 * POST /api/register
 *
 * Body: { parentName, parentEmail, parentPhone, childName, session }
 *
 * Assigns "Confirmed" to the first SEATS_PER_SESSION sign-ups in a session and
 * "Waitlist" (with a spot number) to everyone after. Rejects duplicates of the
 * same (parent email, child name, session) with a 400.
 */

const SEATS_PER_SESSION = 20;
const VALID_SESSIONS = ['Session 1', 'Session 2'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function validate(body) {
  const parentName = String(body.parentName ?? '').trim();
  const parentEmail = String(body.parentEmail ?? '').trim().toLowerCase();
  const parentPhone = String(body.parentPhone ?? '').trim();
  // Collapse runs of whitespace so "Ada  Lovelace" and "Ada Lovelace" collide
  // on the UNIQUE constraint instead of creating two rows.
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
  if (!VALID_SESSIONS.includes(session)) {
    return { error: 'Choose Session 1 or Session 2.' };
  }

  return { value: { parentName, parentEmail, parentPhone, childName, session } };
}

function isUniqueViolation(err) {
  const text = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
  return /UNIQUE constraint failed/i.test(text);
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

  const { parentName, parentEmail, parentPhone, childName, session } = value;

  // One statement, so the seat count and the insert can't be split by a
  // concurrent sign-up. SEATS_PER_SESSION is an internal constant, never user
  // input, so interpolating it into the SQL text is safe.
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
      .bind(parentName, parentEmail, parentPhone, childName, session, session)
      .first();

    if (!row) return json({ error: 'The sign-up did not save. Try again.' }, 500);

    return json(
      {
        ok: true,
        id: row.id,
        childName: row.child_name,
        session: row.session,
        status: row.status,
        waitlistSpot: row.waitlist_spot,
        createdAt: row.created_at,
      },
      201
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return json(
        {
          error: `${childName} is already signed up for ${session} under this email. Check the Login page to see the current status.`,
          code: 'DUPLICATE',
        },
        400
      );
    }

    console.error('register failed:', err);
    return json({ error: 'The sign-up did not save. Try again in a moment.' }, 500);
  }
}
