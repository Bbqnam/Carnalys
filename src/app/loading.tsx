const cards = Array.from({ length: 6 }, (_, index) => index);

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading Car Finder">
      <section className="bg-[#f4f1ea] px-5 pb-11 pt-24 sm:px-8 sm:pt-28 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="skeleton-shimmer h-3 w-52 rounded-full" />
          <div className="skeleton-shimmer mt-5 h-14 max-w-3xl rounded-2xl sm:h-20" />
          <div className="skeleton-shimmer mt-6 h-16 max-w-4xl rounded-full" />
        </div>
      </section>
      <section className="bg-[#fafaf7] px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="skeleton-shimmer mb-8 h-10 w-72 rounded-xl" />
          <div className="grid gap-5 md:pl-[284px] lg:pl-[294px] xl:grid-cols-2 xl:pl-[312px] 2xl:grid-cols-3">
            {cards.map((card) => (
              <div className="overflow-hidden rounded-[1.6rem] border border-[#e6e5df] bg-white" key={card}>
                <div className="skeleton-shimmer aspect-[3/2]" />
                <div className="space-y-4 p-6">
                  <div className="skeleton-shimmer h-6 w-3/4 rounded-lg" />
                  <div className="skeleton-shimmer h-4 w-1/2 rounded-lg" />
                  <div className="skeleton-shimmer h-16 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
