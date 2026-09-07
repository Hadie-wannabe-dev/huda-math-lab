/**
 * POST /api/notify
 * Body: { email }
 * Saves an email to the lecture-interest list. A repeat email is a no-op,
 * not an error.
 */

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  
  export async function onRequestPost({ request, env }) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Send a JSON body.' }, 400);
    }
  
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }
  
    try {
      const result = await env.DB.prepare(
        `INSERT INTO lecture_interest (email) VALUES (?) ON CONFLICT(email) DO NOTHING`
      )
        .bind(email)
        .run();
  
      // changes === 0 means the email was already on the list.
      return json({ ok: true, alreadyOnList: result.meta.changes === 0 }, 201);
    } catch (err) {
      console.error('notify failed:', err);
      return json({ error: 'Could not save your email. Try again in a moment.' }, 500);
    }
  }
