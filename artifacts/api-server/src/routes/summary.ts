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

  const prompt = `You are an expert content analyst helping viewers decide whether to watch a YouTube video.

Video title: "${title}"
Channel: "${channelName}"
Description:
${description ? description.slice(0, 3000) : "(no description provided)"}

Write a detailed analysis using EXACTLY this JSON structure (no markdown, no code fences, raw JSON only):
{
  "overview": "2–3 sentences covering the core topic and angle of the video.",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4"],
  "audience": "1 sentence describing who will benefit most from this video.",
  "verdict": "1–2 sentences on whether it's worth watching and why."
}

Rules:
- keyPoints must have 3–5 items, each a distinct insight or thing covered in the video.
- Be specific — avoid generic filler like "great content" or "very informative".
- Base everything on the title and description; do not invent facts not implied by them.
- Output raw JSON only, nothing else.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 700,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

  let parsed2: { overview?: string; keyPoints?: string[]; audience?: string; verdict?: string } = {};
  try {
    parsed2 = JSON.parse(raw);
  } catch {
    res.json({ summary: raw });
    return;
  }

  res.json({
    summary: parsed2.overview ?? "",
    structured: {
      overview: parsed2.overview ?? "",
      keyPoints: Array.isArray(parsed2.keyPoints) ? parsed2.keyPoints : [],
      audience: parsed2.audience ?? "",
      verdict: parsed2.verdict ?? "",
    },
  });
});

export default router;
