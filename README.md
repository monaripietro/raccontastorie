# Raccontastorie

Narratore vocale interattivo a bivi per bambini: genera favole audio personalizzate in tempo reale, ispirato a FABA+ e ai classici librogame. Funziona nel browser, con ascolto **hands-free** (il bambino non deve mai toccare lo schermo).

**Online:** <https://raccontastorie.monaripietro.it>

I requisiti completi del prodotto sono documentati in [`docs/SPEC.md`](docs/SPEC.md).

## Caratteristiche

- **Ascolto hands-free**: il microfono si apre da solo dopo ogni narrazione, con segnale acustico di attivo/disattivo; fine parlato rilevato dal silenzio.
- **Storie a bivi calibrate per età** (3-5 / 6-9 / 10+): opzioni chiuse vocalizzate per i piccoli, ibride per i medi, aperte per i grandi — seguendo il Viaggio dell'Eroe con tappe obbligatorie e lieto fine.
- **Titolo onirico** generato dal tema scelto dal bambino ("L'avventura di…", "Il segreto di…").
- **Due motori LLM a scelta**: locale su WebGPU (`@mlc-ai/web-llm`, dati che non lasciano mai il dispositivo) oppure OpenRouter con chiave API dell'utente (BYOK, solo in memoria).
- **TTS italiano naturale**: selezione della voce tramite punteggio (voci Natural/neural preferite).
- **Robustezza**: watchdog anti-stall con ricaricamento del modello, degrado automatico ai pulsanti quando il browser non supporta l'ascolto (Brave, alcuni Edge), paracadute visivo sempre attivo.

## Stack

- **Vite + React (TypeScript)** — nessun backend richiesto, file statici.
- **Tailwind CSS** — animazioni dell'orbe e design mobile-first responsive.
- **`@mlc-ai/web-llm`** — LLM in-browser via WebGPU su Web Worker, cache IndexedDB.
- **OpenRouter** — alternativa BYOK per dispositivi poco potenti (streaming SSE).
- **Web Speech API** — STT (`lang: 'it-IT'`) e TTS nativi.

## Sviluppo

```sh
npm install
npm run dev
```

## Build e deploy

```sh
npm run build   # output in ./dist
```

Ogni push sul branch `main` attiva il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) che pubblica il sito su GitHub Pages.

- **Dominio di produzione:** `https://raccontastorie.monaripietro.it` (gestito da `public/CNAME`).
- Nelle impostazioni del repository (`Settings -> Pages`): custom domain impostato e **Enforce HTTPS** attivo.
- Record DNS lato provider: `CNAME raccontastorie -> <username>.github.io.`

## Licenza

Apache License 2.0 — Copyright (c) 2026 Pietro Monari. Vedi il file [`LICENSE`](LICENSE).
