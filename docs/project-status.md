# DeliveryBoys project status

The live web app is [deliveryboys-v3.vercel.app](https://deliveryboys-v3.vercel.app), deployed from `main`. Changes should reach `main` through a pull request, not a direct push.

This document records the project summary provided by the owner on 2026-09-19, plus the later sign-in message change in PR #2. It is not a fresh verification of every feature or of the live deployment. Items noted as not browser-checked still need that verification.

## Authentication and navigation

- Google sign-in was configured with Supabase and Google OAuth and verified by the owner on the live site.
- Sign-in does not create accounts. An unknown email or phone shows “This account does not exist.” with a Sign Up button (PR #2).
- Get Started opens sign-in first.
- Manager sign-out crash and fresh-load notification spam were fixed (`8a049bd`). Auto-cancel and dispatch alerts are limited to events during the current page session; browser alerts go to the signed-in user.
- Booking and tracking sheets keep one history entry, and rider order detail has its own back button (`100c355`). **Not checked in a browser.**

## Discounts and pricing

- Managers configure discounts on the Prices tab (`147b262`, `09a7d89`). A first sign-up percentage applies to the first N bookings; all bookings count, including cancelled ones. A seasonal percentage applies after the sign-up offer is used up, or to everyone if its rate is larger.
- The discount applies to the whole fare; commission and rider share each give up the same percentage. Each order stores its commission and discount. The booking page shows the original fare struck through and the applied discount (`8a049bd`). **Not checked in a browser.**
- Cars, vans and trucks use the motorcycle formula, with fuel consumption setting the difference (`aea1d37`). Vans and trucks use a separate manager-set diesel price.
- Commission is GHS 5 plus 10% of rider pay above GHS 15 for every vehicle (`9c15dca`). A 15% commission change was later reverted (`a8fb9cc`, `1c98833`). The Price Rules table was removed (`cfe0195`).

## Customer experience

- Ratings were removed from customer and rider screens.
- The home hero includes a welcome, name, tagline, Book a Delivery and Track Orders buttons (`ee10eac`, `d09f33a`, `51073a1`). The visitor homepage shows the photo without animated tiles (`8bde871`).
- The Services page and home section show the same five services; Grocery was merged into Food and Corporate Deliveries removed (`a720293`, `b803b73`, `d8b76a5`, `87efd90`). **Not checked in a browser.**
- Location search combines and deduplicates Mapbox and OpenStreetMap results (`690e0b9`). **Not checked live.** Map loading displays a spinner and “Loading map…” (`c3b6cc0`).
- The booking page follows the client's mockup; item categories include Documents and Others (`557194b`).

## Rider, legal and about

- Rider home retains this week's earnings, removes the deliveries-today and earned-today boxes, and has a glass-style Go to Dashboard button (`634aeaa`).
- Riders can edit their phone numbers. The name is derived from the email until edited (`634aeaa`).
- Rider terms are available at `/terms/rider` and from the rider sidebar (`4cf9540`, `223c94b`). Legal pages use bullets and separated cards (`223c94b`).
- The About page picture was removed (`cfe0195`). Support email: `support.deliveryboysgh@gmail.com` (`0661fb9`).

## Open items

- Add a back button to rider active navigation; the map covers the page header.
- Decide whether the booking pin-drop back arrow should be labelled “Back”.
- Shorten the rider terms.
- Review customer step 04 rating text.
- Remove the home hero typing effect and the animated backgrounds on sign-in and sign-up.
- Make Enter in general search select the first result.
- Decide whether email-derived names should keep digits (for example, `kevinab633` becomes “Kevinab”).
- Confirm the earnings-line wording.
- Browser-check the services and discount changes, as well as the navigation and location-search changes noted above.

## Setup and release notes

- The default Supabase project is configured in `src/lib/supabase.ts`; Vercel environment variables can override it. The Google client secret belongs in the Supabase dashboard, not the repository.
- Android and iOS builds are prepared with Capacitor, but native projects have not yet been generated. See [native build preparation](native-build.md) for build and security requirements.
- Use Node 22; run `npm ci`, `npm run lint`, and `npm run build` to validate changes.
