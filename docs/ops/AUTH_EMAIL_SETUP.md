# Sign-in email setup (P0-1, P1-11)

Reptr signs people in with an email that holds both a link and a 6-digit code. This
page is what has to be true in Supabase and Vercel for that to reach real inboxes.

Status legend: **Code** = done in the repo. **Config** = has to be set in a dashboard.
**Verify** = has to be checked by hand on the live project after each change.

## 1. What the code does (Code)

- The link's address comes from `NEXT_PUBLIC_SITE_URL` (or Vercel's
  `VERCEL_PROJECT_PRODUCTION_URL`), never from the request's Origin/Host headers.
  Production refuses to start a sign-in without it, and it must be `https://`.
  (`src/lib/site-url.ts`)
- `/auth/confirm` accepts two link styles:
  - **Token hash** (recommended template below): opening the link shows a
    "Continue to Reptr" page, and only the button signs in. Mail scanners
    (Outlook Safe Links, Gmail link checks, corporate gateways) open links in emails
    and would otherwise use up the one-time token before the person taps it.
  - **PKCE code** (Supabase's default template): still works, but only in the same
    browser that asked for it.
- The email's 6-digit code can be typed on the login page. This is the path for an
  installed iPhone app (links open in Safari, not the app) and for mail apps that open
  links in their own browser.
- After sign-in, only paths inside the app are followed (`safeNextPath`).
- Rate limits (Postgres-backed): 5 emails per address per 15 min, 20 per network
  address per hour, 8 code guesses per address per 15 min. Supabase applies its own
  limits too.
- A sender failure (Supabase returns a 5xx) is logged as an error, which reaches the
  error webhook / monitoring, so an SMTP outage is noticed. Tokens and email addresses
  are never logged (`src/lib/log.ts` masks them).

## 2. Supabase settings (Config)

Supabase dashboard, project `cyouelhlhgeipxtvapcn`:

1. **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Supabase's own
   sender only delivers to project team members and is capped at a few emails an hour.
   Any of these work: Resend, Postmark, Amazon SES, Mailgun. You need:
   - a sending domain you own (e.g. `mail.reptr.app`) with **SPF**, **DKIM** and
     **DMARC** records added at your DNS host (the provider shows the exact records);
   - sender address `sign-in@<that domain>`, sender name `Reptr`;
   - host, port (465 or 587), username, password from the provider.
2. **Authentication → Rate Limits**: raise "emails sent per hour" from the default to
   what the beta needs (e.g. 100). Keep the OTP verification limit on.
3. **Authentication → Emails → Templates → Magic Link** (and **Confirm signup**, which
   new users get): replace the body with:

   ```html
   <h2>Sign in to Reptr</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   <p>Or enter this code in the app: <strong>{{ .Token }}</strong></p>
   <p>The link and code work once and expire in an hour. If you didn't ask for this, ignore it.</p>
   ```

4. **Authentication → URL Configuration**:
   - Site URL: `https://reptr-three.vercel.app` (or your own domain once added)
   - Redirect URLs: exactly `https://reptr-three.vercel.app/auth/confirm`. Remove
     wildcards such as `/**`; the app only ever sends people to `/auth/confirm`.
     Add `http://localhost:3000/auth/confirm` only on a staging project, never on
     production.
5. **Authentication → Sessions**: keep refresh-token rotation on; a session inactivity
   timeout of 30 days suits a training log.
6. **Authentication → Providers → Email**: keep "Confirm email" on.

## 3. Vercel settings (Config)

Project → Settings → Environment Variables (Production):

| Variable               | Value                            |
| ---------------------- | -------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | `https://reptr-three.vercel.app` |

Redeploy after adding it.

## 4. Verification procedure (Verify, after any change above)

Use two real inboxes, one Gmail and one Outlook/Hotmail, on a phone and a laptop.

1. Enter the Gmail address on the laptop. The email arrives within a minute, not in spam,
   and shows "Reptr" as the sender. Check the message headers show `dkim=pass` and
   `spf=pass`.
2. Tap the link: the "Continue to Reptr" page opens; tap Continue; Today opens.
3. Repeat with Outlook. Wait a minute before tapping (Safe Links scans it first). The
   link must still work.
4. On an iPhone with Reptr installed to the home screen: send a link from inside the
   app, then type the 6-digit code from the email into the app. You are signed in in
   the app itself.
5. Use a link twice: the second time shows "That sign-in link has expired".
6. Ask for 6 links in a row for one address: the 6th is refused with a wait message.
7. In Vercel logs, search for `magic_link_failed`: none with `kind: delivery`.

Record the date and result of each run in the test report.
