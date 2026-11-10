"use client";

import { useMemo, useState } from "react";
import { CircleAlert, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/nav/PageHeader";
import { SpaceParticleField } from "@/components/visual/SpaceParticleField";
import { useWeeklyBrief } from "@/hooks/useWeeklyBrief";
import type {
  WeeklyBriefResponse,
  WeeklyEvent,
  WeeklyFactor,
  WeeklyNarrative,
  WeeklyQuote,
  WeeklySourceStatus,
  WeeklyVerdict
} from "@/lib/types";

const TPE = "Asia/Taipei";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const VERDICT: Record<WeeklyVerdict, { label: string; tone: string; chip: string }> = {
  ABOVE: { label: "高於預期", tone: "text-ember", chip: "border-ember/40 bg-ember/10 text-ember" },
  BELOW: { label: "低於預期", tone: "text-copper", chip: "border-copper/40 bg-copper/10 text-copper" },
  INLINE: { label: "符合預期", tone: "text-slate-100", chip: "border-white/15 bg-white/5 text-slate-300" }
};

const IMPACT: Record<string, { label: string; dot: string }> = {
  High: { label: "高", dot: "bg-short" },
  Medium: { label: "中", dot: "bg-ember" },
  Low: { label: "低", dot: "bg-slate-500" },
  Holiday: { label: "假日", dot: "bg-copper" }
};

const COUNTRY_FILTERS = [
  { key: "ALL", label: "全部" },
  { key: "USD", label: "美國" },
  { key: "CNY", label: "中國" },
  { key: "EUR", label: "歐元區" },
  { key: "JPY", label: "日本" },
  { key: "GBP", label: "英國" },
  { key: "OTHER", label: "其他" }
] as const;
type CountryFilter = (typeof COUNTRY_FILTERS)[number]["key"];
const MAJOR = new Set(["USD", "CNY", "EUR", "JPY", "GBP"]);

function asOfText(seconds: number | null): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString("zh-TW", {
    timeZone: TPE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function monthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function closeTag(date: string | undefined, mode: WeeklyBriefResponse["mode"]): string {
  if (!date) return "";
  const [, month, day] = date.split("-");
  const label = `${MONTHS[Number(month) - 1]} ${Number(day)}`;
  return mode === "live" ? `${label} 最新` : `${label} CLOSE`;
}

function signed(value: number, digits: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

function changeText(value: number | null, unit: WeeklyQuote["change_unit"]): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return unit === "bp" ? signed(value, 1, "bp") : signed(value, 2, "%");
}

function changeTone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "text-slate-400";
  return value > 0 ? "text-long" : "text-short";
}

function quoteValue(quote: WeeklyQuote): string {
  if (quote.kind === "yield") return `${quote.last.toFixed(2)}%`;
  const digits = quote.decimals;
  return quote.last.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "165K" → "+16.5 萬"；月增率等變動值補正號。 */
function actualDisplay(event: WeeklyEvent): string | null {
  const actual = event.actual;
  if (!actual) return null;
  const number = Number.parseFloat(actual.replace(/[^0-9.-]/g, ""));
  if (actual.endsWith("K") && Number.isFinite(number)) return `${signed(number / 10, 1, "")} 萬`;
  const isChange = /m\/m|q\/q|Change/.test(event.title);
  if (isChange && Number.isFinite(number) && number > 0) return `+${actual}`;
  return actual;
}

function SectionHead({ index, title, tag }: { index: string; title: string; tag?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
      <h3 className="flex min-w-0 items-baseline gap-2.5">
        <span className="font-kicker text-2xl font-bold text-gold">{index}</span>
        <span className="font-display truncate text-lg font-bold text-slate-50">{title}</span>
      </h3>
      {tag ? (
        <span className="font-kicker shrink-0 rounded border border-gold/40 px-2 py-0.5 text-[10px] tracking-[0.18em] text-goldhi">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

function Hero({ data }: { data: WeeklyBriefResponse }) {
  const headline = data.narrative?.headline ?? [];
  return (
    <section className="glass-panel relative overflow-hidden rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-kicker text-[11px] tracking-[0.42em] text-ember">{data.kicker}</p>
          <h2 className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display bg-gradient-to-b from-white via-goldhi to-gold bg-clip-text text-4xl font-black tracking-[-0.02em] text-transparent sm:text-5xl">
              {data.title}
            </span>
            <span className="font-kicker text-xl font-bold tracking-[0.12em] text-slate-100 sm:text-2xl">
              {data.week_label}
            </span>
          </h2>
        </div>
        <div className="flex flex-col items-start gap-3 lg:max-w-[46%] lg:items-end lg:text-right">
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs text-slate-300">
            資料截至 {asOfText(data.data_as_of)}・台灣時間
          </span>
          {headline.map((line) => (
            <p key={line} className="font-display text-base font-bold leading-snug text-goldhi sm:text-lg">
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultCard({ event }: { event: WeeklyEvent }) {
  const verdict = event.verdict ? VERDICT[event.verdict] : null;
  const value = actualDisplay(event);
  return (
    <div className="surface relative flex min-h-[7.5rem] flex-col rounded-lg border-t-2 border-t-ember/70 px-3.5 py-3">
      <p className="truncate text-[11px] text-slate-400">
        {event.country_zh} {event.title_zh}
      </p>
      <p className={`font-data mt-1 text-2xl font-bold ${verdict ? verdict.tone : "text-slate-50"}`}>
        {value ?? (event.released ? "待更新" : "—")}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        預期 {event.forecast || "—"}，前值 {event.previous || "—"}
      </p>
      {verdict ? (
        <span className={`mt-auto w-fit rounded border px-1.5 py-0.5 text-[10px] ${verdict.chip}`}>{verdict.label}</span>
      ) : null}
    </div>
  );
}

function KpiCard({ quote }: { quote: WeeklyQuote }) {
  return (
    <div className="surface relative flex min-h-[7.5rem] flex-col rounded-lg border-t-2 border-t-gold/50 px-3.5 py-3">
      <p className="truncate text-[11px] text-slate-400">{quote.name}</p>
      <p className="font-data mt-1 text-2xl font-bold text-slate-50">{quoteValue(quote)}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        本週 <span className={changeTone(quote.week_change)}>{changeText(quote.week_change, quote.change_unit)}</span>
        ，前日 <span className={changeTone(quote.day_change)}>{changeText(quote.day_change, quote.change_unit)}</span>
      </p>
      {quote.stale ? <span className="mt-auto text-[10px] text-slate-500">使用上次成功資料</span> : null}
    </div>
  );
}

function ResultStrip({ data }: { data: WeeklyBriefResponse }) {
  if (!data.results.length && !data.kpis.length) return null;
  return (
    <section className="grid gap-3 xl:grid-cols-[8.5rem_minmax(0,1fr)] xl:items-stretch">
      <div className="flex items-end gap-3 px-1 xl:flex-col xl:items-start xl:justify-center">
        <p className="font-display text-xl font-black text-slate-50">{data.results.length ? data.results_label : "市場指標"}</p>
        <p className="font-kicker text-[10px] tracking-[0.22em] text-ember">KEY DATA</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
        {data.results.map((event) => (
          <ResultCard key={event.id} event={event} />
        ))}
        {data.kpis.map((quote) => (
          <KpiCard key={quote.key} quote={quote} />
        ))}
      </div>
    </section>
  );
}

function ClosesPanel({ data }: { data: WeeklyBriefResponse }) {
  const tag = closeTag(data.closes.find((quote) => quote.key === "spx")?.as_of, data.mode);
  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <SectionHead index="01" title={data.closes_label} tag={tag} />
      {data.closes.length ? (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="py-2 text-left font-normal">市場</th>
              <th className="py-2 text-right font-normal">收盤</th>
              <th className="py-2 text-right font-normal">當日</th>
              <th className="py-2 text-right font-normal">本週</th>
            </tr>
          </thead>
          <tbody>
            {data.closes.map((quote) => (
              <tr key={quote.key} className="border-t border-white/5">
                <td className="py-2.5 pr-2 text-slate-300">
                  {quote.name}
                  {quote.stale ? <span className="ml-1 text-[10px] text-slate-500">（延遲）</span> : null}
                </td>
                <td className="font-data py-2.5 text-right font-bold text-slate-50">{quoteValue(quote)}</td>
                <td className={`font-data py-2.5 pl-2 text-right ${changeTone(quote.day_change)}`}>
                  {changeText(quote.day_change, quote.change_unit)}
                </td>
                <td className={`font-data py-2.5 pl-2 text-right ${changeTone(quote.week_change)}`}>
                  {changeText(quote.week_change, quote.change_unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">行情資料暫時無法取得</p>
      )}
    </section>
  );
}

function EventChip({ event }: { event: WeeklyEvent }) {
  if (!event.forecast && !event.previous && !event.actual) return null;
  const verdict = event.verdict ? VERDICT[event.verdict] : null;
  return (
    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] leading-relaxed text-slate-300">
      {event.title_zh}
      {event.actual ? (
        <b className={`ml-1 font-data ${verdict ? verdict.tone : "text-slate-50"}`}>{event.actual}</b>
      ) : null}
      <span className="ml-1 text-slate-500">
        預期 {event.forecast || "—"}・前值 {event.previous || "—"}
      </span>
    </span>
  );
}

function FactorRow({ factor }: { factor: WeeklyFactor }) {
  const subtitle = factor.note ?? factor.holiday_note;
  const hasData = factor.events.some((event) => event.forecast || event.previous || event.actual);
  return (
    <li className="flex gap-3 border-b border-white/5 py-3 last:border-0">
      <span className="font-kicker w-6 shrink-0 text-xl font-bold leading-6 text-gold">{factor.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="font-display font-bold text-slate-50">
            {factor.title}
            {factor.released ? (
              <span className="ml-2 rounded border border-long/30 bg-long/10 px-1.5 py-px align-middle text-[10px] font-normal text-long">
                {hasData ? "已公布" : "已結束"}
              </span>
            ) : null}
          </p>
          <p className="font-data text-xs text-slate-400">
            {monthDay(factor.date)}（{factor.weekday}）{factor.time_label}
          </p>
        </div>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {factor.events.map((event) => (
            <EventChip key={event.id} event={event} />
          ))}
        </div>
      </div>
    </li>
  );
}

function FactorsPanel({ data }: { data: WeeklyBriefResponse }) {
  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <SectionHead index="02" title={data.factors_label} tag="BY IMPORTANCE" />
      {data.factors.length ? (
        <ol className="mt-1">
          {data.factors.map((factor) => (
            <FactorRow key={factor.id} factor={factor} />
          ))}
        </ol>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">本週沒有中、高影響力事件</p>
      )}
    </section>
  );
}

function ViewsPanel({ narrative, aiEnabled }: { narrative: WeeklyNarrative | null; aiEnabled: boolean }) {
  return (
    <section className="glass-panel flex flex-col rounded-2xl p-4 sm:p-5 lg:col-span-2 xl:col-span-1">
      <SectionHead index="03" title="各市場觀察" tag="AI WATCHLIST" />
      {narrative && narrative.markets.length ? (
        <div className="mt-1">
          {narrative.markets.map((view) => (
            <div key={view.market} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-b border-white/5 py-3 last:border-0">
              <span className="font-display text-lg font-black text-goldhi">{view.market}</span>
              <ul className="space-y-1.5 text-sm leading-relaxed text-slate-300">
                {view.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="text-gold">›</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-sm text-slate-500">
          {aiEnabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiEnabled ? "AI 觀察產生中，數據已先更新" : "AI 觀察暫未提供"}
        </div>
      )}
      {narrative?.stale ? (
        <p className="mt-2 text-[11px] text-slate-500">有新數據公布，AI 觀察稍後更新。</p>
      ) : null}
      {narrative && narrative.one_line.length ? (
        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-4 text-center">
          <p className="font-kicker text-[10px] tracking-[0.36em] text-gold">THE WEEK IN ONE LINE</p>
          {narrative.one_line.map((line) => (
            <p key={line} className="font-display mt-1.5 text-base font-bold text-goldhi">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {narrative ? (
        <p className="mt-3 text-[10px] text-slate-500">
          AI 依本頁數據撰寫於 {asOfText(narrative.generated_at)}，僅供參考，不構成投資建議。
        </p>
      ) : null}
    </section>
  );
}

function matchesCountry(event: WeeklyEvent, filter: CountryFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "OTHER") return !MAJOR.has(event.country);
  return event.country === filter;
}

function CalendarPanel({ events, now }: { events: WeeklyEvent[]; now: number }) {
  const [impacts, setImpacts] = useState<Set<string>>(() => new Set(["High", "Medium", "Holiday"]));
  const [country, setCountry] = useState<CountryFilter>("ALL");

  const days = useMemo(() => {
    const grouped = new Map<string, WeeklyEvent[]>();
    for (const event of events) {
      if (!impacts.has(event.impact) || !matchesCountry(event, country)) continue;
      const list = grouped.get(event.date) ?? [];
      list.push(event);
      grouped.set(event.date, list);
    }
    return [...grouped.entries()];
  }, [events, impacts, country]);

  const toggleImpact = (impact: string) =>
    setImpacts((current) => {
      const next = new Set(current);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });

  return (
    <section id="calendar" className="glass-panel rounded-2xl p-4 sm:p-5">
      <SectionHead index="04" title="完整經濟日曆" tag="台灣時間" />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-slate-500">影響力</span>
          {Object.entries(IMPACT).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleImpact(key)}
              aria-pressed={impacts.has(key)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                impacts.has(key) ? "border-gold/50 bg-gold/10 text-goldhi" : "border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-slate-500">國家</span>
          {COUNTRY_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setCountry(item.key)}
              aria-pressed={country === item.key}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition ${
                country === item.key ? "border-gold/50 bg-gold/10 text-goldhi" : "border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-[3.5rem_5.5rem_minmax(0,1fr)_5.5rem_5.5rem_5.5rem] gap-3 border-b border-white/10 pb-2 text-[11px] text-slate-500 md:grid">
        <span>時間</span>
        <span>國家</span>
        <span>事件</span>
        <span className="text-right">實際</span>
        <span className="text-right">預期</span>
        <span className="text-right">前值</span>
      </div>

      {days.length ? (
        days.map(([date, list]) => (
          <div key={date} className="mt-3">
            <p className="font-kicker text-xs font-bold tracking-[0.16em] text-gold">
              {monthDay(date)}（{list[0].weekday}）
            </p>
            <ul>
              {list.map((event) => {
                const past = event.timestamp !== null && event.timestamp <= now;
                const verdict = event.verdict ? VERDICT[event.verdict] : null;
                const impact = IMPACT[event.impact] ?? IMPACT.Low;
                const title = (
                  <span className="min-w-0">
                    <span className="text-sm text-slate-100">{event.title_zh}</span>
                    {event.title_zh !== event.title ? (
                      <span className="ml-1.5 text-[11px] text-slate-500 max-md:hidden">{event.title}</span>
                    ) : null}
                    {event.url ? (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 inline-flex align-middle text-slate-500 hover:text-ember"
                        aria-label={`在 Forex Factory 查看 ${event.title}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </span>
                );
                return (
                  <li
                    key={event.id}
                    className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-white/5 py-2.5 last:border-0 md:grid-cols-[3.5rem_5.5rem_minmax(0,1fr)_5.5rem_5.5rem_5.5rem] md:items-center ${
                      past ? "opacity-60" : ""
                    }`}
                  >
                    <span className="font-data text-xs text-slate-400">{event.time_label}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-300 max-md:hidden">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${impact.dot}`} />
                      {event.country_zh}
                    </span>
                    <div className="min-w-0 md:contents">
                      <div className="min-w-0">
                        <span className="mr-1.5 inline-flex items-center gap-1 text-[11px] text-slate-400 md:hidden">
                          <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} />
                          {event.country_zh}
                        </span>
                        {title}
                      </div>
                      {event.actual || event.forecast || event.previous ? (
                      <p className="mt-0.5 text-[11px] text-slate-500 md:hidden">
                        {event.actual ? (
                          <span className={`font-data font-bold ${verdict ? verdict.tone : "text-slate-100"}`}>
                            實際 {event.actual}・
                          </span>
                        ) : null}
                        預期 {event.forecast || "—"}・前值 {event.previous || "—"}
                      </p>
                      ) : null}
                      <span className={`font-data hidden text-right text-sm font-bold md:block ${verdict ? verdict.tone : "text-slate-100"}`}>
                        {event.actual ?? "—"}
                      </span>
                      <span className="font-data hidden text-right text-sm text-slate-300 md:block">{event.forecast || "—"}</span>
                      <span className="font-data hidden text-right text-sm text-slate-400 md:block">{event.previous || "—"}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">沒有符合篩選條件的事件</p>
      )}
    </section>
  );
}

const HEALTH_DOT: Record<WeeklySourceStatus["health"], string> = {
  HEALTHY: "bg-long",
  STALE: "bg-gold",
  OFFLINE: "bg-short"
};

function SourcesFooter({ sources }: { sources: WeeklySourceStatus[] }) {
  return (
    <footer className="flex flex-col gap-2 px-1 pb-4 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-start sm:justify-between">
      <p className="max-w-3xl">
        資料來源：Forex Factory 經濟日曆、美國勞工統計局（BLS）、Yahoo Finance、Binance。實際值目前只自動補上
        BLS 發布的非農、失業率、時薪、CPI、PPI、JOLTS。AI 觀察由 Claude 依本頁數據撰寫，僅供參考，不構成投資建議。
      </p>
      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1">
        {sources.map((source) => (
          <li key={source.key} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[source.health]}`} />
            {source.name}
          </li>
        ))}
      </ul>
    </footer>
  );
}

export function WeeklyBrief() {
  const { data, loading, error, refresh } = useWeeklyBrief();
  const now = Math.floor(Date.now() / 1000);

  return (
    <main className="relative min-h-screen px-3 pb-16 pt-3 sm:px-5 lg:px-8 lg:pt-5">
      <SpaceParticleField />
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-4 sm:gap-5">
        <PageHeader title="每週消息面" kicker="WEEKLY MACRO" anchors={[{ href: "#calendar", label: "經濟日曆" }]} />

        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-short/30 bg-short/10 px-4 py-3 text-sm text-red-100">
            <span className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 shrink-0" />
              {error}
            </span>
            <button type="button" onClick={() => void refresh()} className="inline-flex cursor-pointer items-center gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              重試
            </button>
          </div>
        ) : null}

        {!data ? (
          <div className="glass-panel flex min-h-[40vh] items-center justify-center gap-2 rounded-2xl text-sm text-slate-400">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "讀取每週消息面…" : "目前沒有資料"}
          </div>
        ) : data.mode === "warming" ? (
          <div className="glass-panel flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
            {data.notice}
          </div>
        ) : (
          <>
            <Hero data={data} />
            {data.notice ? (
              <p className="rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-2.5 text-xs text-goldhi">{data.notice}</p>
            ) : null}
            <ResultStrip data={data} />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
              <ClosesPanel data={data} />
              <FactorsPanel data={data} />
              <ViewsPanel narrative={data.narrative} aiEnabled={data.ai_enabled} />
            </div>
            <CalendarPanel events={data.calendar} now={now} />
            <SourcesFooter sources={data.sources} />
          </>
        )}
      </div>
    </main>
  );
}
