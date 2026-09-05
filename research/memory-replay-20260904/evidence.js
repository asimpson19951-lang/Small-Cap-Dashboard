// Source-reviewed by the parent Astra agent. Retrospective reconstruction, not an original feed log.
window.MEMORY_REPLAY_EVIDENCE = {
  schemaVersion: 1,
  reviewStatus: "reviewed",
  reviewedAt: "2026-09-05T04:38:54Z",
  cutoffConvention: "End of calendar day in America/New_York; latest verified article revision, not an assumed first-seen timestamp.",
  limitations: [
    "This is a sourced retrospective reconstruction, not proof that Radar observed these stories then. It is not an exhaustive news archive.",
    "Date-only sources are conservatively available the following calendar day. Known revision times are retained; no intraday propagation or original first-seen claim is made.",
    "Reported explanations are attributed, not proved causes of every seller's decision. No position-level evidence establishes forced liquidation or margin calls.",
    "The exact recalled Jensen Huang wording remains unverified. Economic relevance does not establish first catalyst, historical basket admission, or causal price leadership.",
    "The June/July chronology is selective, not continuous coverage of every news item. An inaccessible Fidelity rendition was replaced with accessible Reuters reporting; unverified preliminary explanations remain excluded."
  ],
  checkpoints: [
    {
      id: "nvda-context-20260105", availableDate: "2026-01-06", eventDate: "2026-01-05",
      title: "AI context creates a storage infrastructure need", kind: "development", tickers: ["SNDK", "MU"], reviewStatus: "reviewed",
      summary: "NVIDIA introduced an inference-context storage platform and described GPU-resident context capacity as a bottleneck. This establishes a technology backdrop for memory and storage demand.",
      caveat: "It does not verify the recalled exact quote or prove either stock's move was caused by this release.",
      sources: [{title: "NVIDIA: inference-context storage platform", url: "https://nvidianews.nvidia.com/news/nvidia-bluefield-4-powers-new-class-of-ai-native-storage-infrastructure-for-the-next-frontier-of-ai", publishedAt: "2026-01-05"}]
    },
    {
      id: "sndk-results-20260430", availableDate: "2026-05-01", eventDate: "2026-04-30",
      title: "Sandisk reports a pricing and datacenter inflection", kind: "development", tickers: ["SNDK"], reviewStatus: "reviewed",
      summary: "Sandisk reported quarterly revenue of $5.95 billion, up 97% sequentially. Its release attributed outperformance to higher pricing and a shift toward higher-value customers; datacenter revenue rose 233% sequentially.",
      caveat: "Reported results and management's explanation; not proof that future demand or valuation is secure.",
      sources: [{title: "Sandisk fiscal Q3 results", url: "https://investor.sandisk.com/news-releases/news-release-details/sandisk-reports-fiscal-third-quarter-2026-financial-results", publishedAt: "2026-04-30"}]
    },
    {
      id: "chip-rout-20260623", availableDate: "2026-06-24", eventDate: "2026-06-23",
      title: "A sharp break spreads across chip stocks", kind: "attribution", tickers: ["SNDK", "MU", "WDC"], reviewStatus: "reviewed",
      summary: "Reuters documented steep losses across memory and other chip stocks. A Baird strategist attributed vulnerability to concentrated positioning and an unwind of strong inflows, rather than a clear change in the AI fundamentals.",
      caveat: "An attributed explanation, not verified investor flows. Available date is conservatively delayed because the displayed revision timezone is unspecified.",
      sources: [{title: "Reuters: June 23 chip-stock rout", url: "https://www.investing.com/news/stock-market-news/nasdaq-100-set-to-shed-over-1-trillion-as-tech-selloff-deepens-spacex-slides-4755018", publishedAt: "2026-06-23"}]
    },
    {
      id: "mu-results-20260624", availableDate: "2026-06-25", eventDate: "2026-06-24",
      title: "Micron reports growth and higher guidance", kind: "development", tickers: ["MU"], reviewStatus: "reviewed",
      summary: "Micron reported $41.46 billion in fiscal Q3 revenue and guided fiscal Q4 to $50 billion, plus or minus $1 billion. Management described rapidly growing demand and multi-year customer agreements.",
      caveat: "Guidance is forward-looking. Strong reported results do not establish that expectations or stock prices are justified.",
      sources: [{title: "Micron fiscal Q3 SEC exhibit", url: "https://www.sec.gov/Archives/edgar/data/723125/000072312526000013/a2026q3ex991-pressrelease.htm", publishedAt: "2026-06-24"}]
    },
    {
      id: "samsung-expectations-20260707", availableDate: "2026-07-07", eventDate: "2026-07-07",
      title: "Strong earnings fall short of stronger expectations", kind: "attribution", tickers: ["SNDK", "MU"], reviewStatus: "reviewed",
      summary: "Reuters linked renewed chip weakness to disappointment after Samsung's strong results. An interviewed strategist described a gap between expected and indicated memory-price growth; Micron and Sandisk also fell.",
      caveat: "This is a sector expectations explanation, not a Sandisk disclosure that its own pricing had deteriorated.",
      sources: [{title: "Reuters: July 7 expectations reset", url: "https://www.marketscreener.com/news/us-stocks-end-lower-as-ai-worries-hit-chipmakers-ce7f5ed8dc80f623", publishedAt: "2026-07-07T18:20:00-04:00"}]
    },
    {
      id: "hynix-listing-20260713", availableDate: "2026-07-13", eventDate: "2026-07-13",
      title: "The post-listing selloff spreads to U.S. memory stocks", kind: "attribution", tickers: ["SNDK", "MU", "WDC"], reviewStatus: "reviewed",
      summary: "Reuters documented a sharp SK Hynix decline alongside Micron, Sandisk and Western Digital losses. Analysts cited post-listing positioning, future capacity and AI-funding concerns; Hynix's CEO instead forecast continued supply shortages.",
      caveat: "Reported explanations and competing forecasts, not proven causes or proof that every member moved in sympathy. Article percentages describe its reporting time, not necessarily the closing bars.",
      sources: [{title: "Reuters: July 13 memory-stock selloff", url: "https://ca.marketscreener.com/news/sk-hynix-plunges-after-nasdaq-debut-amid-diminishing-earnings-optimism-ce7f5edfdc8eff27", publishedAt: "2026-07-13T04:57:00-04:00", updatedAt: "2026-07-13T10:13:00-04:00"}]
    },
    {
      id: "financing-competition-20260728", availableDate: "2026-07-28", eventDate: "2026-07-28",
      title: "AI financing and Chinese competition become concerns", kind: "attribution", tickers: ["SNDK", "MU"], reviewStatus: "reviewed",
      summary: "Reuters described a global chip selloff tied to concerns about AI infrastructure financing and Chinese competition, including more efficient AI models and a Chinese memory producer's market debut.",
      caveat: "These are reported concerns, not proof that Sandisk's realized NAND demand or pricing had already weakened.",
      sources: [{title: "Reuters: financing and competition concerns", url: "https://ca.investing.com/news/stock-market-news/samsung-sk-hynix-slide-amid-nvidia-financing-worries-china-competition-4755464", publishedAt: "2026-07-27", updatedAt: "2026-07-27", timingNote: "Displayed publication 20:59, revision 21:04; timezone unspecified. Conservatively available July 28."}]
    },
    {
      id: "hynix-miss-20260729", availableDate: "2026-07-29", eventDate: "2026-07-29",
      title: "SK Hynix misses forecasts but reports strong demand", kind: "attribution", tickers: ["SNDK", "MU"], reviewStatus: "reviewed",
      summary: "Reuters reported record SK Hynix profit below forecasts, shipment delays, and disappointment over shareholder returns. At the same time, management said customers were still requesting more memory supply.",
      caveat: "The conflicting demand and expectations evidence matters. It does not prove the cause of SanDisk's full decline or identify a durable bottom.",
      sources: [{title: "Reuters: July 29 SK Hynix results", url: "https://www.investing.com/news/stock-market-news/sk-hynix-q2-profit-jumps-557-on-ai-chip-demand-misses-forecasts-4818344", publishedAt: "2026-07-28", updatedAt: "2026-07-29", timingNote: "Displayed publication July 28 at 18:57; revision July 29 at 05:48, timezone unspecified. Even at UTC-12 the revision precedes July 29 EOD Eastern."}]
    },
    {
      id: "hynix-primary-20260729", availableDate: "2026-07-30", eventDate: "2026-07-29",
      title: "Primary-source counterpoint: Hynix reports higher memory prices", kind: "development", tickers: ["SNDK", "MU"], reviewStatus: "reviewed",
      summary: "SK Hynix's release reported quarter-over-quarter increases in DRAM and NAND prices and continued customer requests for supply. That is management's business account alongside the market's disappointment.",
      caveat: "Company reporting and outlook, not independent proof of Sandisk's full thesis. Date-only publication is available one day later for conservative replay.",
      sources: [{title: "SK Hynix: second-quarter results", url: "https://news.skhynix.com/en/q2-2026-business-results/", publishedAt: "2026-07-29"}]
    },
    {
      id: "sndk-aftermath-20260805", availableDate: "2026-08-06", eventDate: "2026-08-05",
      title: "Aftermath: Sandisk releases new company results", kind: "development", tickers: ["SNDK"], reviewStatus: "reviewed",
      summary: "Sandisk reported fiscal Q4 revenue of $8.97 billion, up 51% sequentially. Its release attributed roughly two-thirds of sequential revenue growth to higher pricing and one-third to volumes.",
      caveat: "Published after the July 29 anchor. Conservatively available August 6 because exact publication time was not verified; it cannot explain earlier cutoffs.",
      sources: [{title: "Sandisk August 5 results and 8-K", url: "https://investor.sandisk.com/static-files/3a03584e-2bb8-454d-a003-4911c9b08948", publishedAt: "2026-08-05"}]
    }
  ],
  relationships: [
    {
      ticker: "SNDK", availableDate: "2026-05-01", reviewStatus: "reviewed", relation: "Direct memory exposure",
      summary: "NAND flash business with disclosed datacenter growth. Austin identifies SNDK and MU as co-leaders; the original lead/lag sequence remains unproved.",
      caveat: "Economic exposure supports inclusion, not the cause of each day's move or a historical admission date.",
      sources: [{title: "Sandisk: NAND business and Q3 results", url: "https://investor.sandisk.com/news-releases/news-release-details/sandisk-reports-fiscal-third-quarter-2026-financial-results", publishedAt: "2026-04-30"}]
    },
    {
      ticker: "MU", availableDate: "2026-06-25", reviewStatus: "reviewed", relation: "Direct memory exposure",
      summary: "Micron describes a DRAM, NAND and NOR portfolio. Shared memory exposure does not make its product mix or catalysts identical to Sandisk's.",
      caveat: "This reviewed source supports the relationship only from its available date; Austin's leader selection is retrospective.",
      sources: [{title: "Micron: Q3 results and business description", url: "https://www.sec.gov/Archives/edgar/data/723125/000072312526000013/a2026q3ex991-pressrelease.htm", publishedAt: "2026-06-24"}]
    },
    {
      ticker: "WDC", availableDate: "2026-05-01", reviewStatus: "reviewed", relation: "Adjacent storage exposure",
      summary: "Western Digital links HDD storage to AI workloads. Sandisk's flash business was separated in 2025; WDC is not the same NAND exposure.",
      caveat: "Adjacent business evidence, not sympathy-only causation or a verified date of joining the theme.",
      sources: [{title: "Western Digital: Q3 SEC exhibit", url: "https://www.sec.gov/Archives/edgar/data/106040/000162828026028878/a4ex991-pressreleaseq326.htm", publishedAt: "2026-04-30"}]
    },
    {
      ticker: "STX", availableDate: "2026-04-29", reviewStatus: "reviewed", relation: "Adjacent storage exposure",
      summary: "Seagate sells mass-capacity storage to cloud and enterprise customers. Its April release links AI data creation to storage demand.",
      caveat: "Management's demand explanation supports a research relationship; it does not prove sympathy, first participation, or absence of a separate catalyst.",
      sources: [{title: "Seagate: Q3 results and storage business", url: "https://investors.seagate.com/news/news-details/2026/Seagate-Technology-Reports-Fiscal-Third-Quarter-2026-Financial-Results/", publishedAt: "2026-04-28"}]
    }
  ]
};
