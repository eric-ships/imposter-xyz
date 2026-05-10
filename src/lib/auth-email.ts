// Magic-link email sending. Wraps Resend so the route can stay
// focused on validation + token storage. In dev (no RESEND_API_KEY
// or NODE_ENV=development), logs the link to the server console
// instead of trying to send — fast iteration without burning sends
// or needing a verified domain.
import { Resend } from "resend";

const FROM_ADDRESS = "Upper <noreply@upper.games>";
const REPLY_TO: string | undefined = process.env.RESEND_REPLY_TO;
// Optional: set RESEND_REPLY_TO to a real inbox so users hitting
// reply land somewhere. Skip otherwise — the email itself is
// transactional.

let _resend: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export async function sendMagicLinkEmail(args: {
  to: string;
  verifyUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Dev fallback: log the link, skip sending. Lets local development
  // iterate without setting up Resend / DNS.
  const c = client();
  if (!c || process.env.NODE_ENV === "development") {
    console.log(
      JSON.stringify({
        event: "magic_link_dev_log",
        to: args.to,
        verifyUrl: args.verifyUrl,
        ts: Date.now(),
      })
    );
    return { ok: true };
  }

  try {
    const { error } = await c.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      replyTo: REPLY_TO,
      subject: "Sign in to Upper",
      html: renderHtml(args.verifyUrl),
      text: renderText(args.verifyUrl),
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "send failed",
    };
  }
}

// Brand-styled HTML. Single-column, centered. Uses inline styles
// since email clients still have inconsistent CSS support.
function renderHtml(verifyUrl: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#262220;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffcf5;border:1px solid #e7e1d4;border-radius:4px;padding:32px;">
          <tr>
            <td style="text-align:center;font-family:Georgia,serif;font-style:italic;font-size:32px;color:#262220;letter-spacing:-0.02em;padding-bottom:24px;">
              Upper
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.55;color:#3a342f;padding-bottom:24px;">
              Click below to sign in. The link is valid for 15 minutes
              and can only be used once.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${escapeAttr(verifyUrl)}"
                 style="display:inline-block;background:#262220;color:#fffcf5;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">
                Sign in
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:1.55;color:#7a736b;padding-bottom:8px;">
              Or paste this link in your browser:
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:1.55;word-break:break-all;color:#7a736b;padding-bottom:24px;">
              <a href="${escapeAttr(verifyUrl)}" style="color:#7a736b;">${escapeText(verifyUrl)}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:11px;line-height:1.55;color:#9a948c;border-top:1px solid #e7e1d4;padding-top:16px;">
              Didn't request this? You can safely ignore this email.
            </td>
          </tr>
        </table>
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;padding-top:16px;">
          <tr>
            <td align="center" style="font-size:11px;color:#9a948c;letter-spacing:0.1em;text-transform:uppercase;">
              upper.games
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(verifyUrl: string): string {
  return `Sign in to Upper

Click the link below to sign in. The link is valid for 15 minutes
and can only be used once.

${verifyUrl}

Didn't request this? You can safely ignore this email.

— upper.games
`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
