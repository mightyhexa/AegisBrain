// src/lib/site.config.ts

export const nav = [
  { label: "Product", href: "#modules" },
  { label: "How it works", href: "#how" },
  { label: "Interactive Demo", href: "#try" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export const legalLinks = [
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Data Processing Addendum", href: "/legal/dpa" },
];

export const site = {
  name: "AegisBrain",
  legalName: "AegisBrain Inc.",
  tagline: "Deterministic Policy Gateway for Autonomous AI Agents",
  description:
    "AegisBrain turns decisions made in Slack into approved rules, then checks every agent action against them before it runs.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  contactEmail: "security@aegisbrain.com",
  email: "security@aegisbrain.com",

  hostingRegion: "AWS ap-south-1 (Mumbai)",
  hostingProvider: "Amazon Web Services (AWS)",
  aiProvider: "Anthropic / OpenAI",
  grievanceOfficer: "Security & Compliance Officer",
  address: "Hyderabad, Telangana, India",

  earlyAccess: true,
  legalReviewed: false,

  links: {
    github: "https://github.com/aegisbrain",
    slackApp: "https://slack.com/apps/aegisbrain",
    statusPage: "https://status.aegisbrain.com",
  },

  nav,
  legalLinks,

  modules: [
    {
      id: "spend-caps",
      tag: "FINANCIAL GOVERNANCE",
      title: "Hard Spend & Refund Ceilings",
      summary:
        "Restricts autonomous refunds, credit card transactions, and discount authorizations to approved thresholds.",
      badge: "Sub-millisecond AST Check",
      sampleRule: {
        action: "payments.refund",
        threshold: "₹5,000 INR",
        violationVerdict: "HOLD FOR APPROVAL",
      },
      codeSnippet: `rule refund_cap {\n  when action == "payments.refund"\n  and amount_inr > 5000\n  then effect = HOLD\n}`,
    },
    {
      id: "pii-scrub",
      tag: "DATA PRIVACY",
      title: "In-Flight PII Redaction",
      summary:
        "Prevents autonomous agents from exfiltrating customer Aadhaar, PAN, emails, or tokens into 3rd-party LLM context windows.",
      badge: "Cryptographic Anonymization",
      sampleRule: {
        action: "crm.export_contacts",
        sanitization: "SHA-256 Masked",
        violationVerdict: "DENY EXPORT",
      },
      codeSnippet: `rule pii_guard {\n  when payload.contains_pii == true\n  and target != "internal_vault"\n  then effect = DENY\n}`,
    },
    {
      id: "tool-whitelist",
      tag: "SANDBOX SECURITY",
      title: "Tool & API Call Whitelisting",
      summary:
        "Ensures agents can only call explicitly authorized external REST endpoints and DB mutations approved in workspace settings.",
      badge: "Strict RBAC Scope",
      sampleRule: {
        action: "db.drop_collection",
        status: "UNREGISTERED_TOOL",
        violationVerdict: "PERMANENT BLOCK",
      },
      codeSnippet: `rule tool_scope {\n  when tool_name not in APPROVED_REGISTRY\n  then effect = DENY\n}`,
    },
    {
      id: "velocity-limits",
      tag: "ABUSE PREVENTION",
      title: "Velocity & Rate Throttling",
      summary:
        "Prevents infinite reasoning loops, tool-recursion runaway costs, and high-frequency webhook spamming.",
      badge: "Sliding Window Leaky Bucket",
      sampleRule: {
        action: "email.send_campaign",
        limit: "10 ops / minute",
        violationVerdict: "THROTTLE (429)",
      },
      codeSnippet: `rule rate_limit {\n  when rate(agent_id, 60s) > 10\n  then effect = THROTTLE\n}`,
    },
    {
      id: "human-loop",
      tag: "ESCALATION PIPELINE",
      title: "Human-in-the-Loop Gatekeeper",
      summary:
        "Suspends ambiguous or high-impact actions and pings designated Slack channel owners for 1-click authorization.",
      badge: "Two-Person Integrity Rule",
      sampleRule: {
        action: "server.restart_cluster",
        approver: "Platform Lead",
        violationVerdict: "PENDING_WEBHOOK_ACK",
      },
      codeSnippet: `rule human_approval {\n  when impact_tier == "CRITICAL"\n  and not human_signed\n  then effect = SUSPEND\n}`,
    },
  ],
} as const;

export const siteConfig = site;
export default site;