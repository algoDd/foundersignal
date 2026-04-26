import {
  Activity,
  BarChart3,
  Globe,
  PieChart,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

type StageStatus = "pending" | "running" | "completed" | "error";

interface SearchEntry {
  query?: string;
  results_count?: number;
  timestamp?: string;
}

interface StageDashboardProps {
  activeTab: string;
  activeTokens: number;
  activeSearches: number;
  markdown: string;
  paragraph: string;
  searches: SearchEntry[];
  status: StageStatus | string;
}

interface HighlightItem {
  label: string;
  text: string;
}

function extractBulletLines(markdown: string, limit = 4) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function extractMarkdownSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escapedHeading}[\\s\\S]*?(?=\\n## |$)`, "i"));
  if (!match) return "";
  return match[0].replace(new RegExp(`^## ${escapedHeading}\\n?`, "i"), "").trim();
}

function getStageHighlights(stageId: string, markdown: string) {
  const sectionMap: Record<string, string[]> = {
    refine: ["Problem", "Solution", "Why It Wins", "Best Early User"],
    market: ["Market Snapshot", "Key Data Points & Sources", "Opportunities", "Risks"],
    competitors: ["Competitive Landscape", "Where They Win", "Where They Are Weak", "Your Wedge"],
    ux: ["The Path to Value", "Moments That Matter", "Friction To Remove", "Key Feature Roadmap"],
    ui: ["The Hero Section", "Core Screens", "Interaction Style", "Design Direction"],
    visibility: ["Visibility Snapshot", "What To Improve", "Content Wedges", "Fast Wins"],
    scoring: ["The Verdict: [GO / PIVOT / NO-GO]", "Why", "Key Risks", "Next Steps"],
  };

  const labels = sectionMap[stageId] || [];
  const sectionHighlights = labels
    .map((label) => {
      const body = extractMarkdownSection(markdown, label);
      if (!body) return null;
      return {
        label,
        text:
          body.split("\n").find((line) => line.trim() && !line.trim().startsWith("- "))?.trim() ||
          body.split("\n")[0]?.trim() ||
          "",
      };
    })
    .filter(Boolean) as HighlightItem[];

  const bulletHighlights = extractBulletLines(markdown, 6).map((line) => ({
    label: "Takeaway",
    text: line,
  }));

  return (sectionHighlights.length ? sectionHighlights : bulletHighlights).slice(0, 4);
}

function getSectionBullets(markdown: string, heading: string, limit = 5) {
  const section = extractMarkdownSection(markdown, heading);
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function parseMetricValue(text: string) {
  const percent = text.match(/(\d+(?:\.\d+)?)\s?%/);
  if (percent) return Math.min(Number(percent[1]), 100);

  const money = text.match(/\$?\s?(\d+(?:\.\d+)?)\s?B/i);
  if (money) return Math.min(Number(money[1]) * 5, 100);

  const integer = text.match(/\b(\d{1,3})\b/);
  if (integer) return Math.min(Number(integer[1]), 100);

  return 50;
}

function statusTone(status: string) {
  if (status === "completed") return { label: "Ready", className: "success" };
  if (status === "running") return { label: "Live", className: "info" };
  if (status === "error") return { label: "Blocked", className: "danger" };
  return { label: "Queued", className: "muted" };
}

function DonutChart({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = pct * circ;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div className="donut-ring">
        <svg className="donut-svg" width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="45"
            cy="45"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="donut-center">
          {value > 999 ? `${(value / 1000).toFixed(1)}k` : value}
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="viz-card">
      <div className="viz-card-header">
        <div className="viz-card-title">Signal distribution</div>
        <BarChart3 size={14} />
      </div>
      <div className="viz-stack">
        {items.map((item) => (
          <div key={item.label} className="viz-bar-row">
            <div className="viz-bar-label">{item.label}</div>
            <div className="viz-bar-track">
              <div
                className={`viz-bar-fill ${item.tone || ""}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
            <div className="viz-bar-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieLegend({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;
  const segments = items.map((item) => {
    const size = (item.value / total) * 100;
    const segment = `${item.color} ${offset}% ${offset + size}%`;
    offset += size;
    return segment;
  });

  return (
    <div className="viz-card">
      <div className="viz-card-header">
        <div className="viz-card-title">{title}</div>
        <PieChart size={14} />
      </div>
      <div className="pie-legend-wrap">
        <div className="pie-chart" style={{ background: `conic-gradient(${segments.join(", ")})` }}>
          <div className="pie-chart-hole">{total}</div>
        </div>
        <div className="pie-legend">
          {items.map((item) => (
            <div key={item.label} className="pie-legend-row">
              <span className="pie-dot" style={{ background: item.color }} />
              <span className="pie-legend-label">{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeatmapGrid({
  title,
  items,
}: {
  title: string;
  items: { label: string; score: number }[];
}) {
  return (
    <div className="viz-card">
      <div className="viz-card-header">
        <div className="viz-card-title">{title}</div>
        <Activity size={14} />
      </div>
      <div className="heatmap-grid">
        {items.map((item) => (
          <div key={item.label} className="heatmap-cell">
            <div className="heatmap-cell-head">
              <span>{item.label}</span>
              <strong>{item.score}</strong>
            </div>
            <div className="heatmap-track">
              <div className="heatmap-fill" style={{ width: `${item.score}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyPresence({ companies }: { companies: { name: string; badge: string; color: string }[] }) {
  return (
    <div className="viz-card">
      <div className="viz-card-header">
        <div className="viz-card-title">AI surface coverage</div>
        <Globe size={14} />
      </div>
      <div className="company-grid">
        {companies.map((company) => (
          <div key={company.name} className="company-chip">
            <span className="company-badge" style={{ background: company.color }}>
              {company.badge}
            </span>
            <span className="company-name">{company.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchList({ searches }: { searches: SearchEntry[] }) {
  return (
    <div className="viz-card">
      <div className="viz-card-header">
        <div className="viz-card-title">Research activity</div>
        <Search size={14} />
      </div>
      <div className="viz-stack">
        {searches.slice(0, 4).map((entry) => (
          <div key={`${entry.query}-${entry.timestamp || ""}`} className="search-row">
            <div className="search-query">{entry.query}</div>
            <div className="search-meta">{entry.results_count || 0} results</div>
          </div>
        ))}
        {searches.length === 0 ? (
          <div className="empty-copy">No web searches were needed for this step.</div>
        ) : null}
      </div>
    </div>
  );
}

function genericCompanies(markdown: string) {
  const brandMap = [
    { name: "OpenAI", badge: "OA", color: "#101828" },
    { name: "Google", badge: "G", color: "#4285F4" },
    { name: "Gemini", badge: "Ge", color: "#6c63ff" },
    { name: "Perplexity", badge: "P", color: "#0ea5a4" },
    { name: "Anthropic", badge: "An", color: "#d97706" },
    { name: "Microsoft", badge: "MS", color: "#2563eb" },
    { name: "Meta", badge: "M", color: "#0f172a" },
    { name: "Apple", badge: "A", color: "#64748b" },
    { name: "Notion", badge: "N", color: "#111827" },
    { name: "Slack", badge: "S", color: "#7c3aed" },
  ];

  return brandMap.filter((brand) => new RegExp(`\\b${brand.name}\\b`, "i").test(markdown)).slice(0, 6);
}

function buildStageVisuals(activeTab: string, markdown: string, searches: SearchEntry[]) {
  const opportunities = getSectionBullets(markdown, "Opportunities", 5).length;
  const risks = getSectionBullets(markdown, "Risks", 5).length || getSectionBullets(markdown, "Key Risks", 5).length;
  const wins = getSectionBullets(markdown, "Why It Wins", 5).length;
  const assumptions = getSectionBullets(markdown, "Assumptions To Prove", 5).length;
  const trends = getSectionBullets(markdown, "Key Trends", 5).length;
  const recommendations = getSectionBullets(markdown, "Recommendations", 5).length + getSectionBullets(markdown, "What To Improve", 5).length;
  const nextSteps = getSectionBullets(markdown, "Next Steps", 5).length;

  const keyDataSection = extractMarkdownSection(markdown, "Key Data Points & Sources");
  const metricLines = keyDataSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("|"))
    .slice(0, 4);

  if (activeTab === "market") {
    return (
      <>
        <div className="stage-viz-grid stage-viz-grid-2">
          <PieLegend
            title="Market mix"
            items={[
              { label: "Opportunities", value: opportunities || 1, color: "#16a34a" },
              { label: "Risks", value: risks || 1, color: "#ef4444" },
              { label: "Trends", value: trends || 1, color: "#6366f1" },
            ]}
          />
          <MiniBarChart
            items={metricLines.length
              ? metricLines.map((line, index) => ({
                  label: line.split(":")[0]?.slice(0, 18) || `Metric ${index + 1}`,
                  value: parseMetricValue(line),
                  tone: index === 0 ? "success" : index === 1 ? "info" : "",
                }))
              : [
                  { label: "Opportunities", value: opportunities || 1, tone: "success" },
                  { label: "Risks", value: risks || 1, tone: "danger" },
                  { label: "Searches", value: searches.length || 1, tone: "info" },
                ]}
          />
        </div>
        <HeatmapGrid
          title="Opportunity pressure"
          items={[
            { label: "Demand", score: Math.min(35 + opportunities * 12, 100) },
            { label: "Timing", score: Math.min(30 + trends * 14, 100) },
            { label: "Risk load", score: Math.min(20 + risks * 13, 100) },
            { label: "Research depth", score: Math.min(25 + searches.length * 15, 100) },
          ]}
        />
      </>
    );
  }

  if (activeTab === "competitors") {
    const weak = getSectionBullets(markdown, "Where They Are Weak", 5).length;
    const wedge = getSectionBullets(markdown, "Your Wedge", 5).length;
    return (
      <>
        <div className="stage-viz-grid stage-viz-grid-2">
          <MiniBarChart
            items={[
              { label: "Incumbent strengths", value: Math.max(getSectionBullets(markdown, "Where They Win", 5).length, 1), tone: "info" },
              { label: "Incumbent gaps", value: Math.max(weak, 1), tone: "danger" },
              { label: "Your wedge", value: Math.max(wedge, 1), tone: "success" },
            ]}
          />
          <HeatmapGrid
            title="Competitive heat"
            items={[
              { label: "Crowding", score: Math.min(25 + searches.length * 16, 100) },
              { label: "Differentiation", score: Math.min(30 + wedge * 15, 100) },
              { label: "Gap depth", score: Math.min(20 + weak * 18, 100) },
              { label: "Defensibility", score: Math.min(25 + wins * 14, 100) },
            ]}
          />
        </div>
      </>
    );
  }

  if (activeTab === "visibility") {
    const companies = genericCompanies(markdown);
    return (
      <>
        <div className="stage-viz-grid stage-viz-grid-2">
          <PieLegend
            title="Visibility mix"
            items={[
              { label: "Mentions to improve", value: recommendations || 1, color: "#2563eb" },
              { label: "Fast wins", value: getSectionBullets(markdown, "Fast Wins", 5).length || 1, color: "#16a34a" },
              { label: "Content wedges", value: getSectionBullets(markdown, "Content Wedges", 5).length || 1, color: "#a855f7" },
            ]}
          />
          <CompanyPresence companies={companies.length ? companies : [{ name: "AI platforms", badge: "AI", color: "#6c63ff" }]} />
        </div>
        <MiniBarChart
          items={[
            { label: "Search presence", value: Math.min(20 + searches.length * 18, 100), tone: "info" },
            { label: "Optimization tasks", value: Math.min(20 + recommendations * 16, 100), tone: "success" },
            { label: "Platform spread", value: Math.min(15 + companies.length * 16, 100), tone: "" },
          ]}
        />
      </>
    );
  }

  if (activeTab === "scoring") {
    const verdictText = extractMarkdownSection(markdown, "The Verdict: [GO / PIVOT / NO-GO]") || markdown;
    const verdictTone = /no-go/i.test(verdictText) ? 1 : /pivot/i.test(verdictText) ? 2 : 3;
    return (
      <>
        <div className="stage-viz-grid stage-viz-grid-2">
          <PieLegend
            title="Decision balance"
            items={[
              { label: "Strengths", value: Math.max(wins, 1), color: "#16a34a" },
              { label: "Risks", value: Math.max(risks, 1), color: "#ef4444" },
              { label: "Next steps", value: Math.max(nextSteps, 1), color: "#6366f1" },
            ]}
          />
          <HeatmapGrid
            title="Decision heatmap"
            items={[
              { label: "Readiness", score: 35 + verdictTone * 18 },
              { label: "Risk load", score: Math.min(25 + risks * 14, 100) },
              { label: "Clarity", score: Math.min(25 + nextSteps * 16, 100) },
              { label: "Momentum", score: Math.min(30 + wins * 15, 100) },
            ]}
          />
        </div>
      </>
    );
  }

  if (activeTab === "ux") {
    const flowSteps = getSectionBullets(markdown, "The Path to Value", 5).length || 4;
    return (
      <>
        <MiniBarChart
          items={[
            { label: "Flow clarity", value: Math.min(35 + flowSteps * 12, 100), tone: "success" },
            { label: "Friction load", value: Math.min(25 + getSectionBullets(markdown, "Friction To Remove", 5).length * 14, 100), tone: "danger" },
            { label: "Roadmap depth", value: Math.min(25 + getSectionBullets(markdown, "Key Feature Roadmap", 5).length * 13, 100), tone: "info" },
          ]}
        />
      </>
    );
  }

  if (activeTab === "ui") {
    return (
      <>
        <HeatmapGrid
          title="Interface signal map"
          items={[
            { label: "Hero clarity", score: Math.min(35 + extractMarkdownSection(markdown, "The Hero Section").length / 8, 100) },
            { label: "Screen depth", score: Math.min(25 + extractMarkdownSection(markdown, "Core Screens").length / 10, 100) },
            { label: "Style definition", score: Math.min(30 + extractMarkdownSection(markdown, "Design Direction").length / 10, 100) },
            { label: "Interaction richness", score: Math.min(20 + extractMarkdownSection(markdown, "Interaction Style").length / 10, 100) },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <div className="stage-viz-grid stage-viz-grid-2">
        <PieLegend
          title="Signal mix"
          items={[
            { label: "Wins", value: Math.max(wins, 1), color: "#16a34a" },
            { label: "Assumptions", value: Math.max(assumptions, 1), color: "#f59e0b" },
            { label: "Risks", value: Math.max(risks, 1), color: "#ef4444" },
          ]}
        />
        <MiniBarChart
          items={[
            { label: "Clarity", value: Math.min(30 + getStageHighlights(activeTab, markdown).length * 16, 100), tone: "success" },
            { label: "Specificity", value: Math.min(25 + markdown.length / 70, 100), tone: "info" },
            { label: "Open questions", value: Math.min(15 + assumptions * 15, 100), tone: "danger" },
          ]}
        />
      </div>
    </>
  );
}

export default function StageDashboard({
  activeTab,
  activeTokens,
  activeSearches,
  markdown,
  paragraph,
  searches,
  status,
}: StageDashboardProps) {
  const highlights = getStageHighlights(activeTab, markdown);
  const bullets = extractBulletLines(markdown, 4);
  const tone = statusTone(status);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }}>
      <div className="card" style={{ gap: 16 }}>
        <DonutChart value={activeTokens} max={Math.max(activeTokens, 1000)} label="tokens" />
        <DonutChart value={activeSearches} max={Math.max(activeSearches, 4)} label="searches" />
        <div className="stat-panel">
          <div className="stat-panel-label">Status</div>
          <div className="stat-panel-value" style={{ fontSize: "1.1rem" }}>
            {status}
          </div>
          <div className={`stage-status-pill ${tone.className}`}>{tone.label}</div>
        </div>
        <div className="stat-panel">
          <div className="stat-panel-label">Stage Lens</div>
          <div className="stat-panel-value" style={{ fontSize: "1.02rem" }}>
            TL;DR
          </div>
          <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: "0.76rem", lineHeight: 1.5 }}>
            Focus on the most decision-useful points from this stage.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <div className="stage-tldr-grid">
          {highlights.length ? (
            highlights.map((item) => (
              <div key={`${item.label}-${item.text}`} className="stage-tldr-card">
                <div className="stage-tldr-label">{item.label}</div>
                <div className="stage-tldr-text">{item.text}</div>
              </div>
            ))
          ) : (
            <div className="stage-tldr-card">
              <div className="stage-tldr-label">Stage summary</div>
              <div className="stage-tldr-text">No concise highlights yet. Run or refine this stage to populate the TL;DR view.</div>
            </div>
          )}
        </div>

        {buildStageVisuals(activeTab, markdown, searches)}

        <div className="stage-viz-grid stage-viz-grid-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Decision signals</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {(bullets.length ? bullets : ["No summary bullets yet."]).map((item) => (
                <div key={item} className="alert-item">
                  <div className="alert-dot info" />
                  <div className="alert-text">{item}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Bottom line</div>
            </div>
            <div className="markdown-content">
              <ReactMarkdown>{paragraph || "No executive summary available yet."}</ReactMarkdown>
            </div>
          </div>
        </div>

        <SearchList searches={searches} />
      </div>
    </div>
  );
}
