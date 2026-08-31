type ProgressiveCardSkeletonProps = {
  count?: number;
  className?: string;
};

type ProgressiveTableRowsSkeletonProps = {
  rows?: number;
  columns: number;
};

export function ProgressiveCardSkeleton({
  count = 4,
  className = "",
}: ProgressiveCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`progressive-card-skeleton-${index}`}
          className={[
            "min-h-[150px] animate-pulse rounded-2xl border border-slate-200/80 bg-white/75 p-5 shadow-sm",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="h-4 w-2/3 rounded-full bg-slate-200" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-4/5 rounded-full bg-slate-100" />
            <div className="h-3 w-3/5 rounded-full bg-slate-100" />
          </div>
          <div className="mt-5 flex gap-2">
            <div className="h-7 w-24 rounded-full bg-slate-100" />
            <div className="h-7 w-28 rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </>
  );
}

export function ProgressiveTableRowsSkeleton({
  rows = 5,
  columns,
}: ProgressiveTableRowsSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={`progressive-table-skeleton-${rowIndex}`}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={`progressive-table-skeleton-${rowIndex}-${columnIndex}`}>
              <div className="h-4 w-full max-w-[11rem] animate-pulse rounded-full bg-slate-200/80" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
