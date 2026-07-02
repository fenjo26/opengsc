// Ready-made structure templates the user can drop into the "custom template" field.
// The generator follows them as an H1/H2/H3 skeleton and fills sections via the EAV model.
// Placeholders like {Brand}/{Country}/{SlotName} stay in the template — the user (or the
// outline model, guided by the keyword) substitutes them; {Year} is auto-filled by the UI.

export interface OutlineTemplate { id: string; labelKey: string; group: TemplateGroup; body: string }
export type TemplateGroup = "games" | "casinos" | "brand" | "other";

export const TEMPLATE_GROUPS: { id: TemplateGroup; labelKey: string }[] = [
  { id: "games",   labelKey: "seoTplGroupGames" },
  { id: "casinos", labelKey: "seoTplGroupCasinos" },
  { id: "brand",   labelKey: "seoTplGroupBrand" },
  { id: "other",   labelKey: "seoTplGroupOther" },
];

export const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  // ─── Slots & games ────────────────────────────────────────────────────────────
  {
    id: "slot_review",
    labelKey: "seoTplSlotReview",
    group: "games",
    body: `H1: {SlotName} Slot
H2: What Is {SlotName}? Overview
H3: Who Developed {SlotName}?
H3: Can I Play {SlotName} for Free?
H2: {SlotName} Key Facts (RTP, volatility, max win, reels)
H2: How to Play {SlotName}
H3: Bet Sizes & Autoplay
H2: Bonus Features & Free Spins
H3: Wild & Scatter Symbols
H2: {SlotName} Demo vs Real Money Play
H2: Where to Play {SlotName} in {Country}
H2: Slots Similar to {SlotName}
H2: Verdict: Is {SlotName} Worth Playing?
H2: FAQ`,
  },
  {
    id: "slot_guide",
    labelKey: "seoTplSlotGuide",
    group: "games",
    body: `H1: {Slot} Slot Review & Guide: RTP, Features & How to Play
H2: {Slot} Overview (provider, release, theme)
H2: Key Specs: RTP, Volatility, Max Win, Paylines
H2: How to Play & Bet Settings
H2: Bonus Features & Free Spins
H2: Symbols & Paytable
H2: Demo Play & Where to Play Real Money
H2: Mobile Compatibility
H2: Pros & Cons / Verdict
H2: FAQ`,
  },
  {
    id: "game_category",
    labelKey: "seoTplGameCategory",
    group: "games",
    body: `H1: {GameType} Online – Guide, Strategies & Top Picks {Year}
H2: Overview of {GameType}
H3: What Are {GameType} and How They Work
H3: From {Game1} to {Game2} – The Evolution of {GameType} Mechanics
H2: How to Play {GameType} Online
H3: Rules & Game Flow
H3: Bets, Odds & Payouts
H2: Types of {GameType}
H3: {Subtype1}
H3: {Subtype2}
H2: Strategies & Tips for {GameType}
H2: Best {GameType} Titles to Try in {Year}
H2: Free Play vs Real Money {GameType}
H2: Where to Play {GameType} Online ({Country})
H2: Responsible Gambling
H2: FAQ`,
  },

  // ─── Casino reviews & rankings ────────────────────────────────────────────────
  {
    id: "casino_review",
    labelKey: "seoTplCasinoReview",
    group: "casinos",
    body: `H1: {CasinoName} Casino {Country} Review
H2: Credentials
H3: Is {CasinoName} Legal?
H3: Is {CasinoName} Safe?
H2: Bonuses and Promotions at {CasinoName}
H3: Welcome Package & Wagering Requirements
H3: Ongoing Promotions & VIP / Loyalty
H2: Games & Software Providers
H3: Slots (RTP, volatility, top titles)
H3: Live Casino & Table Games
H2: Payments: Deposits, Withdrawals & Limits
H3: Supported Methods & Processing Times
H2: Mobile Experience & App
H2: Customer Support
H2: Responsible Gambling
H2: Pros & Cons / Final Verdict
H2: FAQ`,
  },
  {
    id: "casino_review_ext",
    labelKey: "seoTplCasinoReviewExt",
    group: "casinos",
    body: `H1: {CasinoName} Casino {Country} Review
H2: Pros and Cons of {CasinoName}
H2: {CasinoName} Overview
H2: Rating Explanation ({X.X}/5)
H2: Bonuses and Promotions at {CasinoName}
H3: Welcome Bonus
H3: Reload Bonuses & Cashback
H2: Games & Providers at {CasinoName}
H3: Slots
H3: Live Casino
H2: Deposits and Withdrawals
H3: Payment Methods & Limits
H3: Payout Speed
H2: Is {CasinoName} Legal & Safe in {Country}?
H2: Mobile Experience & App
H2: Customer Support
H2: Final Verdict
H2: FAQ`,
  },
  {
    id: "best_casinos_hub",
    labelKey: "seoTplBestCasinosHub",
    group: "casinos",
    body: `H1: Best {Country} Online Casino Sites {Year} – Trusted Rankings
H2: Best Online Casinos for {Country} Players – Tested List {Year}
H2: Top {N} {Country} Online Casinos — Detailed Reviews {Year}
H3: {Casino1}
H3: {Casino2}
H3: {Casino3}
H2: How We Rank Online Casinos for {Country}
H3: Licensing & Safety
H3: Bonuses & Wagering
H3: Payments & Payout Speed
H2: Best Casino Bonuses in {Country}
H2: Popular Casino Games in {Country}
H2: Payment Methods at {Country} Casinos
H2: Mobile Casinos in {Country}
H2: Responsible Gambling in {Country}
H2: FAQ`,
  },
  {
    id: "casinos_by_payment",
    labelKey: "seoTplCasinosByPayment",
    group: "casinos",
    body: `H1: Best {PaymentMethod} Casinos in {Country}
H2: List of {PaymentMethod} Online Casinos
H2: Best {PaymentMethod} Casinos Compared
H3: {Casino1}: Top {PaymentMethod} Online Casino {Country}
H3: {Casino2}: Newest Casino with {PaymentMethod}
H2: How to Deposit with {PaymentMethod} (step by step)
H2: Withdrawals via {PaymentMethod}: Limits, Timeframes & Fees
H2: Bonuses for {PaymentMethod} Deposits
H2: Pros and Cons of {PaymentMethod} for Casino Payments
H2: Safety of {PaymentMethod} Casinos
H2: Alternatives to {PaymentMethod}
H2: FAQ`,
  },
  {
    id: "bookmakers_by_payment",
    labelKey: "seoTplBookmakersByPayment",
    group: "casinos",
    body: `H1: Best {PaymentMethod} Betting Sites in {Country}
H2: {N} Best Bookmakers Accepting {PaymentMethod}
H3: {Brand1} — {Nomination} | {License}
H3: {Brand2} — {Nomination} | {License}
H3: {Brand3} — {Nomination} | {License}
H2: How We Ranked {PaymentMethod} Bookmakers
H2: How to Deposit with {PaymentMethod} at a Betting Site
H2: Withdrawing Winnings via {PaymentMethod}
H2: Betting Bonuses for {PaymentMethod} Users
H2: Pros and Cons of {PaymentMethod} for Betting
H2: FAQ`,
  },

  // ─── Brand (monobrand site pages) ─────────────────────────────────────────────
  {
    id: "brand_main",
    labelKey: "seoTplBrandMain",
    group: "brand",
    body: `H1: {Brand} {Country} — Online Casino and Sports Betting
H2: Platform Overview
H2: {Brand} Betting Site
H3: Popular Sports Betting Options
H3: Esports Betting
H2: {Brand} Online Casino
H3: Slots & Providers
H3: Live Casino
H2: Bonuses and Promotions at {Brand}
H2: How to Register at {Brand} {Country}
H2: Deposit and Withdrawal Methods
H2: {Brand} Mobile App
H2: Is {Brand} Legal in {Country}? (license & safety)
H2: Customer Support
H2: FAQ`,
  },
  {
    id: "brand_bonuses",
    labelKey: "seoTplBrandBonuses",
    group: "brand",
    body: `H1: {Brand} {Country} Bonuses and Promotions
H2: Welcome Bonus Overview
H3: First Deposit Bonus
H3: Free Spins Package
H2: No Deposit Bonuses
H2: Sports Betting Bonuses
H2: Casino Promotions & Tournaments
H2: Loyalty / VIP Program
H2: How to Claim a Bonus at {Brand} (step by step)
H2: Wagering Requirements & Bonus Terms
H2: FAQ`,
  },
  {
    id: "bonus_type",
    labelKey: "seoTplBonusType",
    group: "brand",
    body: `H1: {N}% {BonusType} in {Country} – Best Offers {Year}
H2: Best {N}–{M}% {BonusType} in {Country} – {Month} {Year}
H2: What Are {N}–{M}% {BonusType}?
H2: How to Claim a {N}% {BonusType}
H2: {N}% {BonusType} Terms and Conditions
H3: Wagering Requirements
H3: Min Deposit & Max Bonus
H2: {BonusType} vs Other Casino Bonuses
H2: Games You Can Play with a {BonusType}
H2: Pros and Cons of {BonusType}
H2: FAQ`,
  },
  {
    id: "brand_registration",
    labelKey: "seoTplBrandRegistration",
    group: "brand",
    body: `H1: How to Register at {Brand} {Country}
H2: Registration Requirements
H3: Age and Location Requirements
H3: Required Documents
H2: Step-by-Step Registration Guide
H3: Registration via Website
H3: Registration via Mobile App
H2: Account Verification (KYC) at {Brand}
H2: Common Registration Problems & Solutions
H2: Welcome Bonus After Registration
H2: FAQ`,
  },
  {
    id: "brand_app",
    labelKey: "seoTplBrandApp",
    group: "brand",
    body: `H1: {Brand} Mobile App {Country}
H2: Why You Should Install the {Brand} Mobile App
H2: How to Download the App in {Country}
H3: Mobile Device System Requirements
H3: Installing {Brand} APK on Android
H3: Downloading the App on iOS
H2: App Features: Betting & Casino on Mobile
H2: App vs Mobile Website
H2: Bonuses for App Users
H2: Troubleshooting: App Not Working
H2: FAQ`,
  },
  {
    id: "brand_promo",
    labelKey: "seoTplBrandPromo",
    group: "brand",
    body: `H1: Are There Promo Codes at {Brand} {Country}?
H2: What Is a Promo Code?
H3: Benefits of Using Promo Codes
H2: What Bonus Codes Are Available at {Brand} {Country} in {Year}?
H3: Bonus Code for Registration
H3: Promo Codes for Existing Players
H2: How to Activate a Promo Code at {Brand}
H2: Promo Code Terms and Conditions
H2: Where to Find Fresh {Brand} Promo Codes
H2: FAQ`,
  },
  {
    id: "brand_payments",
    labelKey: "seoTplBrandPayments",
    group: "brand",
    body: `H1: Deposit and Withdrawal at {Brand} {Country}
H2: Deposit Methods for {Country} Players
H3: Cryptocurrencies
H3: Bank Cards (Visa / MasterCard)
H3: E-Wallets and Local Payment Systems
H2: How to Make a Deposit (step by step)
H2: Withdrawal Methods and Limits
H3: Withdrawal Timeframes
H3: Verification Before Withdrawal
H2: Fees and Currency Support
H2: Deposit & Withdrawal Problems and Solutions
H2: FAQ`,
  },
  {
    id: "brand_casino",
    labelKey: "seoTplBrandCasino",
    group: "brand",
    body: `H1: {Brand} Online Casino {Country}
H2: Advantages of {Brand} Online Casino
H2: Game Selection
H3: {N}+ Slots from Top Providers
H3: Live Casino with Real Dealers
H3: Table Games & Jackpots
H2: Casino Bonuses at {Brand}
H2: How to Start Playing (register & deposit)
H2: Fairness, RTP & Licensing
H2: Casino on Mobile
H2: FAQ`,
  },
  {
    id: "brand_sportsbook",
    labelKey: "seoTplBrandSportsbook",
    group: "brand",
    body: `H1: {Brand} {Country} Sportsbook
H2: {Brand} — A Great Choice for Sports Betting
H2: What Sports Betting Is Available at {Brand} {Country}
H3: Popular Sports for Betting
H3: {League1}, {League2}, {League3}, {League4}
H2: Bet Types & Odds at {Brand}
H2: Live Betting & Streaming
H2: Betting Bonuses & Promotions
H2: How to Place a Bet (step by step)
H2: FAQ`,
  },

  // ─── Other ────────────────────────────────────────────────────────────────────
  {
    id: "product_buy",
    labelKey: "seoTplProductBuy",
    group: "other",
    body: `H1: Buy {Product} Online {Year}: Prices, Deals & Where to Buy
H2: Quick Facts: Price, Editions & Availability
H2: Where to Buy {Product} (official store vs marketplaces)
H3: Official Store
H3: Trusted Retailers & Marketplaces
H2: Price Comparison & Best Deals
H2: Editions / Variants Compared
H2: Shipping, Warranty & Returns
H2: Is It Worth Buying? Verdict
H2: FAQ`,
  },
  {
    id: "generic",
    labelKey: "seoTplGeneric",
    group: "other",
    body: `H1: {Title}
H2: Quick Answer / Key Facts
H2: {Main Section 1}
H3: {Subsection 1.1}
H3: {Subsection 1.2}
H2: {Main Section 2}
H2: Comparison / Options
H2: Verdict
H2: FAQ`,
  },
];
