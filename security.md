# Security Audit — Kanisa Kiganjani

**Audit Date:** 2026-04-01  
**Auditor:** Automated Codebase Review

---

## 1. API Keys & Secrets

| Finding | Severity | Status |
|---------|----------|--------|
| `.env` contains only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` — all publishable/client-safe | ✅ OK | No action needed |
| Service role key, Resend API key, R2 credentials stored as Supabase secrets (server-side only) | ✅ OK | Not exposed to client |
| Anon key used in client is Supabase publishable key (designed for client use) | ✅ OK | Correct usage |

**No private keys are exposed in client code.**

---

## 2. Authentication & Authorization

| Finding | Severity | Status |
|---------|----------|--------|
| Auth uses Supabase OTP (email-based) — no password storage | ✅ OK | Secure |
| `useAuth` hook uses `onAuthStateChange` listener set up before `getSession` | ✅ OK | Correct pattern |
| Moderation page (`/moderation`) checks `hasRole` via `useModRole` hook | ⚠️ LOW | Client-side check only — but RLS enforces server-side |
| No route guards on `/moderation` — relies on RLS for data access | ✅ OK | RLS prevents unauthorized data access |
| Email domain restriction added (Gmail, iCloud, Yahoo only) | ✅ OK | Client-side + could add server-side trigger |

---

## 3. Row-Level Security (RLS)

| Table | RLS Enabled | Policies | Status |
|-------|-------------|----------|--------|
| `posts` | ✅ | View approved / own / mod; create own; edit own 12h; delete own 48h; mod/admin override | ✅ OK |
| `comments` | ✅ | Same pattern as posts | ✅ OK |
| `likes` | ✅ | Anyone can view; auth can like/unlike own | ✅ OK |
| `bookmarks` | ✅ | Own only CRUD | ✅ OK |
| `notifications` | ✅ | Own only view/update; create as actor | ✅ OK |
| `profiles` | ✅ | View own (+ admin view all); update own | ✅ OK |
| `profiles_public` | View (security definer) | Exposes only safe fields | ✅ OK |
| `reports` | ✅ | Create own; view own + mod/admin | ✅ OK |
| `user_roles` | ✅ | Admin-only CRUD; view own | ✅ OK |
| `suspensions` | ✅ | View own; admin create; anon read for checks | ✅ OK |

**All tables have RLS enabled with appropriate policies.**

---

## 4. Input Sanitization

| Finding | Severity | Status |
|---------|----------|--------|
| Post content rendered with `dangerouslySetInnerHTML` | ⚠️ MEDIUM | Content is escaped (`&`, `<`, `>`) and only `**bold**` / `*italic*` are converted — **acceptably safe** but consider DOMPurify for defense-in-depth |
| Comment content rendered as plain text (`whitespace-pre-wrap`) | ✅ OK | No HTML injection |
| Username validation uses regex (`/^[a-zA-Z0-9_]+$/`) + length check | ✅ OK | |
| Report reason via `prompt()` — inserted as text into DB | ✅ OK | No HTML rendering |
| Search input used only for `.includes()` filtering | ✅ OK | No injection risk |
| Middle finger emoji detection added for content moderation | ✅ OK | |

### Recommendation
- Consider adding `DOMPurify` as a belt-and-suspenders measure for the `renderContent` function, even though current escaping is adequate.

---

## 5. HTTP Security Headers (vercel.json)

| Header | Value | Status |
|--------|-------|--------|
| Content-Security-Policy | Restrictive CSP with allowed sources | ✅ OK |
| X-Content-Type-Options | `nosniff` | ✅ OK |
| X-Frame-Options | `DENY` | ✅ OK |
| X-XSS-Protection | `1; mode=block` | ✅ OK |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ OK |
| Permissions-Policy | Camera, mic, geolocation disabled | ✅ OK |
| Strict-Transport-Security | 1 year + includeSubDomains | ✅ OK |

---

## 6. Protected Fields

| Finding | Severity | Status |
|---------|----------|--------|
| `protect_profile_fields` trigger prevents non-admin modification of `is_verified`, `ip_address`, `last_login_ip` | ✅ OK | Server-side enforcement |
| `validate_username` trigger blocks reserved usernames (admin, moderator, etc.) | ✅ OK | |
| User roles stored in separate `user_roles` table (not in profiles) | ✅ OK | Prevents privilege escalation |

---

## 7. Storage & Media

| Finding | Severity | Status |
|---------|----------|--------|
| `post-images` bucket is public (read) | ✅ OK | Required for post display |
| `avatars` bucket is public (read) | ✅ OK | Required for avatar display |
| Image compression to WebP (~50KB) reduces bandwidth | ✅ OK | |
| Video file size limited to 50MB client-side | ✅ OK | Consider server-side validation via storage policy |
| File uploads use random UUIDs for paths | ✅ OK | Prevents enumeration |

---

## 8. Edge Functions

| Finding | Severity | Status |
|---------|----------|--------|
| `notify-report` — sends admin email on content reports | ✅ OK | Uses server-side Resend API key |
| `og-image` — generates OG images | ✅ OK | Read-only operation |
| Edge functions use service role key from server secrets | ✅ OK | Not exposed to client |

---

## 9. Summary

### ✅ No Critical Issues Found

The application follows security best practices:
- No private API keys exposed in client code
- RLS enforced on all tables
- Proper auth flow with OTP
- Strict HTTP security headers
- Protected fields with server-side triggers
- Role-based access control via separate table

### ⚠️ Low-Priority Recommendations
1. **Add DOMPurify** to `renderContent()` for defense-in-depth against XSS
2. **Add server-side email domain validation** via Supabase auth hook/trigger (currently client-side only)
3. **Enable leaked password protection** in Supabase dashboard (warning from linter — low priority since app uses OTP, not passwords)
4. **Add storage RLS policies** to restrict who can upload to buckets (currently relies on client-side checks)
5. **Consider rate limiting** on post/comment creation to prevent spam
