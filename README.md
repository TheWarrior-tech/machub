# Mac Hub — Android app

A local-AI companion app for your Mac, modeled on the DGX Spark app's UI
(black theme, pill nav bar, device hero card) — pointed at Ollama running
on your Mac instead of a DGX Spark, and reached over Tailscale.

## What's inside

- `www/` — the actual app (HTML/CSS/JS): Home (your Macs), device detail
  (status + model list + download), Chats (streams from Ollama's
  `/api/chat`), Activity log, More/settings.
- `android/` — a ready-to-open Android Studio project (Capacitor wraps
  the web app in a native WebView shell).

I can't compile the signed `.apk` from this sandbox — there's no Android
SDK or Gradle here, and network access is locked to a few package
registries (no `dl.google.com`). This project is fully set up so building
it on your end is one step.

## Build the APK (zero local installs — GitHub Actions builds it for you)

This project already includes `.github/workflows/build-apk.yml`, which
compiles the debug APK on GitHub's servers, not yours.

1. Create a new (can be private) GitHub repo and push this whole folder to it:
   ```bash
   cd mac-hub-android
   git init
   git add .
   git commit -m "Mac Hub"
   git branch -M main
   git remote add origin https://github.com/<you>/mac-hub-android.git
   git push -u origin main
   ```
2. Go to the repo's **Actions** tab — a "Build APK" run starts automatically
   (or click **Run workflow** if it doesn't).
3. When it finishes (~2 min), open the run → **Artifacts** →
   download `mac-hub-debug-apk` (this is a zip containing `app-debug.apk`).
4. Send that `.apk` to your phone (Drive, email, USB — any way you like)
   and install it.

No Android Studio, no SDK, nothing to set up on your machine.

## Build the APK (fastest if you already have Android Studio)

1. Install **Android Studio** if you don't have it: https://developer.android.com/studio
2. Open this folder's `android/` directory as a project (**File → Open**).
3. Let Gradle sync (first time only — pulls the SDK bits it needs).
4. **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
5. Click the "locate" link in the notification, or find it at:
   `android/app/build/outputs/apk/debug/app-debug.apk`
6. AirDrop/USB/email that file to your phone and install it (you'll need
   to allow "install unknown apps" for whichever app you send it through).

## Build the APK (command line, if you have the Android SDK installed)

```bash
cd android
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```

## Before you build: set up the Mac side

1. Install [Tailscale](https://tailscale.com/download) on your Mac and
   your Android phone, and sign in to the same account on both.
2. On the Mac, install [Ollama](https://ollama.com) and run it with
   cleartext origins allowed (Ollama blocks unrecognized origins by
   default, and the app's WebView origin isn't one it knows):
   ```bash
   OLLAMA_ORIGINS=* ollama serve
   ollama pull llama3.2
   ```
   If you'd rather not allow all origins, set
   `OLLAMA_ORIGINS=capacitor://localhost,http://localhost` instead.
3. Find your Mac's Tailscale hostname (Tailscale app → your Mac →
   copy the `*.ts.net` name), or its Tailscale IP (`tailscale ip`).

## Using the app

- **Home → Add Mac**: name it, enter `your-mac.tailXXXX.ts.net:11434`
  (or `100.x.x.x:11434`), it pings Ollama's API to confirm the connection.
- **Device screen**: shows connection health, installed models, and lets
  you download more (`llama3.2`, `qwen2.5-coder`, `phi4`, `mistral` are
  pre-listed — type any other Ollama model name too).
- **Chats**: pick a model, chat — streams token-by-token straight from
  Ollama on your Mac.
- **Activity**: log of adds/downloads.

## Scope — what's real vs. approximated

Built from 4 screenshots of the original app, not the full thing, so:

- **Solid / verified against docs:** the Ollama API calls (`/api/tags`
  status check, `/api/chat` streaming, `/api/pull` downloads) match
  Ollama's actual REST API.
- **Untested on a real device:** I have no Android SDK/emulator in this
  sandbox, so this has been syntax-checked and cross-referenced, not
  run. Expect to hit and report small bugs.
- **Approximated, not confirmed:** the original's setup flow is 11 steps
  (I only saw step 3 of 11); this version uses a simplified 3-step flow.
  The Activity, More, and share/person-plus icon behavior in the
  original weren't visible to me at all — what's here is a reasonable
  guess at what they'd do, not a match to the real thing.

## Notes

- The app allows cleartext (plain HTTP) traffic since Ollama serves HTTP,
  not HTTPS — fine here since Tailscale already encrypts the connection
  end-to-end.
- The Mac Studio render is an original illustration, not Apple's product
  photography — keeps things clean on the trademark front, and matches
  the DGX Spark reference's "hero device" layout.
- This only handles chat + model management (mirroring what the
  reference app's screens showed). If you want it to also run
  agent/terminal tasks on the Mac (the "do other stuff" part from
  earlier), that needs a small companion service on the Mac side
  (e.g. Open Interpreter behind an API) — happy to add a screen for
  that next if you want it.
