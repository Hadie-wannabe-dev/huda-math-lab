/**
 * GET /api/history?email=parent@example.com
 *
 * Returns every registration filed under that email, newest session first.
 * An email with no registrations is a 200 with an empty list, not a 404 —
 * "we looked and found nothing" is a successful lookup.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ error: 'Enter the email address you registered with.' }, 400);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, parent_name, child_name, session, status, waitlist_spot, created_at
         FROM registrations
        WHERE parent_email = ?
        ORDER BY session ASC, created_at ASC`
    )
      .bind(email)
      .all();

    return json({
      ok: true,
      email,
      parentName: results.length ? results[0].parent_name : null,
      registrations: results,
    });
  } catch (err) {
    console.error('history failed:', err);
    return json({ error: 'Could not read the registration list. Try again in a moment.' }, 500);
  }
}
