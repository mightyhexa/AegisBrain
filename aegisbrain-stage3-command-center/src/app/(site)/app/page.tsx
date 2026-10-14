import type { Metadata } from "next";
import CommandCenter from "@/components/app/CommandCenter";

export const metadata: Metadata = { title: "Command center", robots: { index: false, follow: false } };

export default function AppPage() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24 pt-14 md:pt-20">
      <CommandCenter />
    </section>
  );
}
