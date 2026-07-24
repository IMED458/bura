# ბურა — ონლაინ ქართული კარტის თამაში (2 ან 4 მოთამაშე)

სრულად გამართული, წარმოებისთვის მზად ონლაინ ვებთამაში „ბურა“.

---

## 1. ტექნოლოგიური სტეკი

* **Frontend**: React 19, TypeScript, Tailwind CSS, Motion (Framer Motion), Lucide Icons, Canvas Confetti.
* **Backend**: Node.js, Express, `ws` (WebSocket Server).
* **Game Engine**: Server-authoritative TypeScript Bura engine (`src/game/engine.ts`).
* **Audio**: Web Audio API Synthesizer (Zero missing file dependency).
* **Testing**: TSX unit test runner (`npm run test`).
* **Deployment**: Docker / Cloud Run / Node.js container (`node dist/server.cjs`).

### რატომ ეს სტეკი?
1. **Server-Authoritative Security**: სრული დასტის არევა და კარტების დარიგება ხდება მხოლოდ სერვერზე. კლიენტი ვერ ხედავს სხვა მოთამაშეების კარტებს ან დასტის შიგთავსს.
2. **Low Latency Realtime**: WebSocket კავშირი პორტ 3000-ზე უზრუნველყოფს მყისიერ სინქრონიზაციას ოთხ მოთამაშეს შორის.
3. **Responsive Mobile-First UI**: ოპტიმიზებულია მობილურ მოწყობილობებზე, ტაბლეტებსა და კომპიუტერებზე სათამაშოდ.

---

## 2. პროექტის სტრუქტურა

```
├── README.md               # დოკუმენტაცია და გაშვების ინსტრუქცია
├── package.json            # სკრიპტები და დამოკიდებულებები
├── server.ts               # Express + WebSocket HTTP სერვერის მთავარი ფაილი
├── server/
│   ├── roomManager.ts      # ოთახების, matchmaking-ისა და session-ების მართვა
│   ├── chatService.ts      # ჩატის მოდერაცია, XSS sanitization, rate-limiting
│   └── tests/
│       └── engine.test.ts  # თამაშის წესების unit ტესტები
└── src/
    ├── App.tsx             # მთავარი React კომპონენტი და WebSocket კავშირი
    ├── game/
        └── engine.ts       # ბურას ძირითადი ლოგიკა, გაჭრის ალგორითმი და ქულები
    ├── components/
    │   ├── Table.tsx       # 3D ვირტუალური სათამაშო მაგიდა
    │   ├── CardSvg.tsx     # კარტების SVG რენდერერი
    │   ├── RoomLobby.tsx   # მოსაცდელი ოთახი და პარამეტრები
    │   ├── Lobby.tsx       # მთავარი მენიუ და matchmaking
    │   ├── ScoreBoard.tsx  # ქულების და კოზირის პანელი
    │   ├── DaviModal.tsx   # დავის (გაზრდის) დიალოგი
    │   ├── ChatDrawer.tsx  # რეალური დროის ჩატი
    │   ├── GameOverModal.tsx # რაუნდის/მატჩის დასრულების ეკრანი
    │   └── HowToPlayModal.tsx # თამაშის წესები
    ├── i18n/
    │   └── ge.ts           # ქართული ენის ლოკალიზაცია
    ├── types/
    │   └── game.ts         # shared TypeScript ინტერფეისები
    └── utils/
        └── audio.ts        # Web Audio API ხმის ეფექტები
```

---

## 3. გაშვების და Deploy-ს ინსტრუქციები

### 3.1. Local Development
```bash
# 1. დამოკიდებულებების დაყენება
npm install

# 2. ტესტების გაშვება
npm run test

# 3. Development სერვერის გაშვება (Port 3000)
npm run dev
```

### 3.2. Production Build & Start
```bash
# 1. აპლიკაციისა და სერვერის დაკომპილება
npm run build

# 2. Production სერვერის გაშვება
npm start
```

---

## 4. WebSocket Event-ების ჩამონათვალი

* `CREATE_ROOM`: კერძო ოთახის შექმნა.
* `JOIN_ROOM`: ოთახში კოდით შესვლა.
* `JOIN_MATCHMAKING`: საჯარო matchmaking რიგში დამატება.
* `LEAVE_MATCHMAKING`: რიგიდან გამოსვლა.
* `TOGGLE_READY`: მზადყოფნის დადასტურება.
* `START_GAME`: თამაშის დაწყება (ჰოსტის მიერ).
* `PLAY_CARDS`: კარტების დადება სვლაზე.
* `PROPOSE_RAISE`: დავის/გაზრდის გამოცხადება (დავი, სე, ჩარი, ფანჯი, შაში).
* `RESPOND_RAISE`: გაზრდის მიღება ან უარის თქმა.
* `DECLARE_BURA`: 5 კოზირის გამოცხადება.
* `SEND_CHAT`: ჩატში შეტყობინების გაგზავნა.

---

## 5. API Endpoint-ები

* `GET /api/health` — სერვერის სტატუსის შემოწმება.
* `GET /api/stats` — აქტიური ოთახების, მატჩებისა და მიმდინარე კავშირების დიაგნოსტიკა.

---

## 6. უსაფრთხოება და ვალიდაცია

1. **XSS & Injection Protection**: ჩატისა და სახელების ტექსტები სრულად იწმინდება სპეციალური სიმბოლოებისგან (`sanitizeText`).
2. **Chat Rate Limiting**: მაქსიმუმ 3 შეტყობინება 2 წამში.
3. **Session Tokens**: reconnectToken ინახება `localStorage`-ში 90-წამიანი reconnect ფანჯრით.
4. **Server-Authoritative**: კლიენტს არ გააჩნია უფლება შეცვალოს თამაშის მდგომარეობა სერვერის ვალიდაციის გარეშე.
