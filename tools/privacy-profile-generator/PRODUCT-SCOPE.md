# Privacy Profile Generator: Working Scope

**Status:** Design interview in progress.

## Purpose

Generate format-matching substitute profile values for people who choose not to disclose their real details in forms that do not check authenticity. Values are synthetic, not verified identities, and must not be represented as guaranteed nonexistent.

## Initial profile

- Regions: Mainland China, the United States, the United Kingdom, Japan, and South Korea.
- Fields: name, birth date, address, postal code, email, and mobile number.
- Values in one profile should be internally coordinated for the selected region.
- Show the same profile using the selected region's local-language form and an English transliteration or address rendering. For the United States and United Kingdom, the local-language form is already English.
- Phone values should use the selected region's expected format. For mainland China, Japan, and South Korea, generated values may match numbers assigned to real subscribers; do not describe them as safe for calls or SMS verification. Use published fictional example ranges for the United States and United Kingdom where available.
- Email values use a reserved non-deliverable domain such as `.invalid`.
- Generate one profile at a time and provide per-field copy.
- Generate in the browser and keep all history in persistent browser-local storage, with no app-imposed count or expiry limit and no server. History should survive refresh and browser restarts; provide a manual action to clear the saved history. Browser storage capacity can still limit retention.

## Storage limitation

Persistent browser storage survives reloads and can remain after the browser closes. Users or the browser can still clear it, and browser capacity is finite. See [MDN client-side storage](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Client-side_storage).
