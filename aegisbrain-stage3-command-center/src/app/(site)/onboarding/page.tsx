import type { Metadata } from "next";
import PageHeader from "@/components/marketing/PageHeader";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Set up your workspace"
        title="Three short steps to your command center"
        lead="Tell us about your company and how your agents work. We create a private workspace that starts in shadow mode."
      />
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <OnboardingWizard />
      </section>
    </>
  );
}
