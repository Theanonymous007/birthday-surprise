# Birthday Surprise — GitHub Pages + Supabase Free

This replaces the earlier Cloudflare/R2 deployment package. The birthday experience and supplied music are unchanged. It uses a private Supabase Storage bucket and one public Edge Function. No database tables or browser API keys are required.

## What is included

- `docs/`: the complete website, published with GitHub Pages.
- `docs/config.js`: your public Supabase project URL, read from your screenshot. Check that it matches your project's Connect dialog.
- `supabase/functions/birthday-surprises/index.ts`: paste this entire file into the Supabase Edge Function editor.
- `supabase/config.toml`: preserves the public-function setting for future CLI deployments.

## Supabase setup

1. Create a project in a Free organization. Save your database password privately.
2. In Storage, create the bucket `birthday-surprises`. Keep Public bucket OFF. Default file-size and MIME-type settings are sufficient. Do not add a public read/list policy.
3. Open Edge Functions > Deploy a new function > Via Editor.
4. Name the function `birthday-surprises`. Replace ALL of the example `index.ts` with the included function file, then click Deploy function.
5. Open the function's Settings > Function configuration. Turn OFF **Verify JWT with legacy secret**, then Save changes. This function is deliberately public so recipients do not need an account. Its own code accepts only constrained create/read requests and unguessable surprise IDs; the underlying storage stays private.
6. Open the function URL shown by Supabase. It should return `{"ok":true,"service":"birthday-surprises","storage":"ready"}`. If it says the bucket is missing or public, correct the bucket settings first.

The function reads Supabase's built-in server environment credentials. You do not paste a database password, service-role key, or secret key into GitHub, HTML, JavaScript, or chat.

## GitHub Pages setup

1. Extract the new ZIP and open its `birthday-supabase` folder.
2. Upload the contents to your existing GitHub repository. Ensure `docs` appears directly at repository root, not nested inside another `birthday-supabase` folder. The old `web`, `server`, and Wrangler files are not used by this version and may remain while you migrate.
3. On GitHub Free, the repository must be public to use GitHub Pages. Keep personal photos out of the repository; use the website's upload form after deployment.
4. In the repository, open Settings > Pages. Under Build and deployment, select Deploy from a branch, branch `main`, folder `/docs`, then Save.
5. Wait for GitHub's deployment to finish and open the URL shown on that page. No Cloudflare setup or R2 billing activation is used.
6. Enter the person's details, upload photos, and click Create surprise link. Open the generated link in a private/incognito window to verify it before sending it.

If your project URL changes, edit only `docs/config.js`. The current configured URL is `https://glkgpbaipajvvcsarknq.supabase.co`. The function name must remain `birthday-surprises` unless you also update `docs/backend.js`.

## How links work

Each save generates a random 192-bit identifier. Photos, optional audio, and a JSON manifest are saved under that identifier in the private bucket. The function has no list-all, edit, or delete API. Anyone holding the complete surprise URL can view that surprise. Individual files use temporary signed URLs; the recipient link remains the same and obtains fresh media URLs when reopened. New saves are independent snapshots.

The included song stays in GitHub Pages assets and plays after the recipient taps Open my surprise. Uploaded replacement audio stays in Supabase. The default pictures are sample scenery; uploaded photos replace them. Existing links from the earlier hosted site do not automatically migrate into this new Supabase bucket.

## Free-plan limits

Supabase Free currently includes 1 GB of file storage and pauses projects after one week of inactivity. A paused project must be resumed in the dashboard before its surprise links work. Check the project before the birthday, especially if the link was made well in advance. Limits and account policies are set by Supabase: https://supabase.com/pricing.

The app permits up to five photos (10 MB each before browser resizing; 2 MB each after processing), optional audio up to 8 MB, and an 18 MB total upload. This public creator has no visitor accounts or per-user quotas. Monitor your Free usage if you distribute the creator page widely. The app never automatically sends a message.

## Troubleshooting

- **401 / Missing authorization header:** turn off Verify JWT with legacy secret for this function, then Save changes.
- **Bucket error:** use the exact private bucket name `birthday-surprises` in the same project as the function.
- **Website loads but saving fails:** confirm `docs/config.js` has the correct project URL and the function's health URL returns storage ready.
- **GitHub displays a README or 404:** choose `main` and `/docs` in Settings > Pages, and confirm `docs/index.html` exists at repository root.
- **A previously working link stops loading:** check whether Supabase paused the Free project or the storage allowance was reached.
- **No immediate music:** tap Open my surprise first; browser sound requires a user gesture.

## Verification

The original six-chapter journey passed desktop Chromium, mobile Chromium, and mobile-sized WebKit checks. The Supabase adapter passed local API checks with mocked Storage and a mobile browser flow covering upload, a separate recipient, a signed photo redirect, captions, reload, and the GitHub repository path. It still needs verification with your live Supabase project after you deploy it; local checks cannot verify your dashboard's bucket and JWT settings.

## References and credits

- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://supabase.com/docs/guides/functions/auth#public-functions
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/storage/serving/downloads
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Photo/font credits: `docs/CREDITS.md`. The supplied MP3 is included unchanged.
