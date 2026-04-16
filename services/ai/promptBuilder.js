function inferDepartment(userMessage, ticket) {
  const txt = String(userMessage || "").toLowerCase();
  const hasCompany = !!(ticket?.contactInfo?.isCompany);
  if (/(pris|offert|rabatt|kostnad|faktur|betal|plan|avtal)/i.test(txt)) return "sälj";
  if (/(bugg|fel|fungerar inte|support|hjälp|problem|crash|konto)/i.test(txt)) return "support";
  if (/(api|server|integration|deploy|docker|it|nätverk|säkerhet|oauth|webhook)/i.test(txt)) return "it";
  if (hasCompany && /(demo|avtal|offert|pris)/i.test(txt)) return "sälj";
  return "support";
}

function buildSystemPrompt({
  companyDisplayName,
  dept,
  profile,
  aiConfig,
  userMessage,
  contextText,
  conversationSummary,
  abTone
}) {
  const p = profile?.personality || {};
  const i = profile?.interpretation || {};
  const l = profile?.logic || {};
  const s = profile?.safety || {};
  const rules = aiConfig?.rules || [];

  const styleDesc =
    p.style === "formell" ? "Formell och korrekt" :
    p.style === "vänlig" ? "Vänlig och varm" :
    p.style === "avslappnad" ? "Avslappnad och lugn" :
    p.style === "professionell" ? "Professionell och tydlig" :
    p.style === "varm" ? "Varm och empatisk" : "Neutral och hjälpsam";

  const verbDesc =
    p.verbosity === "kort" ? "Kortfattade svar" :
    p.verbosity === "utförlig" ? "Utförliga svar med fler detaljer" : "Normala svar";

  const assertDesc =
    p.assertiveness === "hög" ? "Tydliga rekommendationer" :
    p.assertiveness === "låg" ? "Försiktiga förslag" : "Balans mellan förslag och val";

  const probDesc = p.problem_style === "vägledande" ? "Guida steg‑för‑steg" : "Aktiv problemlösning";

  const allowed = (s.allowed_phrases || []).join(", ");
  const rulesText = (aiConfig?.rules || []).map((r) => `IF ${r.if} THEN ${r.then}`).join("; ");
  const flowsText = (aiConfig?.flows || []).map((st, idx) => `${idx + 1}. ${st.type}: ${st.text || ""}`).join("\n");
  const timePolicy = l.time_policy || "direkt";
  const emp = Number(p.empathy_level ?? 50);
  const pol = Number(p.politeness_level ?? 50);
  const toneLevel = Number(p.tone_level ?? 50);
  const tone = abTone || profile?.tone || "professional";

  const willWarmTone = rules.some((r) => String(r.then || "").toLowerCase().includes("ändra_ton=varm") && /arg|förbannad|😡|!{2,}/i.test(userMessage));
  const styleOverride = willWarmTone ? "varm" : p.style;
  const styleDescFinal =
    styleOverride === "varm" ? "Varm och empatisk" : styleDesc;

  return `Du är en professionell AI‑kundtjänstagent för "${companyDisplayName || "vår tjänst"}".
Avdelning: ${String(dept || "support").toUpperCase()}.
Stil: ${styleDescFinal}. ${verbDesc}. ${assertDesc}. ${probDesc}. Empati=${emp}/100, Artighet=${pol}/100, Ton=${toneLevel}/100.
Språk: Svenska.
Tolkning: ${i.detect_emotion ? "Identifiera känsla." : "Ignorera känsla."} ${i.handle_slang ? "Förstå slang/emojis." : ""} ${i.ask_followup !== false ? "Ställ följdfråga vid oklarhet." : ""}
Tidspolicy: ${timePolicy}.
Legal: ${s?.legal?.no_guarantees ? "Ge inga garantier." : ""} ${s?.legal?.no_promises ? "Ge inga löften." : ""}
Säkerhet: Förbjudna ämnen hanteras med neutral avvisning. Tillåtna fraser: ${allowed || "Inga specifika"}.
Regler: ${rulesText || "Inga"}.
Flöden:
${flowsText || "Inga definierade flöden"}

Svarsstil:
- Svara kort, tydligt och korrekt.
- Hitta inte på. Om du är osäker eller saknar fakta: säg "Jag vet inte" och ställ 1-2 följdfrågor eller guida användaren vidare.
- Referera bara till fakta som finns i kontexten.

Kontext (sammanfattning av tråden):
${conversationSummary ? String(conversationSummary).slice(0, 1200) : "Ingen sammanfattning tillgänglig."}

Fakta-regler:
- Använd endast FAKTA nedan.
- Om fakta saknas: säg "Jag vet inte" och be om det minsta som behövs för att hjälpa.

Fakta:
${contextText || "Ingen specifik fakta tillgänglig."}

Tid: ${new Date().toLocaleString("sv-SE")}
Ton: ${tone}.`;
}

module.exports = { inferDepartment, buildSystemPrompt };
