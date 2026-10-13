/** The UI kit's shared section wrapper: an `h2` named region with a responsive grid (AC-9). */
export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section aria-labelledby={`ui-kit-${title}`} className="flex flex-col gap-4">
    <h2 id={`ui-kit-${title}`} className="text-lg font-semibold">
      {title}
    </h2>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </section>
);
Section.displayName = 'Section';
