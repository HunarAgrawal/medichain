# Hosted demo (free)

Run the demo at a public link a client can open, on Hugging Face Spaces' free tier. The free CPU
tier (2 vCPU, 16 GB RAM) runs both AI models comfortably; most free hosting tiers have far too
little memory for them.

## Set it up

1. Make sure this repository is public and the demo files are on `main`
   (`Dockerfile`, `deploy/demo/` and `deploy/huggingface/`).
2. Create a free account at [huggingface.co](https://huggingface.co).
3. Create a Space: **New Space**, name it (for example `medichain-demo`), choose **Docker** with
   the **Blank** template, **CPU basic (free)** hardware and **Public** visibility.
4. Add the two files from `deploy/huggingface/` to the Space, either with **Files → Add file →
   Upload files** in the browser, or with git:

   ```bash
   git clone https://huggingface.co/spaces/<your-username>/medichain-demo
   cp deploy/huggingface/Dockerfile deploy/huggingface/README.md medichain-demo/
   cd medichain-demo && git add . && git commit -m "Add Medichain demo" && git push
   ```

5. The Space builds the image from the GitHub repository. The first build takes about 15 to 20
   minutes; later restarts take a few minutes, mostly seeding the demo data.
6. Share the direct link, `https://<your-username>-medichain-demo.hf.space`. Sign-in uses a
   cookie, which browsers block inside the frame on the Space's own page.

## How it behaves

- **Every restart is a clean workspace** with new keys and a freshly generated month of history.
  Use **Settings → Factory reboot** to reset it, or to rebuild from the latest `main`.
- **It sleeps when idle.** A free Space pauses after a period without visitors and wakes on the
  next visit, which takes a few minutes. Open it before a meeting.
- **It is public.** Anyone with the link can use the demo accounts. The data is fictional and
  temporary, but don't upload real patient images.
- To pin a version, set `ARG MEDICHAIN_REF` in the Space's `Dockerfile` to a tag such as `v0.4.0`.

## Other options

- **Your laptop:** `make demo` runs the same image at <http://localhost:3000>. This is the most
  reliable option in a meeting room.
- **An always-on free server:** Oracle Cloud's Always Free tier includes an Arm VM with 24 GB of
  memory. Install Docker, then `docker build -t medichain-demo . && docker run -d -p 80:7860
  -e PUBLIC_APP_URL=http://<server-address> medichain-demo`. Put HTTPS in front of it before
  sharing the link.
