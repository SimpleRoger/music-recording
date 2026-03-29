import { Router, type IRouter } from "express";
import { GetVideoSummaryBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.post("/videos/summary", async (req, res): Promise<void> => {
  const parsed = GetVideoSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, channelName } = parsed.data;

  const prompt = `You are an expert content analyst. Your job is to produce a comprehensive breakdown of a YouTube video so thorough that the reader gains full value from it without watching.

VIDEO TITLE: "${title}"
CHANNEL: "${channelName}"
DESCRIPTION:
${description ? description.slice(0, 6000) : "(no description provided)"}

---

Produce a detailed JSON analysis with EXACTLY this structure (raw JSON, no markdown, no code fences):

{
  "tldr": "One punchy sentence that captures the entire video in plain language.",
  "overview": "A rich 3–5 sentence paragraph covering the core subject, the approach taken, and the main argument or narrative arc of the video.",
  "topicsCovered": [
    {
      "topic": "Concise topic title",
      "detail": "2–4 sentences explaining exactly what was covered under this topic — specific facts, techniques, arguments, or demonstrations mentioned. Be as concrete and informative as possible."
    }
  ],
  "keyTakeaways": [
    "Concrete, specific takeaway — not generic. Include actual facts, numbers, techniques, or advice from the video."
  ],
  "notableDetails": [
    "An interesting detail, quote, example, statistic, or tip that stands out from the video."
  ],
  "audience": "A detailed sentence describing exactly who will benefit most and what prior knowledge helps.",
  "verdict": "2–3 sentences assessing the video's value: what it does well, any limitations, and a clear recommendation."
}

Rules:
- topicsCovered: 4–8 items. Each detail must be substantive — never say 'this topic is covered in detail'. Actually explain what was said.
- keyTakeaways: 5–8 items. Must be specific and actionable/informational. No filler like 'the speaker gives tips'.
- notableDetails: 3–5 items. Highlight the most interesting or surprising specifics.
- Draw exclusively from the title and description. If the description has timestamps or section headers, use them to structure topicsCovered.
- Output raw JSON only — nothing else.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

  type Parsed = {
    tldr?: string;
    overview?: string;
    topicsCovered?: { topic: string; detail: string }[];
    keyTakeaways?: string[];
    notableDetails?: string[];
    audience?: string;
    verdict?: string;
  };

  let data: Parsed = {};
  try {
    data = JSON.parse(raw) as Parsed;
  } catch {
    res.json({ summary: raw });
    return;
  }

  res.json({
    summary: data.overview ?? data.tldr ?? "",
    structured: {
      tldr: data.tldr ?? "",
      overview: data.overview ?? "",
      topicsCovered: Array.isArray(data.topicsCovered) ? data.topicsCovered : [],
      keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways : [],
      notableDetails: Array.isArray(data.notableDetails) ? data.notableDetails : [],
      audience: data.audience ?? "",
      verdict: data.verdict ?? "",
    },
  });
});

export default router;
