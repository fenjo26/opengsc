// Ready-made structure templates the user can drop into the "custom template" field.
// The generator follows them as an H1/H2/H3 skeleton and fills sections via the EAV model.

export interface OutlineTemplate { id: string; labelKey: string; body: string }

export const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  {
    id: "casino_review",
    labelKey: "seoTplCasinoReview",
    body: `H1: {Brand} Casino Review {year}: Bonuses, Games & Payouts
H2: {Brand} at a Glance (license, established, key facts)
H2: Welcome Bonus & Promotions
H3: Welcome Package & Wagering Requirements
H3: Ongoing Promotions & VIP / Loyalty
H2: Games & Software Providers
H3: Slots (RTP, volatility, top titles)
H3: Live Casino & Table Games
H2: Payments: Deposits, Withdrawals & Limits
H3: Supported Methods & Processing Times
H2: Licensing, Safety & Fair Play
H2: Mobile Experience & App
H2: Customer Support
H2: Responsible Gambling
H2: Pros & Cons / Final Verdict
H2: FAQ`,
  },
  {
    id: "slot_guide",
    labelKey: "seoTplSlotGuide",
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
    id: "product_buy",
    labelKey: "seoTplProductBuy",
    body: `H1: Buy {Product} Online {year}: Prices, Deals & Where to Buy
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
