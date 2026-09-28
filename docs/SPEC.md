# SPEC-002: Raccontastorie — Requisiti del prodotto

**Versione:** 2.0 · **Aggiornata:** 2026-09-28 · **Stato:** in produzione su <https://raccontastorie.monaripietro.it>

Questo documento aggiorna e sostituisce lo SPEC-001 iniziale: traccia i requisiti originali, le evoluzioni introdotte durante lo sviluppo e il comportamento effettivamente implementato e verificato.

---

## 1. Visione del prodotto

Narratore interattivo a bivi per bambini, ispirato a FABA+ e ai classici librogame. L'esperienza è **quasi screenless**: la voce guida tutto, lo schermo mostra un unico elemento visivo centrale (l'orbe) più i pulsanti di scelta di riserva.

**Principio guida:** un bambino deve poter giocare **in autonomia**, senza mai dover toccare lo schermo se non vuole. L'interazione primaria è **hands-free**, non push-to-talk.

### 1.1 Evoluzione rispetto allo SPEC-001

| SPEC-001 | SPEC-002 (implementato) | Motivazione |
|---|---|---|
| Push-to-talk (spazio / tocco continuo) | **Ascolto hands-free automatico** con rilevamento del silenzio | Il push-to-talk è impraticabile per un bambino piccolo: deve stare dietro allo schermo |
| Solo modello locale WebLLM | **WebGPU locale OPPURE OpenRouter BYOK** a scelta dell'utente | Dispositivi poco potenti (es. Galaxy A35) non reggono l'inferenza locale |
| 3 tappe per 3-5 anni | **5 tappe per 3-5 anni** | Storia troppo breve per i piccoli |
| Flusso: età → storia | Flusso: motore → età → **tema** → **titolo onirico** → storia | La storia parte da un titolo ampio e onirico, mai troppo specifico |
| TTS/TTS qualunque | Selezione voce italiana **punteggiata** (Natural/neural > Google > Premium) | Voci metalliche inaccettabili per un narratore |

---

## 2. Interazione vocale (requisiti R-VOC)

- **R-VOC-1 — Hands-free:** dopo ogni narrazione il microfono si riapre **automaticamente** (dopo ~700 ms) con segnale acustico di attivazione. Nessun tocco richiesto.
- **R-VOC-2 — Anti-eco:** il microfono non è MAI aperto mentre il TTS parla. Il riconoscitore viene interrotto a ogni risultato finale e riaperto solo dopo la narrazione.
- **R-VOC-3 — Fine parlato:** la finestra d'ascolto si chiude dopo un silenzio configurabile (2500 ms default; **4500 ms** nella domanda del tema, dove il bambino deve pensare più a lungo).
- **R-VOC-4 — Timeout no-speech:** se il bambino non parla entro **12 s**, l'ascolto si chiude con un invito gentile ("Ti ascolto! Dimmi pure cosa scegli.") — mai un loop infinito.
- **R-VOC-5 — Tap manuale (facoltativo):** un tap sull'orbe mette in pausa l'ascolto; un secondo tap lo riapre. Il tap è **bloccato** durante la narrazione o la generazione (anti-eco via input manuale).
- **R-VOC-6 — Segnali acustici:** due toni distinti (WebAudio: 520→820 Hz on, 620→360 Hz off) su **tutti i device**; `AudioContext` sbloccato al primo gesto utente (policy autoplay iOS).
- **R-VOC-7 — Conferma ambiguità:** se una risposta matcha un'opzione con bassa confidenza, il narratore chiede "Ho capito bene? Hai detto: X. Dimmi sì per continuare…". Risposta affermativa → prosegue; "no" → **ri-offre le opzioni**.

## 3. Robustezza e degrado (requisiti R-ROB)

- **R-ROB-1 — Watchdog generazione:** timeout 60 s (WebGPU) / 45 s (OpenRouter) sul primo token; il worker viene distrutto, ricaricato e **ritenta una volta**; poi messaggio gentile ("Il telefonino è un po' stanco…").
- **R-ROB-2 — Browser senza STT (Brave, Firefox):** errore `network`/`not-allowed`/`service-not-allowed` → ascolto dichiarato non disponibile, annuncio vocale, **i pulsanti restano sempre abilitati**.
- **R-ROB-3 — STT "muto" (alcuni Edge):** se il recognizer parte ma dopo **3 ascolti vuoti consecutivi** non ha mai capito una parola, l'app annuncia il problema, chiude il mic e passa ai pulsanti. Nessun degrado spurio: il contatore si azzera alla prima parola capita.
- **R-ROB-4 — Fallback comprensione:** 1° tentativo messaggio gentile; 2° tentativo riformulazione con opzioni; **paracadute visivo permanente** con i pulsanti di scelta cliccabili.
- **R-ROB-5 — Anti-stall TTS:** i testi lunghi sono suddivisi in frasi ≤ 200 caratteri (bug Chrome: enunciati > ~15 s non emettono `end`); keep-alive `resume()` ogni 10 s; guardia anti-doppio `onEnd`.
- **R-ROB-6 — Mic fuori contesto:** token di sessione invalida le riaperture differite del microfono quando il contesto cambia (tema → storia, nuova storia, pulsante premuto, pausa).

## 4. Motore narrativo (requisiti R-NAR)

### 4.1 Flusso di una partita

1. **Onboarding motore:** scelta "Sul tuo dispositivo" (WebGPU) o OpenRouter (chiave API utente); selezione modello (Veloce/Bilanciato/Qualità); consenso privacy esplicito.
2. **Selezione età:** 3 grandi pulsanti (3-5 / 6-9 / 10+), annunciati anche vocalmente.
3. **Tema:** "Ciao, io sono Raccontastorie! Su cosa vorresti che ti raccontassi una storia?" — tema libero parlato, pulsanti rapidi (dinosauri, principesse, spazio) o "scegli tu".
4. **Titolo onirico:** l'LLM inventa un titolo ampio ("L'avventura di…", "Il segreto di…"), max 7 parole, mai troppo specifico.
5. **Storia a tappe:** il primo beat viene generato **in parallelo** all'annuncio del titolo; dopo la narrazione il sistema apre l'ascolto per il bivio.
6. **Fine:** lieto fine obbligatorio, schermata "La storia è finita! 🎉" con pulsante "Raccontami un'altra storia" e "✨ Nuova storia" sempre disponibile durante il racconto.

### 4.2 Struttura per età (Viaggio dell'Eroe / Propp)

| Fascia | Tappe | Fasi narrative obbligatorie | Bivi |
|---|---|---|---|
| **3-5 anni** | 5 | Situazione iniziale → Partenza → Donatore magico → Prova → Lieto fine | **Chiusi**: il narratore vocalizza esattamente 2 opzioni; matching tollerante su parole chiave |
| **6-9 anni** | 5 | Mondo ordinario → Varco/Aiutante → Prove/Antagonista → Climax → Ritorno | **Ibridi**: 2-3 opzioni + "oppure tu cosa faresti?" |
| **10+ anni** | 7 | Mondo ordinario/Rifiuto → Mentore/Varco → Prove → Caverna → Calvario → Resurrezione → Ritorno trasformato | **Aperti**: nessuna opzione imposta, la proposta del giocatore guida la trama |

- **R-NAR-1:** ogni prompt inietta titolo, tema, fase corrente (`step X/Y`), memoria delle scelte precedenti.
- **R-NAR-2:** output LLM vincolato a JSON (`narration`, `choice_prompt`, `options` con `keywords`, `is_story_end`); parsing tollerante con ripristino del formato.
- **R-NAR-3:** la generazione è **a tappe progressive** (mai tutta a priori): ogni scelta genera il prosieguo coerente.
- **R-NAR-4:** lieto fine obbligatorio all'ultima tappa, con `options` vuota.

## 5. Motori LLM (requisiti R-LLM)

### 5.1 Locale WebGPU (default)

- `@mlc-ai/web-llm` su **Web Worker** (la UI non si blocca mai); cache IndexedDB (il modello si scarica una sola volta).
- Watchdog con ricaricamento worker e ripristino "telefonino stanco" per dispositivi insufficienti.

### 5.2 OpenRouter BYOK (alternativa per dispositivi lenti)

- Chiave API inserita **solo nel frontend** (`type="password"`), mantenuta **solo in memoria** (RAM), mai su disco né inviata a terzi; nessun backend.
- Modello `openrouter/free`, streaming SSE, cancellabile (`AbortController`).
- **R-LLM-1 — Privacy:** alert esplicito "i messaggi inviati possono essere usati per allenare i modelli"; il riconoscimento vocale è locale; con modello locale "i dati non lasciano mai il tuo dispositivo e non sono usati per training"; **checkbox di consenso obbligatoria** prima di iniziare.

## 6. Interfaccia (requisiti R-UI)

- **R-UI-1 — Orbe:** stato `idle` (pulsazione lenta), `speaking` (onda fluida), `listening` (anello verde + cue), `loading` (rotazione "Sto pensando…").
- **R-UI-2 — Mobile-first:** layout responsive, nessuno overflow orizzontale, pulsanti grandi, area sicura iOS.
- **R-UI-3 — Paracadute visivo:** i pulsanti con le opzioni correnti sono sempre visibili e abilitati durante la storia.
- **R-UI-4 — "✨ Nuova storia"** sempre disponibile durante la narrazione: cancella TTS, mic e generazioni in corso e riporta alla selezione età.

## 7. Stack e deployment (requisiti R-DEP)

- **R-DEP-1:** Vite + React + TypeScript + Tailwind CSS; nessun backend; `vite.config.ts` con `base: '/'` (dominio di primo livello).
- **R-DEP-2:** `public/CNAME` → `raccontastorie.monaripietro.it`; **Enforce HTTPS** attivo (necessario per Web Speech API e WebGPU).
- **R-DEP-3:** workflow GitHub Actions (`.github/workflows/deploy.yml`) su ogni push in `main`: build → upload artifact → deploy Pages.
- **R-DEP-4 — Browser target:** Google Chrome (desktop/Android) per l'esperienza completa; fallback garantiti su Edge, Brave, Safari iOS (vedi R-ROB-2/3).

## 8. Verifica e qualità (requisiti R-QA)

- **R-QA-1:** suite E2E Playwright con worker LLM e SpeechRecognition/TTS stub: flusso completo per le 3 fasce, lieto fine, restart, silenzio/no-speech, conferma sì/no, pulsanti, degrado Brave/Edge, watchdog anti-stall.
- **R-QA-2:** zero errori JS console in tutti gli scenari; `tsc --noEmit` e build puliti a ogni modifica.

---

## Licenza

Apache License 2.0 — Copyright (c) 2026 Pietro Monari. Vedi [`LICENSE`](../LICENSE).
