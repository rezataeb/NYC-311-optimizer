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

              try {
                const { input, tone, action, location } = JSON.parse(body);
                if (!input) return sendJson(400, { error: "Missing input" });

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
                  const upstream = await callAnthropic(
                    `You are a NYC 311 routing expert. Classify what location data is needed based on these strict rules:

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

                if (!tone) return sendJson(400, { error: "Missing tone" });

                const locationStr = location
                  ? [location.address, location.borough].filter(Boolean).join(", ")
                  : null;

                const userContent = `Here is a complaint from an NYC resident: ${input}
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

                const upstream = await callAnthropic(
                  "You are an expert NYC 311 advocate. You know every complaint category, every responsible city agency, and the exact language that gets complaints acted on fastest. You always respond in valid JSON only — no preamble, no markdown, no explanation.",
                  userContent
                );
                return sendJson(200, await parseResponse(upstream));
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
