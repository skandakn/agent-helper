import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Download, Copy, Check, FileWarning } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { useTranslation } from "../lib/i18n/context";
import JsonBlock, { localizeText } from "./JsonBlock";
import { BarChart, CHART_COLORS } from "./Charts";
import { formatCurrencyINR } from "../lib/stages";

const TAB_KEYS = ["research", "branding", "content", "social_media", "operations", "critique"];

export default function CampaignBuilder() {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const { recent } = useEventStore();
  const queryId = router.query.event_id;

  const fallbackId = useMemo(() => {
    if (queryId) return queryId;
    const ready = recent.find((m) => m.status === "ready" || m.status === "launched");
    return ready?.id || recent[0]?.id;
  }, [queryId, recent]);

  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("branding");

  useEffect(() => {
    if (!fallbackId) return;
    setLoading(true);
    setError(null);
    setPkg(null);
    api
      .getEventOutput(fallbackId)
      .then((response) => {
        // The API wraps the launch package in an { event_id, status, output }
        // envelope — unwrap it so pkg.branding / pkg.research / etc. resolve.
        const output = response?.output || {};
        if (Object.keys(output).length === 0) {
          // Nothing has been generated yet, or the run failed before the
          // orchestrator persisted a final package. Treat this the same as
          // a fetch error so the person sees the "still running" banner
          // instead of a panel full of empty dashes.
          const err = new Error(
            response?.status === "failed" ? "This mission's workflow failed before finishing." : ""
          );
          throw err;
        }
        setPkg(output);
        const firstAvailable = TAB_KEYS.find((key) => output[key]);
        if (firstAvailable) setTab(firstAvailable);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [fallbackId]);

  if (!fallbackId) {
    return (
      <div className="empty-state panel-colorful" style={{ maxWidth: 560 }}>
        <p style={{ marginBottom: 22, fontSize: 18 }}>{t("campaignBuilder.noMission")}</p>
        <Link href="/create-event" className="btn btn-primary">
          {t("common.newLaunch")}
        </Link>
      </div>
    );
  }

  const mission = recent.find((m) => String(m.id) === String(fallbackId));

  function tabLabel(key) {
    if (key === "critique") return t("stages.critic.label");
    return t(`stages.${key}.label`);
  }

  return (
    <div className="stack" style={{ maxWidth: 880, gap: 24 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">{t("dashboard.mission")} #{fallbackId}</div>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>
            {localizeText(mission?.theme || t("campaignBuilder.launchPackage"), lang)}
          </h1>
        </div>
        {pkg && (
          <button className="btn btn-primary btn-sm" onClick={() => downloadJson(pkg, `mission-${fallbackId}-package.json`)}>
            <Download size={16} /> {t("campaignBuilder.exportPackage")}
          </button>
        )}
      </div>

      {loading && <LoadingPanel />}

      {error && (
        <div className="error-banner">
          <FileWarning size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 16 }}>
            {error.message || t("campaignBuilder.loadError")} {t("campaignBuilder.stillRunning")}{" "}
            <Link href={`/agent-monitor?event_id=${fallbackId}`} style={{ textDecoration: "underline", color: "var(--info)" }}>
              {t("campaignBuilder.agentMonitor")}
            </Link>
            .
          </span>
        </div>
      )}

      {pkg && (
        <>
          <div className="tabs">
            {TAB_KEYS.filter((key) => pkg[key]).map((key) => (
              <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
                {tabLabel(key)}
              </button>
            ))}
          </div>

          <div className="panel panel-pad panel-colorful">
            <div className="row-between" style={{ marginBottom: 18 }}>
              <span className="eyebrow">{tabLabel(tab)}</span>
              <CopyButton value={pkg[tab]} t={t} lang={lang} />
            </div>

            <ActionBrief tabKey={tab} data={pkg[tab]} pkg={pkg} lang={lang} />
            <div className="divider" />

            {tab === "critique" ? (
              <CritiqueView data={pkg.critique} t={t} lang={lang} />
            ) : (
              <SectionView tabKey={tab} data={pkg[tab]} t={t} lang={lang} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SectionView({ tabKey, data, t, lang }) {
  const budget = data?.budget || data?.budget_breakdown;
  if (tabKey === "operations" && budget) {
    const { budget: _legacyBudget, budget_breakdown: _budgetBreakdown, ...rest } = data;
    return (
      <div className="stack">
        <BudgetChart budget={budget} t={t} lang={lang} />
        <div className="divider" />
        <JsonBlock data={rest} />
      </div>
    );
  }
  return <JsonBlock data={data} />;
}

function BudgetChart({ budget, t, lang }) {
  const entries = Array.isArray(budget)
    ? budget
        .map((item) => [item.category || item.name || "Budget", Number(item.amount)])
        .filter(([, v]) => Number.isFinite(v))
    : Object.entries(budget).filter(([, v]) => typeof v === "number");
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const barData = entries.map(([k, v], i) => ({
    label: localizeText(k.replace(/_/g, " "), lang),
    short: k.slice(0, 3).toUpperCase(),
    value: Math.round((v / max) * 100),
    color: CHART_COLORS[i % CHART_COLORS.length],
    raw: v,
  }));

  return (
    <div>
      <div className="label">{t("campaignBuilder.budgetBreakdown")}</div>
      <BarChart data={barData} height={200} />
      <div className="stack" style={{ gap: 10, marginTop: 16 }}>
        {entries.map(([k, v], i) => (
          <div key={k}>
            <div className="row-between" style={{ fontSize: 15, marginBottom: 6 }}>
              <span style={{ color: "var(--text-muted)" }}>{localizeText(k.replace(/_/g, " "), lang)}</span>
              <span className="mono" style={{ fontSize: 15 }}>{formatCurrencyINR(v)}</span>
            </div>
            <div className="manifest-track" style={{ marginTop: 0 }}>
              <div
                className="manifest-fill"
                style={{
                  width: `${(v / max) * 100}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[(i + 1) % CHART_COLORS.length]})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CritiqueView({ data, t, lang }) {
  if (!data) return <span style={{ color: "var(--text-dim)", fontSize: 16 }}>{t("campaignBuilder.noCritique")}</span>;
  const { scores, overall, issues, suggestions, approved, ...rest } = data;

  const scoreBarData =
    scores && typeof scores === "object"
      ? Object.entries(scores).map(([k, v], i) => ({
          label: k.replace(/_/g, " "),
          short: k.slice(0, 2).toUpperCase(),
          value: Math.round(Number(v) * 10),
          color: CHART_COLORS[i % CHART_COLORS.length],
        }))
      : [];

  return (
    <div className="stack" style={{ gap: 20 }}>
      {scoreBarData.length > 0 && (
        <div>
          <div className="label">{t("campaignBuilder.scoreChart")}</div>
          <BarChart data={scoreBarData} height={220} />
        </div>
      )}

      {scores && typeof scores === "object" && (
        <div className="grid-2">
          {Object.entries(scores).map(([k, v], i) => (
            <ScoreBar
              key={k}
              label={localizeText(k.replace(/_/g, " "), lang)}
              value={Number(v)}
              color={CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </div>
      )}

      {overall !== undefined && (
        <div className="row-between panel panel-pad panel-colorful" style={{ borderColor: approved ? "rgba(61,220,151,0.4)" : "rgba(242,201,76,0.4)" }}>
          <span style={{ fontWeight: 600, fontSize: 17 }}>{t("campaignBuilder.overallScore")}</span>
          <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: approved ? "var(--ok)" : "var(--warn)" }}>
            {overall}/10
          </span>
        </div>
      )}

      {approved !== undefined && (
        <span className={`badge ${approved ? "ok" : "warn"}`} style={{ width: "fit-content", fontSize: 13 }}>
          {approved ? t("campaignBuilder.approvedForLaunch") : t("campaignBuilder.needsAnotherPass")}
        </span>
      )}

      {issues && (
        <div>
          <div className="label">{t("campaignBuilder.issuesFlagged")}</div>
          <JsonBlock data={issues} depth={1} />
        </div>
      )}

      {suggestions && (
        <div>
          <div className="label">{t("campaignBuilder.suggestedFixes")}</div>
          <JsonBlock data={suggestions} depth={1} />
        </div>
      )}

      {Object.keys(rest).length > 0 && <JsonBlock data={rest} />}
    </div>
  );
}

function ScoreBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  const barColor = value >= 7 ? "var(--ok)" : value >= 4 ? "var(--warn)" : "var(--error)";
  return (
    <div>
      <div className="row-between" style={{ fontSize: 15, marginBottom: 6, textTransform: "capitalize" }}>
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="mono" style={{ fontSize: 15 }}>{value}/10</span>
      </div>
      <div className="manifest-track" style={{ marginTop: 0 }}>
        <div className="manifest-fill" style={{ width: `${pct}%`, background: color || barColor }} />
      </div>
    </div>
  );
}

function CopyButton({ value, t, lang }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(localizeForCopy(value, lang), null, 2));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("campaignBuilder.copied") : t("campaignBuilder.copyJson")}
    </button>
  );
}

function ActionBrief({ tabKey, data, pkg, lang }) {
  const brief = buildActionBrief(tabKey, data, pkg, lang);
  if (!brief) return null;
  return (
    <div
      style={{
        borderLeft: "3px solid var(--accent)",
        paddingLeft: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="eyebrow">{brief.eyebrow}</div>
      <h3 style={{ fontSize: 20 }}>{brief.title}</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 15 }}>{brief.body}</p>
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {brief.bullets.map((item) => (
          <li key={item} style={{ color: "var(--text)", fontSize: 14.5, lineHeight: 1.55 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildActionBrief(tabKey, data, pkg, lang) {
  const theme = localizeText(pkg?.branding?.selected_name || pkg?.research?.recommended_positioning || "this mission", lang);
  const english = ACTION_BRIEFS.en;
  const hasNativeBrief = Boolean(ACTION_BRIEFS[lang]);
  const copy = hasNativeBrief ? ACTION_BRIEFS[lang] : english;
  const brief = (copy[tabKey] || english[tabKey])?.({ data, pkg, theme });
  return hasNativeBrief || lang === "en" ? brief : localizeBrief(brief, lang);
}

const ACTION_BRIEFS = {
  en: {
    research: ({ theme }) => ({
      eyebrow: "Execution brief",
      title: "Use this research to sharpen positioning",
      body: `${theme} should be presented as a practical launch program, not only a generic hackathon. Convert the research into clear tracks, sponsor value, and measurable participant outcomes.`,
      bullets: [
        "Turn every risk into a visible FAQ answer or organizer checklist item.",
        "Use trends as social proof in the landing page and sponsor deck.",
        "Pick two sponsor targets and create specific outreach angles before launch.",
      ],
    }),
    branding: ({ theme }) => ({
      eyebrow: "Brand brief",
      title: "Make the campaign instantly recognizable",
      body: `${theme} needs a consistent name, tone, palette, and visual system so judges and participants understand the offer quickly.`,
      bullets: [
        "Use the selected name everywhere: hero, emails, social posts, and submission docs.",
        "Keep colors tied to actions: apply, sponsor, mentor, submit, and demo.",
        "Treat naming guardrails as pre-launch quality checks.",
      ],
    }),
    content: ({ theme }) => ({
      eyebrow: "Content brief",
      title: "Publish copy that answers doubts early",
      body: `${theme} now has landing sections, email drafts, pitch outline, FAQ, and rubric material. This should reduce confusion before teams register.`,
      bullets: [
        "Add the registration link and sponsor contact before sharing.",
        "Use the FAQ and rubric in public docs so teams know what success means.",
        "Reuse the email drafts for participants, sponsors, judges, and partners.",
      ],
    }),
    social_media: ({ theme }) => ({
      eyebrow: "Campaign brief",
      title: "Run a steady multi-channel launch cadence",
      body: `${theme} should rotate between credibility, applicant motivation, sponsor value, and deadline urgency instead of repeating the same announcement.`,
      bullets: [
        "Schedule posts by week and pin one clear action to each post.",
        "Use LinkedIn for credibility, X for urgency, and Instagram for visual proof.",
        "Refresh creative with participant stories, mentor quotes, and demo milestones.",
      ],
    }),
    operations: ({ theme }) => ({
      eyebrow: "Operations brief",
      title: "Convert the package into an owner map",
      body: `${theme} has timeline, staffing, budget, logistics, and risks. The next step is assigning owners and turning every deliverable into a checklist.`,
      bullets: [
        "Confirm sponsor, mentor, judge, and venue owners separately.",
        "Use the budget chart to explain tradeoffs to organizers and sponsors.",
        "Run a dry run for submissions, judging, streaming, and emergency comms.",
      ],
    }),
    critique: ({ theme }) => ({
      eyebrow: "Quality brief",
      title: "Use the critic output as the final launch gate",
      body: `${theme} should only be submitted after the score, issues, and suggestions have been reviewed by a human organizer.`,
      bullets: [
        "Fix every flagged issue before exporting the final package.",
        "Use suggestions as the last checklist for pitch, copy, and operations.",
        "Re-check dates, sponsor claims, regional claims, and budget assumptions.",
      ],
    }),
  },
  hi: {
    research: ({ theme }) => ({
      eyebrow: "कार्रवाई ब्रीफ",
      title: "स्थिति को तेज करने के लिए शोध का उपयोग करें",
      body: `${theme} को सामान्य हैकाथॉन नहीं, बल्कि व्यावहारिक लॉन्च प्रोग्राम के रूप में दिखाएं।`,
      bullets: ["हर जोखिम को FAQ या आयोजक चेकलिस्ट में बदलें।", "रुझानों को लैंडिंग पेज और प्रायोजक डेक में प्रमाण की तरह इस्तेमाल करें।", "लॉन्च से पहले दो प्रायोजकों के लिए अलग पिच बनाएं।"],
    }),
    branding: ({ theme }) => ({
      eyebrow: "ब्रांड ब्रीफ",
      title: "अभियान को तुरंत पहचानने योग्य बनाएं",
      body: `${theme} के लिए नाम, टोन, रंग और दृश्य भाषा लगातार रखें।`,
      bullets: ["चुने हुए नाम को हर जगह इस्तेमाल करें।", "रंगों को आवेदन, प्रायोजन और डेमो जैसे कार्यों से जोड़ें।", "नामकरण नियमों को लॉन्च से पहले गुणवत्ता जांच बनाएं।"],
    }),
    content: ({ theme }) => ({
      eyebrow: "कंटेंट ब्रीफ",
      title: "ऐसी कॉपी प्रकाशित करें जो संदेह पहले ही दूर करे",
      body: `${theme} के पास अब लैंडिंग सेक्शन, ईमेल, पिच, FAQ और रूब्रिक सामग्री है।`,
      bullets: ["साझा करने से पहले पंजीकरण लिंक जोड़ें।", "FAQ और रूब्रिक को सार्वजनिक दस्तावेज़ों में रखें।", "ईमेल ड्राफ्ट को प्रतिभागियों, प्रायोजकों और जजों के लिए उपयोग करें।"],
    }),
    social_media: ({ theme }) => ({
      eyebrow: "अभियान ब्रीफ",
      title: "स्थिर मल्टी-चैनल लॉन्च कैडेंस चलाएं",
      body: `${theme} में विश्वसनीयता, आवेदन प्रेरणा, प्रायोजक मूल्य और अंतिम तिथि की तात्कालिकता को घुमाते रहें।`,
      bullets: ["पोस्ट को सप्ताह के हिसाब से शेड्यूल करें।", "LinkedIn पर विश्वसनीयता और X पर तात्कालिकता दिखाएं।", "मेंटर quotes और डेमो milestones से क्रिएटिव ताज़ा रखें।"],
    }),
    operations: ({ theme }) => ({
      eyebrow: "ऑप्स ब्रीफ",
      title: "पैकेज को मालिकाना चेकलिस्ट में बदलें",
      body: `${theme} में टाइमलाइन, टीमिंग, बजट, लॉजिस्टिक्स और जोखिम योजना है।`,
      bullets: ["प्रायोजक, मेंटर, जज और venue owners अलग-अलग तय करें।", "बजट चार्ट से tradeoffs समझाएं।", "सबमिशन, judging और streaming के लिए dry run करें।"],
    }),
    critique: ({ theme }) => ({
      eyebrow: "गुणवत्ता ब्रीफ",
      title: "क्रिटिक आउटपुट को अंतिम लॉन्च गेट बनाएं",
      body: `${theme} को submit करने से पहले score, issues और suggestions की human review करें।`,
      bullets: ["हर flagged issue ठीक करें।", "suggestions को अंतिम checklist बनाएं।", "dates, sponsor claims और budget assumptions दोबारा जांचें।"],
    }),
  },
  kn: {
    research: ({ theme }) => ({
      eyebrow: "ಕಾರ್ಯಾಚರಣೆ ಬ್ರೀಫ್",
      title: "ಸ್ಥಾಪನೆಯನ್ನು ತೀಕ್ಷ್ಣಗೊಳಿಸಲು ಸಂಶೋಧನೆಯನ್ನು ಬಳಸಿ",
      body: `${theme} ಅನ್ನು ಸಾಮಾನ್ಯ ಹ್ಯಾಕಥಾನ್ ಆಗಿ ಅಲ್ಲ, ಪ್ರಾಯೋಗಿಕ ಲಾಂಚ್ ಕಾರ್ಯಕ್ರಮವಾಗಿ ತೋರಿಸಿ.`,
      bullets: ["ಪ್ರತಿ ಅಪಾಯವನ್ನು FAQ ಅಥವಾ ಆಯೋಜಕರ ಚೆಕ್‌ಲಿಸ್ಟ್ ಆಗಿ ಬದಲಿಸಿ.", "ಪ್ರವೃತ್ತಿಗಳನ್ನು ಲ್ಯಾಂಡಿಂಗ್ ಪುಟ ಮತ್ತು ಪ್ರಾಯೋಜಕ ಡೆಕ್‌ನಲ್ಲಿ ಸಾಕ್ಷ್ಯವಾಗಿ ಬಳಸಿ.", "ಲಾಂಚ್‌ಗೆ ಮೊದಲು ಎರಡು ಪ್ರಾಯೋಜಕರಿಗೆ ನಿರ್ದಿಷ್ಟ ಪಿಚ್ ರೂಪಿಸಿ."],
    }),
    branding: ({ theme }) => ({
      eyebrow: "ಬ್ರಾಂಡ್ ಬ್ರೀಫ್",
      title: "ಅಭಿಯಾನವನ್ನು ತಕ್ಷಣ ಗುರುತಿಸಬಹುದಾಗಿಸಿ",
      body: `${theme}ಗಾಗಿ ಹೆಸರು, ಧ್ವನಿ, ಬಣ್ಣಗಳು ಮತ್ತು ದೃಶ್ಯ ವ್ಯವಸ್ಥೆ ಒಂದೇ ರೀತಿಯಾಗಿ ಕಾಣಬೇಕು.`,
      bullets: ["ಆಯ್ಕೆ ಮಾಡಿದ ಹೆಸರನ್ನು hero, emails, social posts ಮತ್ತು docs ಎಲ್ಲೆಡೆ ಬಳಸಿ.", "ಬಣ್ಣಗಳನ್ನು apply, sponsor, mentor, submit ಮತ್ತು demo actionಗಳಿಗೆ ಜೋಡಿಸಿ.", "ಹೆಸರಿಡುವ ಮಾರ್ಗಸೂಚಿಗಳನ್ನು pre-launch quality check ಆಗಿ ಬಳಸಿ."],
    }),
    content: ({ theme }) => ({
      eyebrow: "ವಿಷಯ ಬ್ರೀಫ್",
      title: "ಸಂದೇಹಗಳನ್ನು ಮುಂಚಿತವಾಗಿ ಪರಿಹರಿಸುವ ಕಾಪಿ ಪ್ರಕಟಿಸಿ",
      body: `${theme}ಗೆ landing sections, email drafts, pitch outline, FAQ ಮತ್ತು rubric ವಸ್ತು ಸಿದ್ಧವಾಗಿದೆ.`,
      bullets: ["ಹಂಚುವ ಮೊದಲು registration link ಮತ್ತು sponsor contact ಸೇರಿಸಿ.", "FAQ ಮತ್ತು rubric ಅನ್ನು ಸಾರ್ವಜನಿಕ docsನಲ್ಲಿ ಬಳಸಿ.", "emails ಅನ್ನು participants, sponsors, judges ಮತ್ತು partnersಗೆ ಮರುಬಳಸಿ."],
    }),
    social_media: ({ theme }) => ({
      eyebrow: "ಅಭಿಯಾನ ಬ್ರೀಫ್",
      title: "ನಿರಂತರ multi-channel launch cadence ನಡೆಸಿ",
      body: `${theme} credibility, applicant motivation, sponsor value ಮತ್ತು deadline urgency ನಡುವೆ ತಿರುಗಬೇಕು.`,
      bullets: ["ಪ್ರತಿ ಪೋಸ್ಟ್‌ಗೆ ಒಂದು ಸ್ಪಷ್ಟ action ಸೇರಿಸಿ.", "LinkedInನಲ್ಲಿ credibility, Xನಲ್ಲಿ urgency, Instagramನಲ್ಲಿ visual proof ಬಳಸಿ.", "participant stories, mentor quotes ಮತ್ತು demo milestones ಮೂಲಕ creative refresh ಮಾಡಿ."],
    }),
    operations: ({ theme }) => ({
      eyebrow: "ಆಪ್ಸ್ ಬ್ರೀಫ್",
      title: "ಪ್ಯಾಕೇಜ್ ಅನ್ನು owner checklist ಆಗಿ ಬದಲಿಸಿ",
      body: `${theme}ಗೆ timeline, staffing, budget, logistics ಮತ್ತು risks ಸಿದ್ಧವಾಗಿದೆ.`,
      bullets: ["Sponsor, mentor, judge ಮತ್ತು venue owners ಅನ್ನು ಪ್ರತ್ಯೇಕವಾಗಿ ದೃಢಪಡಿಸಿ.", "Budget chart ಮೂಲಕ tradeoffs ವಿವರಿಸಿ.", "Submissions, judging, streaming ಮತ್ತು emergency commsಗೆ dry run ಮಾಡಿ."],
    }),
    critique: ({ theme }) => ({
      eyebrow: "ಗುಣಮಟ್ಟ ಬ್ರೀಫ್",
      title: "Critic output ಅನ್ನು ಅಂತಿಮ launch gate ಆಗಿ ಬಳಸಿ",
      body: `${theme} submit ಮಾಡುವ ಮೊದಲು score, issues ಮತ್ತು suggestions ಮಾನವ ಪರಿಶೀಲನೆಗೊಳಪಡಲಿ.`,
      bullets: ["ಪ್ರತಿ flagged issue ಸರಿಪಡಿಸಿ.", "suggestions ಅನ್ನು ಅಂತಿಮ checklist ಆಗಿ ಬಳಸಿ.", "dates, sponsor claims, regional claims ಮತ್ತು budget assumptions ಮತ್ತೊಮ್ಮೆ ಪರಿಶೀಲಿಸಿ."],
    }),
  },
};

function localizeBrief(brief, lang) {
  if (!brief) return brief;
  return {
    eyebrow: localizeText(brief.eyebrow, lang),
    title: localizeText(brief.title, lang),
    body: localizeText(brief.body, lang),
    bullets: brief.bullets.map((item) => localizeText(item, lang)),
  };
}

function localizeForCopy(value, lang) {
  if (Array.isArray(value)) return value.map((item) => localizeForCopy(item, lang));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [localizeText(key.replace(/_/g, " "), lang), localizeForCopy(item, lang)]));
  }
  if (typeof value === "string" || typeof value === "number") return localizeText(value, lang);
  return value;
}

function LoadingPanel() {
  return (
    <div className="panel panel-pad panel-colorful" style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: "30%", background: "var(--border)", borderRadius: 4, marginBottom: 16 }} />
      <div style={{ height: 12, width: "90%", background: "var(--border)", borderRadius: 4, marginBottom: 10 }} />
      <div style={{ height: 12, width: "75%", background: "var(--border)", borderRadius: 4 }} />
    </div>
  );
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
