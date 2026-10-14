// src/lib/faq.ts
import { site } from "./site.config";

export interface FAQItem {
  q: string;
  a: string;
}

const hostingRegion = site?.hostingRegion ?? "AWS ap-south-1 (Mumbai)";
const contactEmail = site?.contactEmail ?? site?.email ?? "security@aegisbrain.com";

export const faqs: FAQItem[] = [
  {
    q: "Does checking rules introduce latency to agent execution loops?",
    a: "No. Evaluation takes an average of 1.2 ms. The evaluation path runs pure, compiled TypeScript/Go deterministic logic without calling secondary LLMs or remote reasoning loops during runtime checks.",
  },
  {
    q: "What role does AI play if the gateway is deterministic?",
    a: "AI is used solely at draft-time to translate unstructured Slack discussions into typed Abstract Syntax Tree (AST) policy conditions. Once a manager locks a policy, the AI model is decoupled from the execution path entirely.",
  },
  {
    q: "Does AegisBrain read private Slack channels or direct messages?",
    a: "Never. The Slack app only listens in channels where a team explicitly invites it. Direct messages and non-designated channels are completely ignored.",
  },
  {
    q: "Can anyone in Slack create or alter a policy rule?",
    a: "No. AegisBrain enforces strict Role-Based Access Control (RBAC). When a message proposes a restriction, the user's workspace identity and permission level are checked against your directory before drafting is allowed.",
  },
  {
    q: "Where is our data stored and who can see it?",
    a: `Data is stored with our hosting provider in ${hostingRegion}. Our Privacy Policy and Data Processing Addendum strictly protect customer data. Audit trails are cryptographically signed.`,
  },
  {
    q: "Are you SOC 2 certified?",
    a: "We are currently preparing for SOC 2 Type II audit readiness. In the meantime, we provide full transparency into our architecture, data flows, and sub-processors.",
  },
  {
    q: "How do we contact support or request a custom evaluation rule?",
    a: `You can reach our engineering team directly at ${contactEmail} or submit an early access request via the contact form on this page.`,
  },
];

export default faqs;