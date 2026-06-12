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
              try {
                const { input, tone } = JSON.parse(body);

                const upstream = await fetch("https://api.anthropic.com/v1/messages", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-api-key": env.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01"
                  },
                  body: JSON.stringify({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 1000,
                    system:
                      "You are an expert NYC 311 advocate. You know every complaint category, every responsible city agency, and the exact language that gets complaints acted on fastest. You always respond in valid JSON only — no preamble, no markdown, no explanation.",
                    messages: [
                      {
                        role: "user",
                        content: `Here is a complaint from an NYC resident: ${input}
Tone requested: ${tone}
Return this exact JSON and nothing else:
{
  "rewritten": "3-5 sentences, specific and legally grounded",
  "category": "exact 311 category in ALL CAPS",
  "agency": "agency acronym e.g. HPD, DOT, DSNY",
  "agency_full": "full agency name",
  "legal_note": "one sentence: legal obligation + timeframe",
  "likelihood": "High or Medium or Low"
}`
                      }
                    ]
                  })
                });

                const data = await upstream.json();
                const text = data.content[0].text
                  .trim()
                  .replace(/^```(?:json)?/i, "")
                  .replace(/```$/i, "")
                  .trim();
                const result = JSON.parse(text);

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result));
              } catch {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Something went wrong — try rephrasing your complaint" }));
              }
            });
          });
        }
      }
    ]
  };
});
