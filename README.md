# Mana cilne — dashboard ar GNL spēlēm

Personīga "jaunās cilnes" lapa ar pulksteni, saitēm, to-do sarakstu un
atvērtajām lāzertaga spēlēm no <https://lt.gnl.lv/applications>.

## Struktūra

```
browser-dashboard/
├── index.html          # pati lapa (dashboard)
├── api/
│   ├── games.js        # Vercel funkcija -> /api/games (spēļu scraping)
│   └── config.js       # Vercel funkcija -> /api/config (Supabase publiskā konfig.)
└── supabase/
    └── schema.sql      # tabulas + RLS politikas (palaid Supabase SQL Editor)
```

## Ko lapa dara

- **Pulkstenis** — liels laiks + datums latviski, atjaunojas katru sekundi.
- **Saites** — ātrās saites. Bez pieslēgšanās rāda noklusētās (`DEFAULT_LINKS`
  masīvs `index.html` sākumā); pieslēdzoties tās glabājas Supabase un ir
  rediģējamas no lapas (poga **＋ Saite**, dzēšana ar ✕ uz saites).
- **Darāmais** — to-do saraksts. Bez pieslēgšanās glabājas pārlūkā
  (`localStorage`); pieslēdzoties — Supabase datubāzē, sinhronizēts starp
  iekārtām.
- **Atvērtās spēles** — dati no `/api/games`, pašatjaunojas ik pēc 5 min.

## Datubāze (Supabase) — sinhronizācija starp iekārtām

Uzdevumi un saites var glabāties Supabase, lai tie būtu pieejami visās iekārtās.
Piekļuvi aizsargā e-pasta pieslēgšanās (maģiskā saite) + Row Level Security.
Ja Supabase nav nokonfigurēts, lapa klusi strādā lokālā režīmā (skat. augstāk).

**Iestatīšana (vienreiz):**

1. **Izveido tabulas.** Supabase → SQL Editor → palaid `supabase/schema.sql`.
2. **Vides mainīgie Vercel.** Supabase↔Vercel integrācija parasti tos jau
   iestata. Pārbaudi Vercel → Settings → Environment Variables, ka ir:
   - `SUPABASE_URL` (vai `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_ANON_KEY` (vai `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

   Funkcija `api/config.js` tos nodod lapai. **Slepenā** `service_role` atslēga
   NETIEK izmantota un nenonāk pārlūkā (anon atslēga ir publiska un droša, jo
   datus aizsargā RLS).
3. **Pieslēgšanās URL.** Supabase → Authentication → URL Configuration:
   - **Site URL** = tavs Vercel domēns (piem. `https://tava-lapa.vercel.app`).
   - **Redirect URLs** — pievieno to pašu domēnu (un citus, ja lieto).
4. **Deploy** un atver lapu. Uzspied **☁ Pieslēgties**, ievadi e-pastu, atver
   saiti no e-pasta — un dati sāks sinhronizēties.

Piezīmes:
- Pēc pieslēgšanās pirmajā reizē noklusētās saites tiek ieliktas datubāzē.
- Sinhronizācija: dati atsvaidzinās, atgriežoties cilnē. Reāllaika atjaunināšanu
  var ieslēgt (skat. komentāru `supabase/schema.sql` beigās).

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
