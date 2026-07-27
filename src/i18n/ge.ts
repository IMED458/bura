export const ge = {
  appName: 'ბურა',
  tagline: 'ონლაინ ქართული კარტის თამაში (2 მოთამაშე 1v1 ან 4 მოთამაშე 2v2)',
  enterName: 'შეიყვანეთ თქვენი სახელი',
  namePlaceholder: 'მაგ: გიორგი',
  createRoom: 'თამაშის შექმნა',
  joinRoom: 'ოთახში კოდით შესვლა',
  findMatch: 'შემთხვევითი მოთამაშეების მოძებნა',
  roomCodePlaceholder: 'შეიყვანეთ კოდი (მაგ: A7K9Q2)',
  howToPlay: 'როგორ ვითამაშოთ (წესები)',
  soundOn: 'ხმა ჩართულია',
  soundOff: 'ხმა გამორთულია',

  // Game mode
  selectMode: 'აირჩიეთ თამაშის რეჟიმი',
  mode2p: '2 მოთამაშე',
  mode2pDesc: '1 vs 1',
  mode4p: '4 მოთამაშე',
  mode4pDesc: '2 vs 2 გუნდები',
  
  // Lobby / Room
  roomTitle: 'თამაშის ოთახი',
  playersReady: 'მზადყოფნა',
  ready: 'მზად ვარ',
  notReady: 'არ ვარ მზად',
  startGame: 'თამაშის დაწყება',
  copyCode: 'კოდის კოპირება',
  codeCopied: 'კოდი დაკოპირდა!',
  leaveRoom: 'ოთახიდან გასვლა',
  waitingForPlayers: 'ველოდებით მოთამაშეებს',
  opponent: 'მოწინააღმდეგე',
  team1: 'გუნდი 1 (სამხრეთი - ჩრდილოეთი)',
  team2: 'გუნდი 2 (დასავლეთი - აღმოსავლეთი)',
  host: 'ჰოსტი',
  you: 'თქვენ',
  
  // Table Positions
  south: 'სამხრეთი (თქვენ)',
  north: 'ჩრდილოეთი (მეწყვილე)',
  west: 'დასავლეთი (მოწინააღმდეგე)',
  east: 'აღმოსავლეთი (მოწინააღმდეგე)',

  // Matchmaking
  searchingMatch: 'მოთამაშეების ძებნა...',
  foundPlayers: 'ნაპოვნია:',
  cancelSearch: 'ძებნის გაუქმება',

  // Game UI
  trump: 'კოზირი',
  deckLeft: 'დასტა:',
  yourTurn: 'თქვენი სვლაა!',
  waitingForTurn: 'სვლას აკეთებს:',
  playSelectedCards: 'არჩეული კარტის დადება',
  declareBura: '🔥 ბურას გამოცხადება',
  declareMolodka: 'მალიუტკას გამოცხადება',
  davi: 'დავი (2 ქ)',
  se: 'სე (3 ქ)',
  chari: 'ჩარი (4 ქ)',
  fanji: 'ფანჯი (5 ქ)',
  shashi: 'შაში (6 ქ)',
  emptySeat: 'ცარიელი ადგილი',
  trickTakenBy: 'ხელი წაიღო',
  cardsWord: 'კარტი',
  deckLabel: 'დასტა',
  deckRemainingLabel: 'დარჩა დასტაში',
  doubleClickHint: 'ორმაგი დაწკაპუნება — კარტის დადება',
  turnWarning: 'გაფრთხილება — დროა ჩამოხვიდე',
  autoPlayPending: 'კავშირი გაწყვეტილია — ავტომატური სვლა მზადდება',
  // Short raise labels keyed by raise level.
  raiseNames: { 1: 'ჩვეულებრივი', 2: 'დავი', 3: 'სე', 4: 'ჩარი', 5: 'ფანჯი', 6: 'შაში' } as Record<number, string>,
  raiseNamesLong: { 2: 'დავი (2 ქ)', 3: 'სე (3 ქ)', 4: 'ჩარი (4 ქ)', 5: 'ფანჯი (5 ქ)', 6: 'შაში (6 ქ)' } as Record<number, string>,
  
  // Davi modal / offer panel
  raiseProposed: 'შემოთავაზებულია გაზრდა!',
  proposedBy: 'გამოაცხადა:',
  accept: 'კი',
  reject: 'არა',
  waitingResponse: 'ველოდებით პასუხს',
  waitingTeamResponse: 'ველოდებით გუნდი {t}-ის პასუხს...',
  teamDeclared: 'გუნდმა {t} გამოაცხადა',
  yourTeamResponds: 'თქვენი გუნდის პასუხი:',
  raiseOnlyOpponent: '„{name}" გამოცხადება მხოლოდ მოწინააღმდეგე გუნდს შეუძლია',
  raiseAfterCard: 'კარტის ჩამოსვლის შემდეგ შეთავაზებას ვეღარ გამოაცხადებ',
  declareNext: '{name} გამოცხადება',
  declareVerb: 'გამოცხადება',

  // Team switcher (lobby)
  teamSwitchTitle: 'გუნდები და წყვილები',
  moveToTeam1: '→ გუნდი 1',
  moveToTeam2: '→ გუნდი 2',
  teamNeedsTwo: 'ორივე გუნდში ზუსტად ორი მოთამაშე უნდა იყოს',
  hostCanSwap: 'ჰოსტს შეუძლია ნებისმიერი მოთამაშის გადაყვანა',
  
  // Scores & Status
  roundScore: 'მიმდინარე ხელის ქულები:',
  matchScore: 'მატჩის ანგარიში (სამიზნე:',
  handValue: 'ხელის ღირებულება:',
  
  // Chat
  chatTitle: 'მაგიდის ჩატი',
  chatPlaceholder: 'დაწერეთ შეტყობინება...',
  send: 'გაგზავნა',
  mute: 'დადუმება',

  // GameOver
  roundFinished: 'რაუნდი დასრულდა!',
  matchFinished: '🏆 მატჩი დასრულდა!',
  winner: 'გამარჯვებული:',
  rematch: 'თავიდან თამაში',
  backToLobby: 'მთავარში დაბრუნება',

  // Errors
  nameRequired: 'გთხოვთ მიუთითოთ სახელი',
  codeRequired: 'გთხოვთ მიუთითოთ ოთახის კოდი',
};
