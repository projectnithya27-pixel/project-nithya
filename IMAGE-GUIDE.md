# How to Add Images to the Website

Images are stored in Supabase Storage. You upload once, copy the public URL,
and paste it into the HTML file. No code knowledge needed.

---

## Step 1 — Create a storage bucket (one-time setup)

1. Go to your Supabase project dashboard → **Storage** (left sidebar)
2. Click **New bucket**
3. Name it **`images`**
4. Tick **Public bucket** → click **Create bucket**

---

## Step 2 — Upload an image

1. Open the **`images`** bucket
2. Click **Upload file**
3. Choose your image (JPG, PNG, WebP all work — keep files under 5 MB for fast loading)
4. Optionally create folders to stay organised, e.g.:
   - `mental-health/` for Mental Health page images
   - `safety/` for Safety & Refuge images
   - `health-guidance/` for Health Guidance images

---

## Step 3 — Get the public URL

1. Click the uploaded file in the bucket
2. Click **Get URL** (top-right) — it looks like:
   ```
   https://hdmnkxwpsxlxtrlseaqj.supabase.co/storage/v1/object/public/images/mental-health/support.jpg
   ```
3. Copy that URL.

---

## Step 4 — Paste it into the HTML file

Each page has an image placeholder that looks like this in the HTML:

```html
<img src="" alt="Project Nithya mental health support — add image here">
```

Open the relevant HTML file and paste your URL into the `src=""`:

```html
<img src="https://hdmnkxwpsxlxtrlseaqj.supabase.co/storage/v1/object/public/images/mental-health/support.jpg"
     alt="Project Nithya mental health support">
```

### Which file → which image

| Page | HTML file | What the image is for |
|---|---|---|
| Mental Health | `mental-health.html` | Feature block (image + text section) |
| Safety & Refuge | `safety.html` | Feature block (image + text section) |
| Health Guidance | `health-guidance.html` | Feature block (image + text section) |

Search for `src=""` in the file to find the placeholder quickly.

---

## Tips

- **Portrait vs landscape:** The image slot is a 4:3 rectangle. Landscape photos work best.
- **Alt text:** Always describe the image in the `alt=""` — this matters for accessibility.
- **File names:** Use lowercase with hyphens, no spaces: `mental-health-support.jpg` not `Mental Health Support.jpg`.
- **Replacing an image:** Upload the new file, get its URL, paste it over the old URL in the HTML.

---

## Committing the change

After editing the HTML file, ask Claude to commit and push the change to GitHub so it goes live.
