/**
 * Placeholder while a page's data loads: the page's own rhythm (a heading,
 * a strip, rows) in faint rules, so content lands where the eye already is.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <p className="sr-only">Loading</p>
      <div className="h-10 w-56 rounded bg-raised" />
      <div className="mt-8 h-14 border-y border-line bg-raised/40" />
      <div className="mt-10 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line pb-4"
          >
            <div className="h-6 w-12 rounded bg-raised" />
            <div className="h-4 flex-1 rounded bg-raised" />
            <div className="h-7 w-24 rounded bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
