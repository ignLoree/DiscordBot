# Report check bug – Vinyls & Coffee

**Data check:** completato su tutti i file di entrambi i bot (check iniziale + check mirati + audit dipendenze).

---

## 1. Lint e test automatici

| Check | Vinyls | Coffee |
|-------|--------|--------|
| **Linter** | Nessun errore | Nessun errore |
| **check-mojibake** | OK | OK |
| **test-critical-systems** | CRITICAL_SYSTEMS_TEST_OK | CRITICAL_SYSTEMS_TEST_OK |

---

## 2. Bug corretti (sessione iniziale)

### 2.1 Vinyls – Mongoose: indice duplicato su `expiresAt`

- **File:** `Vinyls/Schemas/Moderation/temporaryCommandPermissionSchema.js`
- **Fix:** Rimosso `index: true` da `expiresAt`; lasciato solo `schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`.

### 2.2 Vinyls – Possibile crash su `.find().value` (undefined)

- **File:** `Vinyls/Prefix/Admin/evento.js`
- **Fix:** Uso di optional chaining e fallback (`?.value ?? "0"` / `?? "1"`) e `Math.max(0, ...)` per year/month/day da `formatToParts`.

---

## 3. Check mirati (sicurezza, performance, API, promise)

### 3.1 Sicurezza

- **eval/new Function:** nessun uso con input utente.
- **Secret:** nessun secret hardcoded; uso di `process.env`.
- **Sanitizzazione:** presente dove serve (verify, snipe, customrole, automod, transcriptUtils).
- **JSON.parse:** quasi ovunque in `try/catch`.

### 3.2 Performance

- Nessun N+1; uso corretto di `.lean()`; aggiornamenti atomici (findOneAndUpdate/updateOne) dove serve.

### 3.3 API Discord.js

- **Vinyls/Events/clientReadyStatus.js:** presence allineata a `setPresence({ status, activities })` (prima: setStatus + setActivity).

### 3.4 Promise / race conditions

- Send/edit spesso con `.catch`; nessuna race evidente sugli aggiornamenti DB.

---

## 4. Audit dipendenze (npm audit)

### 4.1 Vinyls

- **tar (high)** – dipendenza transitiva: `@discordjs/voice` → `prism-media` → `@discordjs/opus` → `@discordjs/node-pre-gyp` → `tar`.  
  Le CVE riguardano estrazione tar (path traversal, symlink). **Nessun fix disponibile** dalla catena Discord.js/opus; il rischio è soprattutto durante `npm install`. In runtime il bot non estrae tar.  
  **Raccomandazione:** accettare il rischio o valutare alternative a `@discordjs/opus` in futuro (es. opus da sistema).

- **undici (moderate)** – CVE GHSA-g9mf-h72j-4rw9 (decompressione non limitata). Fix: undici **>= 6.23.0**.  
  **Vinyls** ha già in `package.json`: `"overrides": { "axios": "^1.12.2", "undici": "^6.23.0" }`.  
  Dopo `npm install`, l’albero principale usa undici 6.23+; pacchetti nested (es. `youtubei.js`) possono ancora dichiarare versioni vecchie. Per forzare ovunque: l’override attuale è sufficiente per discord.js; per `youtubei.js`/`discord-player-youtubei` potrebbe servire reinstall (npm install) dalla root del progetto Vinyls.

### 4.2 Coffee

- **tar (high):** stessa catena di Vinyls (`@discordjs/voice` → … → `tar`). Stesse considerazioni (nessun fix disponibile, rischio principalmente a install time).

- **undici (moderate):** stesso CVE. **Modifica applicata:** in `Coffee/package.json` è stato aggiunto:
  ```json
  "overrides": {
    "undici": "^6.23.0"
  }
  ```
  Dopo `npm install` nella cartella Coffee, undici sarà forzato a 6.23+ nell’albero delle dipendenze.

### 4.3 Riepilogo vulnerabilità

| Progetto | High (tar) | Moderate (undici) | Azione |
|---------|------------|-------------------|--------|
| Vinyls  | 5 (tar, no fix) | 6 | Override undici già presente; eseguire `npm install` dalla root Vinyls se necessario. |
| Coffee  | 5 (tar, no fix) | 6 | Aggiunto override undici; eseguire `npm install` in `Coffee/` per applicare. |

---

## 5. Modifiche applicate (questa sessione – audit)

- **Coffee/package.json:** aggiunto `"overrides": { "undici": "^6.23.0" }` per mitigare la CVE su undici.

---

## 6. Raccomandazioni post-audit

1. **Eseguire `npm install`** nella cartella **Coffee** (e se serve nella root/Vinyls) dopo le modifiche al `package.json`, così gli override vengono applicati.
2. **tar:** tenere sotto controllo gli advisory; in caso di fix upstream in `@discordjs/opus` o alternativa, aggiornare.
3. **Controlli periodici:** `npm audit` (e eventualmente `npm audit fix` senza `--force`) dopo ogni aggiornamento dipendenze.

---

## 7. Riepilogo stato finale

- **Bug corretti:** 2 (indice Mongoose, evento.js).
- **Migliorie:** presence Vinyls (setPresence), override undici Coffee.
- **Sicurezza / performance:** nessun problema critico nel codice; audit dipendenze documentato con azioni intraprese.
- **Test:** check-mojibake e test-critical-systems passano.
