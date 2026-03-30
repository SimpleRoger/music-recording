import { Router, type IRouter } from "express";
import { GetVideoSummaryBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── Transcript fetching via TranscriptAPI.com ─────────────────────────────────

type TranscriptResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "TRANSCRIPT_API_KEY not configured" };
  }

  try {
    const url = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${encodeURIComponent(videoId)}&format=json`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, reason: `TranscriptAPI returned HTTP ${resp.status}: ${body.slice(0, 200)}` };
    }

    const data = (await resp.json()) as { transcript?: { text: string }[]; segments?: { text: string }[]; error?: string };

    if (data.error) {
      return { ok: false, reason: `TranscriptAPI error: ${data.error}` };
    }

    const segments = data.transcript ?? data.segments;

    if (!Array.isArray(segments) || segments.length === 0) {
      return { ok: false, reason: "No transcript segments returned — captions may be disabled on this video" };
    }

    const text = segments
      .map((s) => s.text?.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length <= 50) {
      return { ok: false, reason: `Transcript too short (${text.length} chars)` };
    }

    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, reason: `Unexpected error: ${err?.message ?? String(err)}` };
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post("/videos/summary", async (req, res): Promise<void> => {
  const parsed = GetVideoSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { videoId, title, description, channelName } = parsed.data;

  const transcriptResult = await fetchTranscript(videoId);
  const transcriptUsed = transcriptResult.ok;
  const transcriptFailReason = transcriptResult.ok ? null : transcriptResult.reason;

  if (!transcriptResult.ok) {
    req.log.warn({ videoId, reason: transcriptResult.reason }, "transcript fetch failed — falling back to description");
  }

  const sourceLabel = transcriptUsed ? "FULL TRANSCRIPT" : "DESCRIPTION";
  const rawTranscript = transcriptResult.ok ? transcriptResult.text : null;

  // Transcripts can be very long — take up to ~14 000 chars
  const sourceText = rawTranscript
    ? rawTranscript.slice(0, 14000)
    : description?.slice(0, 6000) ?? "(no content available)";

  const truncationNote =
    rawTranscript && rawTranscript.length > 14000
      ? `\n(Note: transcript truncated at 14 000 of ${rawTranscript.length} chars)`
      : "";

  const prompt = `You are an expert content analyst. Produce an extremely thorough breakdown of this YouTube video so the reader gains its full value without watching.

VIDEO TITLE: "${title}"
CHANNEL: "${channelName}"
SOURCE: ${sourceLabel}${truncationNote}

${sourceLabel}:
${sourceText}

---

Return a single JSON object — raw JSON only, no markdown, no code fences:

{
  "tldr": "One punchy, specific sentence capturing the whole video.",
  "overview": "5–7 sentences: subject matter, overall argument or story, approach taken, key conclusion, and why it matters.",
  "topicsCovered": [
    {
      "topic": "Concise topic title",
      "detail": "4–6 sentences of the actual content discussed: specific facts, figures, techniques, arguments, demos, code, or examples. Never say 'this is covered' — write what was actually said or shown."
    }
  ],
  "keyTakeaways": [
    "Specific, standalone insight — include actual facts, numbers, steps, or advice. No filler."
  ],
  "notableDetails": [
    "A specific quote, statistic, surprising fact, demo result, or memorable tip."
  ],
  "audience": "Who benefits most, what prior knowledge helps, and what they will concretely gain.",
  "verdict": "3 sentences: what the video does exceptionally well, any gaps or weaknesses, and a clear recommendation."
}

Rules:
- topicsCovered: 6–12 items covering every significant section. Each detail must convey the actual information, not just name the topic.
- keyTakeaways: 7–12 items, specific enough to be useful standalone.
- notableDetails: 4–7 items — the most memorable specifics a viewer would highlight.
- Output raw JSON only.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 3000,
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
    res.json({ summary: raw, transcriptUsed });
    return;
  }

  res.json({
    summary: data.overview ?? data.tldr ?? "",
    transcriptUsed,
    transcriptFailReason,
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
