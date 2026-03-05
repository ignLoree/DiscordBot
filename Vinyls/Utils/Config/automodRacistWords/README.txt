Add multilingual blacklist packs here as JSON arrays.

Example file: `en.json`
[
  "term_one",
  "term_two"
]

Notes:
- One term per array item.
- Use lowercase.
- Keep only terms you really want to moderate.
- The bot merges all files in this folder + `../automodRacistWords.json`.
- Auto sync:
  - Edit `sources.json`
  - Run: `npm run automod:sync-words --workspace="Vinili & Caffè Bot Ufficiale"`
  - Generated file: `auto.multilang.json`