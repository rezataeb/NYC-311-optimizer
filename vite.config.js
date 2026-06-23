import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      {
        name: "api-optimize",
        configureServer(server) {
          server.middlewares.use("/api/optimize", (req, res) => {
            if (req.method !== "POST") {
              res.writeHead(405);
              return res.end();
            }

            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              const sendJson = (status, data) => {
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(JSON.stringify(data));
              };

              const LANG_NAMES = { en: "English", es: "Spanish", zh: "Mandarin Chinese", ru: "Russian" };

              try {
                const { input, tone, action, location, language } = JSON.parse(body);
                if (!input) return sendJson(400, { error: "Missing input" });

                const langName = (language && language !== "en") ? (LANG_NAMES[language] || language) : null;

                const callAnthropic = (system, content, maxTokens = 1000) =>
                  fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-api-key": env.ANTHROPIC_API_KEY,
                      "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify({
                      model: "claude-haiku-4-5-20251001",
                      max_tokens: maxTokens,
                      system,
                      messages: [{ role: "user", content }]
                    })
                  });

                const parseResponse = async (upstream) => {
                  const data = await upstream.json();
                  const text = data.content[0].text
                    .trim()
                    .replace(/^```(?:json)?/i, "")
                    .replace(/```$/i, "")
                    .trim();
                  return JSON.parse(text);
                };

                if (action === "classify_location") {
                  const langHint = langName
                    ? `\nThe complaint may be written in ${langName}. Classify location requirement only — return the same JSON as below.`
                    : "";
                  const upstream = await callAnthropic(
                    `You are a NYC 311 routing expert. Classify what location data is needed based on these strict rules:${langHint}

full_address — complaint requires a specific building or block inspection: heat, hot water, construction, landlord issues, pothole, illegal dumping, rodents, flooding, sidewalk damage, noise from a specific unit or building

borough_only — complaint is area-wide or environmental, no specific building needed: air quality, general neighborhood noise, sanitation schedule, city services, park conditions

none — complaint is about digital services, websites, apps, or city-wide policy with no physical location

Return JSON only — no preamble, no markdown:
{
  "location_requirement": "full_address" or "borough_only" or "none",
  "reason": "one sentence explanation"
}`,
                    `Classify what location data is needed for this complaint: ${input}`,
                    200
                  );
                  return sendJson(200, await parseResponse(upstream));
                }

                if (action === "detect_language") {
                  const upstream = await callAnthropic(
                    "You are a language detector. Return JSON only.",
                    `What language is this text written in: ${input}\nReturn JSON: { "detected_language": "en" or "es" or "zh" or "ru", "confidence": "high" or "low" }`,
                    80
                  );
                  try { return sendJson(200, await parseResponse(upstream)); }
                  catch { return sendJson(200, { detected_language: "en", confidence: "low" }); }
                }

                if (action === "detect_neighborhood") {
                  const addrStr = location ? [location.address, location.borough].filter(Boolean).join(", ") : input;
                  const upstream = await callAnthropic(
                    "You are an NYC geography expert. Return JSON only.",
                    `What neighborhood, community board district, and police precinct is this address in: ${addrStr}, New York City?\nReturn JSON: { "neighborhood": "...", "community_board": "number only", "precinct": "number only", "valid_nyc_address": true or false }`,
                    200
                  );
                  try { return sendJson(200, await parseResponse(upstream)); }
                  catch { return sendJson(200, { neighborhood: null, valid_nyc_address: false }); }
                }

                if (action === "correct_address") {
                  const borough = location?.borough || "";
                  const upstream = await callAnthropic(
                    "You are an NYC address expert. Return JSON only.",
                    `The user entered this NYC address: ${input}${borough ? `, ${borough}` : ""}. Is this a valid NYC street address? If there is a small typo or abbreviation issue, suggest the most likely correct version. Also check whether this street address is consistent with the selected borough — if the address is more commonly found in a different NYC borough, flag this as a borough mismatch and suggest the correct borough.\nReturn JSON: { "likely_valid": true or false, "suggested_address": "...", "suggested_borough": "...", "correction_made": true or false, "borough_mismatch": true or false, "correction_explanation": "..." }`,
                    200
                  );
                  try { return sendJson(200, await parseResponse(upstream)); }
                  catch { return sendJson(200, { likely_valid: true, correction_made: false }); }
                }

                if (!tone) return sendJson(400, { error: "Missing tone" });

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
                  console.log(`[vite/optimize] SYSTEM: ${systemPrompt.slice(0, 200)}`);
                  console.log(`[vite/optimize] USER (first 400): ${userContent.slice(0, 400)}`);
                }
                const upstream = await callAnthropic(systemPrompt, userContent, 1200);
                const upstreamData = await upstream.json();
                const rawText = upstreamData.content[0].text
                  .trim()
                  .replace(/^```(?:json)?/i, "")
                  .replace(/```$/i, "")
                  .trim();
                if (langName) {
                  console.log(`[vite/optimize] RAW (first 300): ${rawText.slice(0, 300)}`);
                }
                const parsed = JSON.parse(rawText);
                if (langName) {
                  console.log(`[vite/optimize] lang=${language} | legal_note: ${String(parsed.legal_note ?? "").slice(0, 100)}`);
                }

                // Translate category for display in the user's language
                if (langName && parsed.category) {
                  try {
                    const catUpstream = await callAnthropic(
                      "You are a translator. Return only the translated text, nothing else.",
                      `Translate this NYC 311 category name into ${langName}: "${parsed.category}"`,
                      30
                    );
                    if (catUpstream.ok) {
                      const catData = await catUpstream.json();
                      parsed.category_display = catData.content[0].text.trim();
                      console.log(`[vite/optimize] category_display (${language}): ${parsed.category_display}`);
                    }
                  } catch {}
                }

                return sendJson(200, parsed);
              } catch {
                sendJson(500, { error: "Something went wrong — try rephrasing your complaint" });
              }
            });
          });
        }
      }
    ]
  };
});
