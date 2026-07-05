# Mana cilne — dashboard ar GNL spēlēm

Personīga "jaunās cilnes" lapa ar pulksteni, saitēm, to-do sarakstu un
atvērtajām lāzertaga spēlēm no <https://lt.gnl.lv/applications>.

## Struktūra

```
browser-dashboard/
├── index.html        # pati lapa (dashboard)
└── api/
    └── games.js      # Vercel serverless funkcija -> /api/games
```

## Ko lapa dara

- **Pulkstenis** — liels laiks + datums latviski, atjaunojas katru sekundi.
- **Saites** — ātrās saites. Rediģē `LINKS` masīvu `index.html` sākumā.
- **Darāmais** — to-do saraksts. Glabājas pārlūkā (`localStorage`), tāpēc
  paliek starp sesijām tajā pašā pārlūkā/ierīcē.
- **Atvērtās spēles** — dati no `/api/games`, pašatjaunojas ik pēc 5 min.

## Kāpēc vajag serverless funkciju?

Pārlūks nedrīkst tieši paņemt datus no cita domēna (CORS). Tāpēc funkcija
`api/games.js` datus paņem servera pusē, izparsē un atdod lapai kā JSON.
Lapa tos paņem no `/api/games`.

## Izvietošana uz Vercel

1. Izveido šo mapi kā Git repo (vai augšupielādē to Vercel).
2. Vercel automātiski atpazīs `api/games.js` kā funkciju un `index.html`
   kā sākumlapu.
3. Papildu konfigurācija (`vercel.json`) nav vajadzīga — projekts strādā
   "zero-config".

Lokāli atverot `index.html` failu, spēļu panelis rādīs paziņojumu, jo
`/api/games` darbojas tikai izvietotā vidē.

## Svarīgi (scraping)

- Dati tiek nolasīti no lapas HTML, nevis no oficiāla API. `api/games.js`
  mēģina vairākas parsēšanas stratēģijas pēc kārtas (iegultā JSON →
  HTML tabula → atkārtoti bloki). Ja gnl.lv lapu pārtaisa, šos šablonus,
  iespējams, būs jāpielāgo funkcijā `parseGames`.
- Katras spēles lauki tiek atdoti "kā ir" — lapa (`index.html`) tos parāda
  dinamiski, tāpēc jaunus/citādus laukus rādīt problēmu nesagādā.
- Rezultāts tiek kešots 5 minūtes, lai nedauzītu avota lapu. Ja avots
  nesasniedzams, tiek atdoti pēdējie zināmie dati (atzīmēti kā `stale`).
- **Netika testēts pret dzīvo lapu no izstrādes vides** (tīkla politika
  bloķēja `lt.gnl.lv`). Pēc izvietošanas atver `/api/games` un pārbaudi,
  vai JSON izskatās pareizi; ja `games` ir tukšs, skat. `parseGames`.
