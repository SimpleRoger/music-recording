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

  const prompt = `You are summarising a YouTube video for a viewer deciding whether to watch it.

Video title: "${title}"
Channel: "${channelName}"
Description: ${description ? description.slice(0, 2000) : "(no description provided)"}

Write a clear, engaging summary of what this video is likely about. Keep it to 3–4 concise sentences. Focus on the key topic, what the viewer will learn or see, and why it might be worth watching. Do not start with "This video" — vary your opening.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const summary = completion.choices[0]?.message?.content?.trim() ?? "Summary unavailable.";
  res.json({ summary });
});

export default router;
