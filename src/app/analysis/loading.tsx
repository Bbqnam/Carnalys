const sections = [0, 1, 2];

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading market analysis"
      className="mx-auto max-w-[1400px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10 lg:px-12"
    >
      <div className="skeleton-shimmer h-8 w-64 rounded-xl" />
      <div className="skeleton-shimmer mt-3 h-4 w-full max-w-lg rounded-lg" />

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((filter) => (
          <div key={filter}>
            <div className="skeleton-shimmer h-2.5 w-16 rounded-full" />
            <div className="skeleton-shimmer mt-2 h-10 rounded-xl" />
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 sm:gap-x-10">
        {[0, 1, 2, 3].map((stat) => (
          <div key={stat}>
            <div className="skeleton-shimmer h-2.5 w-24 rounded-full" />
            <div className="skeleton-shimmer mt-2 h-7 w-28 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <div className="border-t border-border pt-8" key={section}>
            <div className="skeleton-shimmer h-5 w-52 rounded-lg" />
            <div className="skeleton-shimmer mt-2 h-3.5 w-full max-w-md rounded-lg" />
            <div className="skeleton-shimmer mt-6 h-64 rounded-2xl" />
          </div>
        ))}
      </div>
    </main>
  );
}
