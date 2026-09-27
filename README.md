# Raccontastorie

Webapp che genera favole audio personalizzate in tempo reale: un narratore
interattivo a bivi ispirato a FABA+ e ai classici librogame, concepito per
funzionare interamente offline nel browser.

## Stack

- **Vite + React (TypeScript)** — nessun backend richiesto, distribuibile
  come file statici.
- **Tailwind CSS** — animazioni fluide dell'orbe e design minimal responsive.
- **`@mlc-ai/web-llm`** (in arrivo, Fase 3) — LLM in-browser via WebGPU con
  cache IndexedDB.
- **Web Speech API** (in arrivo, Fase 2) — STT/TTS con `lang: 'it-IT'`.

## Sviluppo

```sh
npm install
npm run dev
```

## Build e deploy

```sh
npm run build   # output in ./dist
```

Ogni push sul branch `main` attiva il workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) che pubblica
il sito su GitHub Pages.

- **Dominio di produzione:** `https://raccontastorie.monaripietro.it`
  (gestito da `public/CNAME`).
- Nelle impostazioni del repository (`Settings -> Pages`): impostare il
  custom domain e abilitare **Enforce HTTPS**.
- Record DNS lato provider: `CNAME raccontastorie -> <username>.github.io.`

## Licenza

Apache License 2.0 — Copyright (c) 2026 Pietro Monari. Vedi il file
[`LICENSE`](LICENSE).
