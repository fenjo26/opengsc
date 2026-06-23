"use client";

import { useEffect, useState } from "react";
import { Play, ShieldAlert, CheckCircle, RefreshCw, Download } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface StatsData {
  summary: {
    google: number;
    yandex: number;
    bing: number;
    mailru: number;
    other: number;
    redirects: number;
  };
  byDomain: Array<{
    id: string;
    domain: string;
    status: string;
    google: number;
    totalBots: number;
    googleShare: number;
    pagesCount: number;
    subdomainsCount: number;
  }>;
  daily: Array<{
    date: string;
    google: number;
    google304: number;
    yandex: number;
    yandex304: number;
    bing: number;
    mailru: number;
    other: number;
    total: number;
    redirects: number;
  }>;
}

export default function IndexerStatsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isLarge, setIsLarge] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/indexer/stats");
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    setIsLarge(window.innerWidth > 960);
  }, []);



  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)" }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        Loading indexer statistics...
      </div>
    );
  }

  const exportDailyToCSV = () => {
    if (!data?.daily) return;
    
    const headers = ["Date", "Google", "Google 304", "Yandex", "Yandex 304", "Bing", "Mail.ru", "Other", "Total", "Redirects"];
    const rows = data.daily.map(row => [
      row.date,
      row.google,
      row.google304,
      row.yandex,
      row.yandex304,
      row.bing,
      row.mailru || 0,
      row.other,
      row.total,
      row.redirects
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `opengsc_indexer_daily_stats_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = data?.daily ? [...data.daily].reverse() : [];
  const hasData = data && (data.summary.google > 0 || data.summary.other > 0 || data.byDomain.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Description Banner */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("indexerTabStats")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {t("indexerTabDescStats")}
        </p>
      </div>
      {/* Simulation alert */}
      {msg && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "rgba(41,151,255,0.1)",
          border: "1px solid rgba(41,151,255,0.2)",
          color: "var(--color-accent-blue)",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <CheckCircle size={16} />
          {msg}
        </div>
      )}

      {/* Grid of stats cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "16px"
      }}>
        {[
          { label: "Google", val: data?.summary.google ?? 0, color: "var(--color-accent-blue)", bg: "rgba(41,151,255,0.08)" },
          { label: "Yandex", val: data?.summary.yandex ?? 0, color: "var(--color-accent-red)", bg: "rgba(255,69,58,0.08)" },
          { label: "Bing", val: data?.summary.bing ?? 0, color: "var(--color-accent-orange)", bg: "rgba(255,159,10,0.08)" },
          { label: "Mail.ru", val: data?.summary.mailru ?? 0, color: "var(--color-text-secondary)", bg: "rgba(142,142,147,0.08)" },
          { label: "Other Bots", val: data?.summary.other ?? 0, color: "var(--color-text-primary)", bg: "rgba(255,255,255,0.06)" },
          { label: "Redirects", val: data?.summary.redirects ?? 0, color: "var(--color-accent-green)", bg: "rgba(52,199,89,0.08)", highlight: true }
        ].map((c, i) => (
          <div
            key={i}
            style={{
              background: "var(--color-card)",
              border: c.highlight ? `1.5px solid ${c.color}` : "1px solid var(--color-border)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              transition: "transform 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseOut={e => e.currentTarget.style.transform = "none"}
          >
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {c.label}
            </span>
            <span style={{ fontSize: "20px", fontWeight: 700, color: c.color }}>
              {formatNumber(c.val)}
            </span>
            <div style={{
              width: "100%",
              height: "4px",
              borderRadius: "2px",
              background: c.bg,
              overflow: "hidden",
              marginTop: "4px"
            }}>
              <div style={{
                height: "100%",
                width: c.val > 0 ? "100%" : "0%",
                background: c.color,
                transition: "width 0.5s ease"
              }} />
            </div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          padding: "48px 32px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          maxWidth: "600px",
          margin: "40px auto"
        }}>
          <div style={{
            width: "54px",
            height: "54px",
            borderRadius: "50%",
            background: "rgba(41,151,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-accent-blue)"
          }}>
            <ShieldAlert size={26} />
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            {t("indexerNoDataTitle")}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
            {t("indexerNoDataDesc")}
          </p>
        </div>
      ) : (
        <>
          {/* Chart Section */}
          <div style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                  Bot Traffic Breakdown (Last 30 Days)
                </h3>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "2px 0 0" }}>
                  Daily trend of search crawls vs human redirects
                </p>
              </div>

            </div>

            <div style={{ width: "100%", height: "220px", marginTop: "10px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorGoogle" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-blue)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-accent-blue)" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorYandex" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-red)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-accent-red)" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorBing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-orange)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-accent-orange)" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorMailru" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-text-secondary)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--color-text-secondary)" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-text-primary)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--color-text-primary)" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorRedirects" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-green)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-accent-green)" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-text-tertiary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={str => {
                      const parts = str.split("-");
                      return parts.length > 2 ? `${parts[2]}.${parts[1]}` : str;
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--color-text-primary)"
                    }}
                  />
                  <Area
                    type="monotone"
                    name="Googlebot"
                    dataKey="google"
                    stroke="var(--color-accent-blue)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorGoogle)"
                  />
                  <Area
                    type="monotone"
                    name="YandexBot"
                    dataKey="yandex"
                    stroke="var(--color-accent-red)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorYandex)"
                  />
                  <Area
                    type="monotone"
                    name="Bingbot"
                    dataKey="bing"
                    stroke="var(--color-accent-orange)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorBing)"
                  />
                  <Area
                    type="monotone"
                    name="MailruBot"
                    dataKey="mailru"
                    stroke="var(--color-text-secondary)"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorMailru)"
                  />
                  <Area
                    type="monotone"
                    name="Other Bots"
                    dataKey="other"
                    stroke="var(--color-text-primary)"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorOther)"
                  />
                  <Area
                    type="monotone"
                    name="Redirects"
                    dataKey="redirects"
                    stroke="var(--color-accent-green)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRedirects)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: isLarge ? "1.2fr 1fr" : "1fr",
            gap: "24px",
            alignItems: "start",
          }}>
            {/* By Domain */}
            <div style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              padding: "20px",
            }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 16px" }}>
                By Domain — Last 30 Days
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px 12px" }}>Domain</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Google</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Total Bots</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Google Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.byDomain.map((row, i) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border-soft)", height: "40px" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {row.domain}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {formatNumber(row.google)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                          {formatNumber(row.totalBots)}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                            <span style={{ fontSize: "11px", width: "30px", textAlign: "right" }}>{row.googleShare}%</span>
                            <div style={{ width: "60px", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${row.googleShare}%`, background: "var(--color-accent-blue)" }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Breakdown */}
            <div style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                  Daily Breakdown — Last 30 Days
                </h3>
                <button
                  onClick={exportDailyToCSV}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.15s"
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = "var(--color-accent-blue)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
                >
                  <Download size={11} />
                  Export CSV
                </button>
              </div>
              <div style={{ overflowX: "auto", maxHeight: "350px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", textAlign: "left", position: "sticky", top: 0, background: "var(--color-card)" }}>
                      <th style={{ padding: "8px 12px 12px" }}>Date</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Google</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right", color: "var(--color-text-tertiary)", fontWeight: 500 }}>304</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Yandex</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right", color: "var(--color-text-tertiary)", fontWeight: 500 }}>304</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Bing</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Mail.ru</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Other</th>
                      <th style={{ padding: "8px 12px 12px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.daily.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-border-soft)", height: "36px" }}>
                        <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                          {row.date}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-accent-blue)", fontWeight: 600 }}>
                          {formatNumber(row.google)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-text-tertiary)" }}>
                          {formatNumber(row.google304)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-accent-red)", fontWeight: 600 }}>
                          {formatNumber(row.yandex)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-text-tertiary)" }}>
                          {formatNumber(row.yandex304)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {formatNumber(row.bing)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {formatNumber(row.mailru || 0)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {formatNumber(row.other)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {formatNumber(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
