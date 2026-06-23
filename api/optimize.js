const LANG_NAMES = { en: "English", es: "Spanish", zh: "Mandarin Chinese", ru: "Russian" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input, tone, action, location, language } = req.body;
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  const langName = (language && language !== "en") ? (LANG_NAMES[language] || language) : null;

  if (action === "classify_location") {
    const langHint = langName
      ? `\nThe complaint may be written in ${langName}. Classify location requirement only — return the same JSON as below.`
      : "";

    const classifyRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          `You are a NYC 311 routing expert. Classify what location data is needed based on these strict rules:${langHint}

full_address — complaint requires a specific building or block inspection: heat, hot water, construction, landlord issues, pothole, illegal dumping, rodents, flooding, sidewalk damage, noise from a specific unit or building

borough_only — complaint is area-wide or environmental, no specific building needed: air quality, general neighborhood noise, sanitation schedule, city services, park conditions

none — complaint is about digital services, websites, apps, or city-wide policy with no physical location

Return JSON only — no preamble, no markdown:
{
  "location_requirement": "full_address" or "borough_only" or "none",
  "reason": "one sentence explanation"
}`,
        messages: [
          {
            role: "user",
            content: `Classify what location data is needed for this complaint: ${input}`
          }
        ]
      })
    });

    if (!classifyRes.ok) {
      const err = await classifyRes.text();
      return res.status(502).json({ error: "Anthropic API error", detail: err });
    }

    const classifyData = await classifyRes.json();
    const classifyText = classifyData.content[0].text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return res.status(200).json(JSON.parse(classifyText));
    } catch {
      return res.status(500).json({ error: "Failed to parse model response" });
    }
  }

  if (action === "detect_language") {
    const dlRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 80, system: "You are a language detector. Return JSON only.", messages: [{ role: "user", content: `What language is this text written in: ${input}\nReturn JSON: { "detected_language": "en" or "es" or "zh" or "ru", "confidence": "high" or "low" }` }] })
    });
    const dlData = await dlRes.json();
    const dlText = dlData.content[0].text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try { return res.status(200).json(JSON.parse(dlText)); }
    catch { return res.status(200).json({ detected_language: "en", confidence: "low" }); }
  }

  if (action === "detect_neighborhood") {
    const addrStr = location ? [location.address, location.borough].filter(Boolean).join(", ") : input;
    const nbRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, system: "You are an NYC geography expert. Return JSON only.", messages: [{ role: "user", content: `What neighborhood, community board district, and police precinct is this address in: ${addrStr}, New York City?\nReturn JSON: { "neighborhood": "...", "community_board": "number only", "precinct": "number only", "valid_nyc_address": true or false }` }] })
    });
    const nbData = await nbRes.json();
    const nbText = nbData.content[0].text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try { return res.status(200).json(JSON.parse(nbText)); }
    catch { return res.status(200).json({ neighborhood: null, valid_nyc_address: false }); }
  }

  if (action === "correct_address") {
    const borough = location?.borough || "";
    const caRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, system: "You are an NYC address expert. Return JSON only.", messages: [{ role: "user", content: `The user entered this NYC address: ${input}${borough ? `, ${borough}` : ""}. Is this a valid NYC street address? If there is a small typo or abbreviation issue, suggest the most likely correct version.\nReturn JSON: { "likely_valid": true or false, "suggested_address": "...", "suggested_borough": "...", "correction_made": true or false, "correction_explanation": "..." }` }] })
    });
    const caData = await caRes.json();
    const caText = caData.content[0].text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try { return res.status(200).json(JSON.parse(caText)); }
    catch { return res.status(200).json({ likely_valid: true, correction_made: false }); }
  }

  if (!tone) {
    return res.status(400).json({ error: "Missing tone" });
  }

  const locationStr = location
    ? [
        location.address,
        location.neighborhood ? `${location.neighborhood} neighborhood` : null,
        location.borough,
        location.community_board ? `Community Board ${location.community_board}` : null,
        location.precinct ? `Precinct ${location.precinct}` : null
      ].filter(Boolean).join(", ")
    : null;

  let systemPrompt;
  let userContent;

  if (langName) {
    systemPrompt = `You are an expert NYC 311 advocate. OUTPUT LANGUAGE RULE: legal_note and user_summary must be written in ${langName} — not in English. The rewritten field must be in English only because it is submitted directly to NYC 311. Respond in valid JSON only — no preamble, no markdown, no explanation.`;

    userContent = `Complaint: ${input}
Tone: ${tone}${locationStr ? `\nLocation: ${locationStr}` : ""}
Return ONLY this JSON:
{
  "rewritten": "[English] 3-5 sentences, specific and legally grounded",
  "category": "[English] exact 311 category in ALL CAPS",
  "agency": "[English] agency acronym e.g. HPD, DOT, DSNY",
  "agency_full": "[English] full agency name",
  "legal_note": "[${langName}] one sentence — legal obligation + timeframe",
  "user_summary": "[${langName}] one sentence — what was filed on the user's behalf",
  "likelihood": "High or Medium or Low"
}${locationStr ? "\nMake rewritten and legal_note specific to the location." : ""}
Write legal_note and user_summary in ${langName}, not English.

CRITICAL: legal_note and user_summary MUST be written in ${langName}, not English.
If ${langName} is Spanish, write in Spanish.
If ${langName} is Mandarin Chinese, write in Mandarin Chinese.
If ${langName} is Russian, write in Russian.
Never return legal_note or user_summary in English when a non-English language is selected.`;
  } else {
    systemPrompt = "You are an expert NYC 311 advocate. You know every complaint category, every responsible city agency, and the exact language that gets complaints acted on fastest. You always respond in valid JSON only — no preamble, no markdown, no explanation.";

    userContent = `Here is a complaint from an NYC resident: ${input}
Tone requested: ${tone}${locationStr ? `\nLocation: ${locationStr}` : ""}
Return this exact JSON and nothing else:
{
  "rewritten": "3-5 sentences, specific and legally grounded",
  "category": "exact 311 category in ALL CAPS",
  "agency": "agency acronym e.g. HPD, DOT, DSNY",
  "agency_full": "full agency name",
  "legal_note": "one sentence: legal obligation + timeframe",
  "likelihood": "High or Medium or Low"
}${locationStr ? "\nMake the rewritten complaint and legal_note specific to the location where relevant." : ""}`;
  }

  if (langName) {
    console.log(`[api/optimize] SYSTEM: ${systemPrompt.slice(0, 200)}`);
    console.log(`[api/optimize] USER (first 400): ${userContent.slice(0, 400)}`);
  }
  const optimizeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!optimizeRes.ok) {
    const err = await optimizeRes.text();
    return res.status(502).json({ error: "Anthropic API error", detail: err });
  }

  const optimizeData = await optimizeRes.json();
  const text = optimizeData.content[0].text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  if (langName) {
    console.log(`[api/optimize] RAW (first 300): ${text.slice(0, 300)}`);
  }

  try {
    const result = JSON.parse(text);
    if (langName) {
      console.log(`[api/optimize] lang=${language} | legal_note: ${String(result.legal_note ?? "").slice(0, 100)}`);
    }

    // Translate category for display
    if (langName && result.category) {
      try {
        const catRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 30,
            messages: [{
              role: "user",
              content: `Translate this NYC 311 category name into ${langName}: "${result.category}"\nReturn only the translated text, nothing else.`
            }]
          })
        });
        const catStatus = catRes.status;
        const catData = await catRes.json();
        console.log(`[api/optimize] cat translate status=${catStatus} result=${JSON.stringify(catData.content?.[0])}`);
        if (catRes.ok && catData.content?.[0]?.text) {
          result.category_display = catData.content[0].text.trim();
        }
      } catch (e) {
        console.log(`[api/optimize] cat translate error: ${e.message}`);
      }
    }

    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Failed to parse model response" });
  }
}
