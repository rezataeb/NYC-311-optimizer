export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input, tone, action, location } = req.body;
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  if (action === "classify_location") {
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
          `You are a NYC 311 routing expert. Classify what location data is needed based on these strict rules:

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

  if (!tone) {
    return res.status(400).json({ error: "Missing tone" });
  }

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

  const optimizeRes = await fetch("https://api.anthropic.com/v1/messages", {
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

  try {
    const result = JSON.parse(text);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Failed to parse model response" });
  }
}
