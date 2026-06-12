export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input, tone } = req.body;
  if (!input || !tone) {
    return res.status(400).json({ error: "Missing input or tone" });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
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

  if (!response.ok) {
    const err = await response.text();
    return res.status(502).json({ error: "Anthropic API error", detail: err });
  }

  const data = await response.json();
  const text = data.content[0].text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const result = JSON.parse(text);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Failed to parse model response" });
  }
}
