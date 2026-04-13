export interface GlossaryTerm {
  slug: string;
  term: string;
  definition: string;
  whyItMatters: string;
  example?: string;
  relatedTerms: string[];
  ctaText: string;
  ctaFeature: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "bridge-loan",
    term: "Bridge Loan",
    definition:
      "A short-term loan (typically 6-24 months) used in real estate to bridge the gap between acquiring a property and securing long-term financing or selling the asset. Bridge loans are funded by private lenders and secured by the property itself.",
    whyItMatters:
      "Bridge loans are the core product your borrowers are seeking. Understanding the structure — interest reserves, extension options, exit strategies — is essential to evaluating whether a borrower's plan is realistic. A borrower requesting a 12-month bridge for a ground-up construction project that typically takes 18 months is a red flag.",
    example:
      "A borrower acquires a distressed property for $400K using a bridge loan at 12% interest, rehabs it for $150K over 6 months, and sells for $700K. The bridge loan is repaid from sale proceeds.",
    relatedTerms: ["hard-money-loan", "loan-to-value", "fix-and-flip"],
    ctaText: "Validate bridge loan borrowers automatically.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "hard-money-loan",
    term: "Hard Money Loan",
    definition:
      "A type of bridge loan funded by private investors or non-bank lenders, secured primarily by the value of the real estate collateral rather than the borrower's creditworthiness. Rates are typically 10-15% with 1-3 points origination.",
    whyItMatters:
      "Hard money lending relies heavily on collateral value but borrower quality still matters. A borrower with multiple prior defaults, suspended entities, or pending litigation represents outsized risk even with strong collateral. PulseClose helps you evaluate borrower risk beyond just the property.",
    relatedTerms: ["bridge-loan", "loan-to-value", "fix-and-flip"],
    ctaText: "Screen hard money borrowers in minutes.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "fix-and-flip",
    term: "Fix and Flip",
    definition:
      "A real estate investment strategy where a property is purchased, renovated, and resold for profit within a short period (typically 3-12 months). Bridge loans are the primary financing vehicle for fix-and-flip projects.",
    whyItMatters:
      "A borrower's fix-and-flip track record is the strongest predictor of whether they'll execute successfully and repay your loan. Verifying that they've actually completed the projects they claim — and that those projects were profitable — separates legitimate operators from borrowers padding their resume.",
    example:
      "Borrower claims 15 completed flips in Phoenix. Property record search confirms 11 acquisitions under their entity, 9 with disposition records showing completed sales. Two properties still held with no recent activity — worth a conversation.",
    relatedTerms: ["bridge-loan", "construction-holdback", "experience-tier"],
    ctaText: "Verify borrower track records with real property data.",
    ctaFeature: "Track Record Verification",
  },
  {
    slug: "loan-to-value",
    term: "Loan-to-Value (LTV)",
    definition:
      "The ratio of a loan amount to the appraised value of the property securing it, expressed as a percentage. A $600K loan on a property worth $800K has a 75% LTV. Bridge lenders typically cap LTV at 65-80%.",
    whyItMatters:
      "LTV determines your downside protection if the borrower defaults. But LTV alone doesn't protect you — a borrower with a history of defaults, suspended entities, or fraudulent track records can create losses even at conservative LTVs through delayed foreclosure, property damage, or legal complications.",
    relatedTerms: ["bridge-loan", "hard-money-loan", "foreclosure"],
    ctaText: "Go beyond LTV. Validate the borrower too.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "lis-pendens",
    term: "Lis Pendens",
    definition:
      "A recorded notice indicating that a lawsuit affecting the title to a specific property has been filed. Latin for \"suit pending.\" It puts the public on notice that ownership of the property is in dispute.",
    whyItMatters:
      "A lis pendens on a borrower's current or prior properties is a significant red flag. It may indicate construction defect lawsuits, mechanic's lien disputes, or title issues. Properties with lis pendens are difficult to sell, which directly threatens your exit strategy. PulseClose screens for lis pendens as part of the litigation check.",
    example:
      "A subcontractor files a lis pendens against a property your borrower is rehabbing, claiming $80K in unpaid work. This clouds title and can delay or prevent the sale that was supposed to repay your bridge loan.",
    relatedTerms: ["mechanics-lien", "notice-of-default", "foreclosure"],
    ctaText: "Screen for lis pendens automatically.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "mechanics-lien",
    term: "Mechanics Lien",
    definition:
      "A legal claim placed on a property by a contractor, subcontractor, or material supplier who has not been paid for work performed or materials delivered. Mechanics liens take priority over many other liens in some states.",
    whyItMatters:
      "Mechanics liens on a borrower's prior projects suggest they don't pay their contractors — which means their current project may face the same issues. Unpaid contractors can cloud title and delay sales. For construction bridge loans, checking the GC's history of lien-related disputes is essential due diligence.",
    relatedTerms: ["lis-pendens", "general-contractor-license", "construction-holdback"],
    ctaText: "Check contractor and borrower litigation history.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "registered-agent",
    term: "Registered Agent",
    definition:
      "A person or company designated by a business entity to receive legal notices, government correspondence, and service of process on behalf of the entity. Every entity registered with a state must maintain a registered agent in that state.",
    whyItMatters:
      "A resigned registered agent is a red flag — it often indicates the entity is no longer actively managed or has failed to pay its agent fees. PulseClose flags resigned agents during entity validation. An entity without an active registered agent may be out of compliance and unable to transact.",
    relatedTerms: ["good-standing", "sos-filing", "beneficial-ownership"],
    ctaText: "Check entity status and registered agents across 50 states.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "good-standing",
    term: "Good Standing",
    definition:
      "An entity status indicating that a business has met all state filing requirements, paid all fees, and is authorized to transact business. The opposite — not in good standing — typically means delinquent filings, unpaid taxes, or administrative dissolution.",
    whyItMatters:
      "Lending to an entity that's not in good standing creates legal risk. The entity may lack the authority to enter into contracts or hold title to property. PulseClose checks SOS status in all 50 states and flags any entity that isn't active and in good standing.",
    relatedTerms: ["registered-agent", "sos-filing", "beneficial-ownership"],
    ctaText: "Verify entity good standing instantly.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "sos-filing",
    term: "Secretary of State Filing",
    definition:
      "The official registration of a business entity (LLC, Corporation, LP, etc.) with a state's Secretary of State office. The filing creates the entity's legal existence and establishes a public record including formation date, entity type, registered agent, and status.",
    whyItMatters:
      "SOS filings are the foundation of entity validation. A recently formed entity (under 6 months) with no track record applying for a large bridge loan is suspicious. An entity formed in a different state than where the property is located may require foreign entity registration. PulseClose automates SOS lookups across all 50 states.",
    relatedTerms: ["registered-agent", "good-standing", "beneficial-ownership"],
    ctaText: "Automate SOS lookups across all 50 states.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "beneficial-ownership",
    term: "Beneficial Ownership",
    definition:
      "The natural person(s) who ultimately own or control a legal entity, even if the entity is held through multiple layers of ownership. FinCEN's Beneficial Ownership Information (BOI) reporting requires most companies to disclose their beneficial owners.",
    whyItMatters:
      "Bridge lenders need to know who they're actually lending to. A borrower may use multiple LLCs to obscure their identity or hide prior defaults. Verifying that the individual guarantor actually controls the borrowing entity — and checking that individual's history — is critical due diligence.",
    relatedTerms: ["sos-filing", "registered-agent", "good-standing"],
    ctaText: "Verify borrower entities and ownership.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "bankruptcy",
    term: "Bankruptcy",
    definition:
      "A federal court proceeding where individuals or businesses seek relief from debts they cannot pay. Chapter 7 (liquidation) and Chapter 11 (reorganization) are the most relevant to bridge lending. Bankruptcy filings are public records searchable through PACER.",
    whyItMatters:
      "A borrower with a prior bankruptcy filing isn't automatically disqualified, but it demands scrutiny. Was the bankruptcy discharged or dismissed? How recent? Does the borrower's application disclose it? PulseClose searches federal bankruptcy records as part of every validation.",
    example:
      "Borrower applies for a $1.2M bridge loan. PACER search reveals a Chapter 7 filing from 2019, discharged in 2020. The borrower didn't disclose this on their application — that's the real red flag.",
    relatedTerms: ["foreclosure", "notice-of-default", "judgment-lien"],
    ctaText: "Search federal bankruptcy records automatically.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "foreclosure",
    term: "Foreclosure",
    definition:
      "The legal process by which a lender repossesses a property after the borrower defaults on the loan. Foreclosure methods vary by state — judicial (court-supervised) vs. non-judicial (power of sale). The process typically takes 3-18 months.",
    whyItMatters:
      "Prior foreclosures in a borrower's history indicate they've defaulted on loans before. While one foreclosure in an otherwise strong track record may be explainable, multiple foreclosures are a pattern. PulseClose screens for foreclosure records as part of the litigation check.",
    relatedTerms: ["notice-of-default", "bankruptcy", "lis-pendens"],
    ctaText: "Screen for prior foreclosures and defaults.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "notice-of-default",
    term: "Notice of Default (NOD)",
    definition:
      "A formal notification recorded in the county where a property is located, stating that a borrower has failed to make required payments on a mortgage or deed of trust. An NOD is typically the first step in the foreclosure process.",
    whyItMatters:
      "NODs on a borrower's properties — past or present — are early warning signs. A borrower with active NODs on existing properties while applying for new bridge loans may be in financial distress and using new loans to cover old ones. That's the definition of borrower fraud in bridge lending.",
    relatedTerms: ["foreclosure", "deed-of-trust", "lis-pendens"],
    ctaText: "Check for notices of default in borrower history.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "deed-of-trust",
    term: "Deed of Trust",
    definition:
      "A legal document that secures a loan with real property by transferring legal title to a trustee until the loan is repaid. Used in many states instead of a mortgage. Involves three parties: the borrower (trustor), lender (beneficiary), and trustee.",
    whyItMatters:
      "Bridge loans are typically secured by a deed of trust in trust-deed states. Understanding the deed of trust position (first vs. second) and any existing encumbrances on the property is fundamental to evaluating loan security. PulseClose's litigation screening can surface competing claims against properties.",
    relatedTerms: ["foreclosure", "notice-of-default", "loan-to-value"],
    ctaText: "Validate borrowers before recording your deed of trust.",
    ctaFeature: "Entity Validation",
  },
  {
    slug: "judgment-lien",
    term: "Judgment Lien",
    definition:
      "A lien placed on a debtor's property as a result of a court judgment. When a court rules that a person owes money, the creditor can record a judgment lien against the debtor's real property, which must be satisfied before the property can be sold with clear title.",
    whyItMatters:
      "Judgment liens against a borrower indicate they've lost lawsuits and owe money. These liens can attach to the property you're lending against, complicating your security position and exit. PulseClose's litigation screening surfaces lawsuits that could result in judgment liens.",
    relatedTerms: ["lis-pendens", "mechanics-lien", "foreclosure"],
    ctaText: "Screen for lawsuits and judgment liens.",
    ctaFeature: "Litigation Screening",
  },
  {
    slug: "construction-holdback",
    term: "Construction Holdback",
    definition:
      "A portion of a bridge loan that is held in reserve and disbursed in stages as construction or renovation milestones are completed. Also called a draw schedule or construction escrow. Protects the lender by ensuring funds are used for intended improvements.",
    whyItMatters:
      "Holdback management is only as good as your confidence in the GC executing the work. A contractor with a suspended license, disciplinary history, or uninsured operations puts the entire construction budget at risk. PulseClose validates GC credentials before you fund the holdback.",
    example:
      "On a $600K bridge loan, $200K is held back for rehab costs. Released in 3 draws as the GC completes demo, rough-in, and finishes. PulseClose verifies the GC's license is active and insurance is current before the first draw.",
    relatedTerms: ["general-contractor-license", "draw-schedule", "fix-and-flip"],
    ctaText: "Validate your GC before funding construction draws.",
    ctaFeature: "GC Validation",
  },
  {
    slug: "draw-schedule",
    term: "Draw Schedule",
    definition:
      "A predetermined timeline specifying when and how much money from a construction holdback will be released to the borrower or GC as work progresses. Each draw typically requires inspection verification before release.",
    whyItMatters:
      "The draw schedule is your control mechanism during construction. But if the GC is unlicensed, underinsured, or has a history of abandoned projects, no draw schedule can protect you. Validating the GC upfront prevents problems that draw management alone can't solve.",
    relatedTerms: ["construction-holdback", "general-contractor-license", "fix-and-flip"],
    ctaText: "Verify GC credentials before your first draw.",
    ctaFeature: "GC Validation",
  },
  {
    slug: "general-contractor-license",
    term: "General Contractor License",
    definition:
      "A state-issued license authorizing a contractor to perform construction work. Requirements vary by state — some require exams, bonds, and insurance, while others have minimal requirements. License types include General Building (B), General Engineering (A), and specialty classifications.",
    whyItMatters:
      "An unlicensed GC on a construction bridge loan is a major risk. Work performed without proper licensing may violate building codes, void insurance, and expose the property owner (your borrower) to liability. Some states impose criminal penalties for unlicensed contracting. PulseClose verifies license status, expiration, and disciplinary history.",
    relatedTerms: ["workers-compensation", "surety-bond", "construction-holdback"],
    ctaText: "Verify contractor licenses across state licensing boards.",
    ctaFeature: "GC Validation",
  },
  {
    slug: "workers-compensation",
    term: "Workers' Compensation Insurance",
    definition:
      "Insurance that provides wage replacement and medical benefits to employees injured on the job. Most states require employers (including contractors) to carry workers' comp coverage. Failure to carry it can result in license suspension and personal liability.",
    whyItMatters:
      "A GC without workers' comp coverage creates liability exposure for everyone involved, including the property owner and potentially the lender. If a worker is injured on a job funded by your bridge loan, the lack of insurance can result in lawsuits, work stoppages, and mechanics liens. PulseClose checks insurance verification as part of GC validation.",
    relatedTerms: ["general-contractor-license", "surety-bond", "construction-holdback"],
    ctaText: "Verify GC insurance and credentials.",
    ctaFeature: "GC Validation",
  },
  {
    slug: "experience-tier",
    term: "Experience Tier",
    definition:
      "A classification system used by bridge lenders to categorize borrowers based on the number and quality of completed real estate projects. PulseClose uses a 1-4 tier system: Tier 1 (10+ completed), Tier 2 (5-9), Tier 3 (1-4), Tier 4 (no verified completions).",
    whyItMatters:
      "Experience tier directly affects loan terms, rates, and approval decisions. A Tier 1 borrower with 15 verified completions gets better terms than a first-time flipper. The problem is that experience claims are often self-reported. PulseClose verifies track records against actual property records to assign an evidence-based tier.",
    example:
      "Borrower claims Tier 1 experience with 20 flips. Property record search finds 8 dispositions under their entity. PulseClose assigns Tier 2 based on verified data — not the borrower's self-report.",
    relatedTerms: ["fix-and-flip", "bridge-loan", "loan-to-value"],
    ctaText: "Assign experience tiers based on real property data.",
    ctaFeature: "Track Record Verification",
  },
];
