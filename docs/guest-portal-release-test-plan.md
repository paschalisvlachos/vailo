# Vailo — Guest Portal & Admin Release Test Plan

**Use this document for manual QA before/after push to production.**

| Field | Value |
|-------|--------|
| **Release focus** | Guest i18n, mobile typography, per-locale legal, visitor URL copy, RBAC (if not already verified on prod) |
| **Tester name** | _________________________________ |
| **Date** | _________________________________ |
| **Environment** | ☐ Staging  ☐ Production  ☐ Local dev |
| **Build / commit** | _________________________________ |
| **Functions deployed?** | ☐ Yes  ☐ No  ☐ N/A |

---

## How to use

- Work top to bottom; skip sections that do not apply to your property setup.
- Mark each line: **☐** = not tested, **☑** = passed, note failures in **Issues log** at the end.
- For guest tests, use a **real phone** (iOS Safari + Android Chrome) where noted.
- Redeploy **Cloud Functions** before testing `guestLocale` on invites/sessions.

---

## 0. Prerequisites & setup

### 0.1 Deploy & config

- [ ] Cloud Functions deployed (`guestPortalAccess.js` changes for `guestLocale` on sessions).
- [ ] Frontend hosting deployed (guest + admin).
- [ ] Test property has **URL slugs** set (property + at least one unit).
- [ ] Test unit has **Country** and **City/Master Area** set (needed for AI Local Gems).
- [ ] Property **Require guest portal access** toggled ON for access-gate tests (Overview).
- [ ] Platform **Languages** configured (admin) if testing non-English UI.
- [ ] Legal content saved for at least **EN** and one other locale (e.g. EL) in Legal Documents.

### 0.2 Test accounts & data

- [ ] Platform **admin** CRM user (full panel).
- [ ] **Agent** or **Owner** CRM user assigned to test property (scoped access).
- [ ] **Listing-only** user assigned to a single unit only (if RBAC not yet verified on prod).
- [ ] At least one **reservation** with complete guest details (name, email, language).
- [ ] At least one **visitor** row on Visitor access with valid code.
- [ ] Sample **Local Gems**, **Features**, **House Guide** sections with text to translate.

---

## 1. Admin — role-based access (RBAC)

### 1.1 Platform admin

- [ ] Sign in as platform admin → sees full admin menu (properties, areas, billing, legal, knowledge, etc.).
- [ ] No “Switch to” scope bar (or bar hidden for platform scope).
- [ ] Can open any property and all property tabs.

### 1.2 Property owner / agent (property scope)

- [ ] Sign in as agent/owner → lands on **Properties** (not full platform menu).
- [ ] Scope bar shows assignment label; **Switch to** dropdown lists only assigned properties/listings.
- [ ] Selecting another assignment navigates to correct property/listing.
- [ ] Can access property tabs allowed for property-level access (not listing-only).
- [ ] Cannot open unrelated properties via direct URL (redirect or guard).

### 1.3 Listing-only user

- [ ] Sign in as listing-only user → only assigned unit visible.
- [ ] Property tabs limited to **Property Listings** + **House Guide** (others hidden/blocked).
- [ ] Opening disallowed tab URL shows guard / redirect.
- [ ] Can edit house guide for assigned unit only.

### 1.4 Deactivated CRM user

- [ ] Deactivated agent/owner cannot access admin (expected denial).

---

## 2. Admin — Legal documents (per language)

Path: **Admin → Legal Documents** (platform).

### 2.1 Language bar

- [ ] **Language** selector switches `contentLocale` (e.g. EN / EL).
- [ ] Privacy Policy editor loads/saves content for **selected language only**.
- [ ] Terms of Use loads/saves per selected language.
- [ ] **Agreement** rich text loads/saves per selected language.

### 2.2 Legal file uploads

- [ ] Upload document in **Legal** category with locale tag.
- [ ] File list filters to current `contentLocale` (other locales’ files hidden).
- [ ] Switch language → correct files shown for that locale.
- [ ] Download/open uploaded file works.

### 2.3 Guest-facing resolution

- [ ] With guest portal in **English**, Privacy/Terms modals show EN HTML.
- [ ] Switch guest language to **Greek** (or other configured locale) → modals show that locale (or fallback to EN if missing).

---

## 3. Admin — Reservations & invitations

Path: **Property → Reservations**.

### 3.1 Guest details & language

- [ ] Create/edit reservation: **Guest language** field available and saves.
- [ ] Guest details incomplete → invite send blocked with clear message.

### 3.2 Send invitation

- [ ] **Send invite** succeeds when access control ON and slugs set.
- [ ] Modal shows **invite URL** + **password**.
- [ ] Invite URL includes `invite=` token.
- [ ] Invite URL includes `lang=` when guest language set (e.g. `?lang=el`).
- [ ] Copy invite (URL + password) works.

### 3.3 Guest portal link (reservation row)

- [ ] **Copy link** copies public portal URL (`https://vailo.app/...` or env override).
- [ ] URL includes `typeId=` query param.
- [ ] Warning shown if slugs missing.

### 3.4 Reinvite & revoke

- [ ] **Reinvite** generates new credentials; old invite stops working.
- [ ] **Unsend / revoke** blocks prior guest access until new invite.

### 3.5 Calendar sync bookings

- [ ] Synced booking with guest details can receive invite (if applicable).
- [ ] WhatsApp link on reservation works when phone present.

---

## 4. Admin — Visitor access

Path: **Property → Visitor access** (requires **Require guest portal access** ON).

### 4.1 Gate when access control OFF

- [ ] With access control OFF → page shows amber notice (not full visitor UI).

### 4.2 Create & manage visitors

- [ ] **Add visitor**: unit, name, email, duration required.
- [ ] New visitor receives **access code** (toast shows code).
- [ ] Visitor appears in table with correct unit, duration, code.
- [ ] **Edit** visitor: name/email update; unit locked after create.
- [ ] **Extend for** preset updates validity; status text updates.
- [ ] **Delete** visitor removes row; code stops working on portal.

### 4.3 Copy portal URL (unit column)

- [ ] **Copy icon** next to unit name copies full URL (`https://vailo.app/{property}/{unit}?typeId=...`).
- [ ] Icon shows checkmark briefly after copy.
- [ ] Toast on success; warning if slugs missing.
- [ ] Pasted URL opens correct unit on guest site.

### 4.4 Copy access code

- [ ] Copy icon in **Code** column copies access code only.
- [ ] Code works at guest gate (see §5.4).

### 4.5 Filter by unit

- [ ] **All units** / per-unit filter shows correct rows.

---

## 5. Guest — portal access gate

Open portal: `https://vailo.app/{propertySlug}/{unitSlug}` (or staging origin).

### 5.1 Access control OFF

- [ ] Portal loads **without** password/code gate.
- [ ] All main sections visible (essentials, gems, etc.).

### 5.2 Invitation flow

- [ ] Open invite URL → gate shows guest password form.
- [ ] Wrong password → error message.
- [ ] Correct password → portal loads; session persists on refresh.
- [ ] `?lang=` on invite URL sets initial UI language (until guest changes it).

### 5.3 On-stay / NFC activation

- [ ] During booking dates, on-site activation path grants access (if NFC/QR configured).
- [ ] Outside stay dates → access denied with clear message.

### 5.4 Visitor access code

- [ ] Open portal without invite → choose **I have a guest visitor access code**.
- [ ] Enter valid code → access granted.
- [ ] Invalid/expired code → error.
- [ ] Deleted visitor code → no longer works.

### 5.5 Admin preview

- [ ] Signed-in admin opens preview URL (`adminPreview=1`) → amber bar shown.
- [ ] Preview session does not mix with normal guest session on same device.

### 5.6 Cancelled / expired stay

- [ ] Cancelled reservation → appropriate denial message.
- [ ] Expired portal access → expiration message.

---

## 6. Guest — language & i18n

### 6.1 Language menu

- [ ] Language control visible on portal hero (and AI Concierge / Assistant headers).
- [ ] Changing language updates **UI labels** (buttons, gate text, section labels).
- [ ] Choice persists in **localStorage** after reload.

### 6.2 Invite default vs manual override

- [ ] First visit via invite with `?lang=el` → UI starts in Greek (if strings exist).
- [ ] Guest switches to English → reload keeps **manual** choice (not invite default).
- [ ] Clear site data → invite `lang` applies again on next invite open.

### 6.3 UI string fallback

- [ ] Locale with partial translations → missing keys show **English** fallback (no blank labels).

### 6.4 Auto-translate host content

- [ ] **Local Gems** name/description translate when language ≠ source language.
- [ ] **Property essentials** accordion text translates.
- [ ] **Local Services** descriptions translate (where shown).
- [ ] **Expandable description** “More/Less” still works after translation.
- [ ] Second visit same text → no obvious re-fetch flicker (cache behavior acceptable).

### 6.5 Legal footer

- [ ] **Privacy Policy** / **Terms** open modal in active guest language.
- [ ] Content matches admin locale version or EN fallback.

---

## 7. Guest — main portal UX

### 7.1 Hero & navigation

- [ ] Hero shows property/unit name, location, weather card.
- [ ] **Live Like a Local** CTA opens AI Concierge.
- [ ] Wi‑Fi card shows name/password; **copy password** works.
- [ ] **Map** sheet opens; Open in Maps / Directions links work.
- [ ] **Google rating** card opens review URL when configured.

### 7.2 Essentials & services

- [ ] **Things to know** accordions open/close.
- [ ] **Ask 24/7 Assistant** from essentials opens assistant.
- [ ] **Local Services** list + detail modal; WhatsApp/email when set.

### 7.3 Local Gems

- [ ] Category filters work; gem cards show image, badges, distance.
- [ ] **More/Less** on long descriptions.
- [ ] **Show on map** embed loads.
- [ ] **Load more** when many gems.

### 7.4 Floating actions

- [ ] **24/7 Assistant** FAB opens assistant.
- [ ] **Report Issue** opens sheet; submit sends (or shows validation).
- [ ] **WhatsApp** FAB visible when host WhatsApp configured.

### 7.5 PWA / Add to home

- [ ] Install banner appears when eligible; dismiss works.
- [ ] iOS install instructions modal readable on phone.

---

## 8. Guest — AI Concierge (Live Like a Local)

### 8.1 Entry & header

- [ ] Opens full-screen on mobile; back closes to portal.
- [ ] Language menu works inside Concierge.
- [ ] Welcome card shows property/unit and area copy.

### 8.2 Wizard

- [ ] **Location** step: near property + custom town; disambiguation when needed.
- [ ] **Categories** step: select up to 3; continue disabled until ≥1.
- [ ] **Distance** step: options load from starting point.
- [ ] **Time** step: start time + duration; timeline vs browse modes.
- [ ] Progress labels readable on phone (no illegible micro text).

### 8.3 Plan results

- [ ] **Timeline** plan: times, images, descriptions, map View/Go buttons.
- [ ] **Picks** carousel scrolls; badges (Vailo pick, seen before, extended range).
- [ ] **Plan overview map** button works.
- [ ] **Plan another day** resets flow.
- [ ] Pick feedback thumbs (if shown) register without error.

### 8.4 Free-form chat

- [ ] Chat input **16px+** on iOS (no zoom on focus).
- [ ] Send message; AI reply in **selected guest language**.
- [ ] Thinking indicator during generation.

### 8.5 AI language quality (smoke)

- [ ] Set language **EL** → plan titles/descriptions predominantly Greek.
- [ ] Set language **EN** → English output.
- [ ] Refinement question in chat respects language.

---

## 9. Guest — 24/7 Property Assistant

### 9.1 Consent

- [ ] First open shows **Before we start** + Privacy/Terms links.
- [ ] **Accept & Continue** required before chat.
- [ ] **Cancel** returns to portal.

### 9.2 Chat

- [ ] Suggested prompts tappable; send custom question.
- [ ] Answers scoped to property (no random off-topic filler).
- [ ] **Attach image** + send works for property issue photo.
- [ ] Escalation shows **Report issue** / **WhatsApp** when answer not in guide.

### 9.3 Language

- [ ] Assistant replies match guest **locale** setting.
- [ ] UI strings (placeholders, footer disclaimer) readable on mobile.

---

## 10. Mobile typography & touch targets

Test on **iPhone Safari** and **Android Chrome** (portrait).

### 10.1 Readability

- [ ] Body text comfortable without pinch-zoom on Guest Portal.
- [ ] AiExpertView wizard buttons and chat readable.
- [ ] Assistant consent + chat readable.
- [ ] Legal modals readable.

### 10.2 Touch targets

- [ ] Primary buttons ≥ ~44px tap height (CTA, send, wizard continues).
- [ ] FABs easy to tap without mis-taps.
- [ ] Language menu and back buttons easy to tap.

### 10.3 Inputs

- [ ] Password/code/invite fields do not trigger iOS input zoom (≈16px).
- [ ] Chat textareas usable with on-screen keyboard.

### 10.4 Layout

- [ ] No horizontal scroll on portal main column.
- [ ] Gem cards and carousels scroll smoothly.
- [ ] Safe area respected for bottom FABs / chat bar.

---

## 11. Regression & edge cases

### 11.1 Slugs & deep links

- [ ] Old unit slug (in `previousUrlSlugs`) still resolves.
- [ ] Canonical slug redirects when URL uses legacy segment.
- [ ] `typeId` query still resolves correct unit when slug ambiguous.

### 11.2 Session persistence

- [ ] Valid guest session survives refresh.
- [ ] Logout/clear storage requires re-auth at gate.
- [ ] Different unit URL does not leak prior unit session.

### 11.3 Analytics (if enabled)

- [ ] Key events fire without console errors (portal open, gem expand, AI open).

### 11.4 Performance smoke

- [ ] Portal loads within acceptable time on 4G.
- [ ] AI plan generation shows loading state; no silent hang >2 min.

---

## 12. House Guests admin (language display)

Path: **Property → House Guests** (if used).

- [ ] Guest language column shows correct label from platform languages.
- [ ] Matches `guestLocale` saved on reservation/invite.

---

## Issues log

| # | Section | Steps to reproduce | Expected | Actual | Severity ☐Blocker ☐Major ☐Minor |
|---|---------|-------------------|----------|--------|--------------------------------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA / Tester | | | |
| Product / Owner | | | |

**Release recommendation:** ☐ Approve for production  ☐ Approve with known issues  ☐ Hold — fix blockers first

**Notes:**

_______________________________________________________________________________

_______________________________________________________________________________

_______________________________________________________________________________

---

*Document version: 2026-05-26 — Guest portal i18n, mobile type, legal per locale, visitor URL copy.*
