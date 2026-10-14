import { site } from "@/lib/site.config";

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-6 pb-24 pt-16 md:pt-24">
      {!site.legalReviewed && (
        <p className="mb-8 rounded-2xl border border-hold/30 bg-hold/10 px-5 py-4 text-[15px] text-ink">
          <strong>Draft for legal review.</strong> Fill every [bracket] in <code>src/lib/site.config.ts</code>, check every
          sentence against what the product really does, have a lawyer review this page, then set{" "}
          <code>legalReviewed</code> to <code>true</code> to remove this notice.
        </p>
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-3 text-muted">Last updated: {site.lastUpdated}</p>
      <div
        className="mt-8 text-[17px] leading-relaxed
          [&_a]:text-cobalt [&_a]:underline
          [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight
          [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6
          [&_table]:mt-4 [&_table]:w-full [&_td]:border-b [&_td]:border-ice [&_td]:py-3 [&_td]:pr-4 [&_td]:align-top
          [&_th]:border-b [&_th]:border-ice [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-sm [&_th]:text-muted"
      >
        {children}
      </div>
    </article>
  );
}