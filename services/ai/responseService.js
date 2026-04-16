const { fetchRelevantKnowledge } = require("./contextService");
const { inferDepartment, buildSystemPrompt } = require("./promptBuilder");

function createAiResponseService({ openai, Company, Document, Knowledge, KnowledgeChunk, getConversationSummary }) {
  async function generateAIResponse(companyId, messages, userMessage, abTone, opts = {}) {
    try {
      const company = await Company.findOne({ companyId });
      const aiConfig = company?.settings?.ai || {};
      const profiles = aiConfig?.profiles || {};
      const activeName = aiConfig?.activeProfile || Object.keys(profiles)[0] || "default";
      const now = new Date();
      const hour = now.getHours();
      const mappings = aiConfig?.segmenting?.mappings || [];
      const dept = inferDepartment(userMessage);

      let profileName = activeName;
      for (const m of mappings) {
        const langOk = (m.language || "sv") === "sv";
        let timeOk = true;
        if (m.schedule === "kontorstid") timeOk = hour >= 9 && hour < 17;
        else if (m.schedule === "kväll") timeOk = hour >= 17 && hour < 23;
        const deptOk = !m.department || m.department === dept;
        const custOk = true;
        if (langOk && timeOk && deptOk && custOk && profiles[m.profile]) {
          profileName = m.profile;
          break;
        }
      }

      const profile = profiles[profileName] || {};
      const safety = profile?.safety || {};
      const forbidden = (safety.forbidden_topics || []).map((t) => String(t).toLowerCase());
      const txtLow = String(userMessage || "").toLowerCase();
      if (forbidden.some((t) => txtLow.includes(t))) {
        return "Det ämnet kan vi inte behandla här. Jag kopplar dig vidare till en mänsklig agent som kan hjälpa dig.";
      }

      const { contextText } = await fetchRelevantKnowledge({
        companyId,
        userMessage,
        Document,
        Knowledge,
        KnowledgeChunk,
        limit: 5
      });

      const conversationSummary = opts?.ticket && typeof getConversationSummary === "function"
        ? await getConversationSummary({ ticket: opts.ticket })
        : "";

      const systemPrompt = buildSystemPrompt({
        companyDisplayName: company?.displayName,
        dept,
        profile,
        aiConfig,
        userMessage,
        contextText,
        conversationSummary,
        abTone
      });

      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
        throw new Error("Missing Key");
      }

      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.slice(-6).map((m) => ({
          role: m.role === "assistant" || m.role === "agent" ? "assistant" : "user",
          content: m.content
        })),
        { role: "user", content: userMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 800
      });

      let result = completion.choices[0]?.message?.content || "Jag kunde tyvärr inte generera ett svar just nu.";

      const interpretation = profile?.interpretation || {};
      const logic = profile?.logic || {};
      const rules = aiConfig?.rules || [];
      const timePolicy = logic.time_policy || "direkt";
      const sales = profile?.sales || {};

      if (interpretation.ask_followup !== false && result && userMessage && userMessage.trim().length < 8) {
        const follow = " Kan du beskriva lite mer vad som inte fungerar?";
        if (!result.includes(follow)) result += follow;
      }
      if (timePolicy === "kontorstid") {
        const h = new Date().getHours();
        if (h < 9 || h >= 17) result += " Vi återkommer med mer detaljer under kontorstid.";
      } else if (timePolicy === "fördröjt") {
        result += " Jag återkommer strax med fler detaljer.";
      }

      const suggestComp = rules.some((r) => String(r.then || "").toLowerCase().includes("föreslå_kompensation") && /(skada|försening|feldebitering|besviken|missnöjd)/i.test(userMessage));
      if (suggestComp) result += " Vi kan titta på kompensation om det är motiverat enligt vår policy.";

      const askFollowRule = rules.some((r) => String(r.then || "").toLowerCase().includes("ställ_följdfråga") && /(osäker|vet inte|\?{2,})/i.test(userMessage));
      if (askFollowRule) result += " Skulle du kunna beskriva situationen lite närmare?";

      if (dept === "sälj" && sales.enable_cta) {
        const ctas = [];
        if (sales.offer_demo) ctas.push("Vill du boka en kort demo?");
        if (sales.offer_offert) ctas.push("Ska vi ta fram en offert?");
        if (sales.link_pricing) ctas.push("Vi kan gå igenom prisplanerna tillsammans.");
        if (sales.schedule_meeting) ctas.push("Vill du boka ett möte med en säljkollega?");
        if (sales.request_contact) ctas.push("Kan jag få din e‑post och telefon så återkopplar vi snarast?");
        if (ctas.length) result += " " + ctas.join(" ");
      }

      if ((!contextText || contextText.trim().length === 0) && !/jag vet inte/i.test(result)) {
        result = `Jag vet inte ännu. ${result}`;
      }

      return result;
    } catch (e) {
      const input = String(userMessage || "").toLowerCase();
      if (String(e.message || "").includes("quota") || String(e.message || "").includes("429")) {
        return "Tack för ditt meddelande! Systemet är för tillfället i begränsat läge (OpenAI Quota slut). En mänsklig agent har notifierats och kommer hjälpa dig så snart som möjligt. 😊";
      }
      if (input.includes("hej") || input.includes("tja")) return "Hej! 👋 Hur kan jag stå till tjänst idag? (AI i begränsat läge)";
      if (input.includes("pris") || input.includes("kosta")) return "Vi har olika prisplaner. Kontakta gärna vår säljavdelning för en offert! (AI i begränsat läge)";
      return "Tack för ditt meddelande. En av våra agenter kommer att titta på detta så snart som möjligt. (AI i begränsat läge)";
    }
  }

  return { generateAIResponse };
}

module.exports = { createAiResponseService };
