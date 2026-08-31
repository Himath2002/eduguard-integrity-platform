import { useRefreshIndicator } from "@/shared/lib/refreshIndicator";

export default function CornerRefreshIndicator() {
  const { activeTask } = useRefreshIndicator();
  if (!activeTask) return null;

  const pct = Math.max(0, Math.min(100, Math.round(activeTask.progress || 0)));
  const size = 52;
  const stroke = 4;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[120]">
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-blue-100 bg-white/96 px-3 py-2 shadow-[0_18px_40px_rgba(37,99,235,0.18)] backdrop-blur-sm">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-label={`${activeTask.label}: ${pct}%`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="transparent" stroke="rgba(191,219,254,0.95)" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="transparent"
              stroke="rgb(37,99,235)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${Math.max(0, c - dash)}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-blue-700">{pct}%</div>
        </div>
        <div className="max-w-[110px] text-center text-[11px] font-medium leading-4 text-slate-600">
          {activeTask.label}
        </div>
      </div>
    </div>
  );
}
