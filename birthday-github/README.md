# Deploy your birthday website through GitHub

This copy is configured for your own GitHub repository and Cloudflare account. GitHub stores the code; Cloudflare Workers runs the website; an R2 bucket stores the details and photos behind each surprise link. GitHub Pages alone cannot run the sharing API.

## 1. Put the files in GitHub

1. Extract `birthday-github-ready.zip` on your computer.
2. Go to https://github.com/new and create a repository named `birthday-surprise`. A private repository works with Cloudflare's Git integration.
3. In the empty repository, choose **uploading an existing file** (or **Add file > Upload files**).
4. Open the extracted `birthday-github` folder. Upload its CONTENTS: `web`, `server`, `scripts`, `package.json`, `wrangler.jsonc`, `.gitignore`, and this README. Do not upload the ZIP itself or add an extra enclosing folder.
5. Click **Commit changes**. You should see `wrangler.jsonc` directly on the repository's first page, beside `web` and `server`.

The supplied music and sample images are already included. Add the actual recipient's photos through your deployed website; those uploads are stored in R2, not committed to GitHub.

## 2. Create storage in Cloudflare

1. Sign in at https://dash.cloudflare.com/.
2. Open **R2 Object Storage**, enable R2 if prompted, and choose **Create bucket**.
3. Name the bucket exactly `birthday-surprises`. Keep its normal private access setting. The website accesses it through the Worker binding already in `wrangler.jsonc`.

If you prefer a different bucket name, change `bucket_name` in `wrangler.jsonc` to exactly match it. R2 has its own account setup and usage pricing: https://developers.cloudflare.com/r2/pricing/.

## 3. Connect GitHub and deploy

In Cloudflare, open **Workers & Pages > Create application > Import a repository**. Connect your GitHub account and select `birthday-surprise`.

Use these settings:

| Setting | Value |
| --- | --- |
| Worker / project name | `a-little-universe` |
| Production branch | `main` |
| Root directory | Repository root (leave the default) |
| Build command | Leave empty |
| Deploy command | `npx wrangler@4 deploy` |

The Worker name must match `name` in `wrangler.jsonc`. This project needs no separate build step: Wrangler uploads the `web` assets and deploys `server/worker.js` together. It also binds the existing `birthday-surprises` bucket as `BUCKET`.

Choose **Save and Deploy**. When it succeeds, open the provided `workers.dev` URL. Use the URL Cloudflare shows; the account-specific part is assigned by Cloudflare.

## 4. Make and send a surprise

1. Open your deployed website.
2. Add a recipient name, sender, optional age, photos/captions, balloon messages, and letter.
3. Select **Create surprise link**, then **Copy surprise link**.
4. Open that link in a private/incognito window to check it, then send it to the recipient yourself.

Their link opens the personalized gift, not the creator form. Your supplied song starts after they tap **Open my surprise**. Anyone with that link can open the content. Keep the link: there is no account history or recovery screen. Existing links keep working when you update the code while retaining the same bucket.

This deployment gets its own storage. Surprise links created on the earlier hosted website stay on that website; they are not automatically migrated into your Cloudflare account.

## Updating the site

Commit changes to `main` in GitHub. Cloudflare's connected build will deploy the update. Edit the creator's default wording in `web/script.js`; the colors and layout are in `web/style.css`. You can replace `web/assets/music.mp3` while keeping the filename. Asset credits and font licenses are included in `web/CREDITS.md` and `web/assets/`.

## Common setup issues

- **Bucket does not exist:** Create `birthday-surprises` in the same Cloudflare account as the Worker, or correct `bucket_name`.
- **Worker name mismatch:** Set the dashboard name to `a-little-universe`, or change the config's `name` to match your chosen Worker name.
- **Cannot find wrangler.jsonc or server/worker.js:** Upload the extracted folder's contents at repository root, or set Cloudflare's root directory to the folder containing `wrangler.jsonc`.
- **Sharing unavailable:** Confirm the Worker has an R2 binding called `BUCKET` pointing to your bucket. Keep the config binding name unchanged.
- **Music does not start immediately on page load:** Tap **Open my surprise** first; browsers require that interaction for sound.

## Optional local development

With Node.js 22 or newer installed, open a terminal in this folder and run `npm run dev`, then open http://127.0.0.1:4173/. This preview stores test surprises locally in the ignored `.sites-runtime` folder. Localhost links are only for local testing.

`npm run preview` uses Cloudflare's Wrangler local runtime. `npm run deploy` publishes from a terminal after you authenticate to your own Cloudflare account. Neither is necessary for the GitHub dashboard workflow above.

## Official documentation

- GitHub Pages is static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Connect a Git repository to Cloudflare Workers: https://developers.cloudflare.com/workers/ci-cd/builds/
- Build settings: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Static assets and API routing: https://developers.cloudflare.com/workers/static-assets/binding/
- Create an R2 bucket: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Bind R2 to a Worker: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
