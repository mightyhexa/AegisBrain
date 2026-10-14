import Reveal from "@/components/motion/Reveal";

export default function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="mx-auto max-w-7xl px-6 pb-10 pt-16 md:pt-24">
      <Reveal>
        {eyebrow && <p className="mb-4 text-sm font-medium text-cobalt">{eyebrow}</p>}
        <h1
          className="max-w-4xl font-display font-semibold tracking-[-0.03em]"
          style={{ fontSize: "clamp(2.2rem, 5.6vw, 4.4rem)", lineHeight: 1.02 }}
        >
          {title}
        </h1>
        {lead && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">{lead}</p>}
      </Reveal>
    </header>
  );
}