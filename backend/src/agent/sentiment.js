import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Combined call-outcome analysis — ONE Groq call that judges both:
 *   1. Visitor satisfaction  (how the visitor came across)
 *   2. Lead qualification    (genuine purchase intent vs casual browsing)
 *
 * Returns:
 * {
 *   satisfaction: 'positive'|'neutral'|'negative'|'unknown',
 *   satisfactionReason: string,
 *   qualified: boolean,
 *   qualificationReason: string
 * }
 *
 * Always resolves — never throws. Falls back to safe defaults on any error.
 */
export async function analyzeCallOutcome(transcript) {
    const fallback = {
        satisfaction: 'unknown',
        satisfactionReason: '',
        qualified: false,
        qualificationReason: 'Could not analyze transcript'
    };

    if (!transcript || transcript.trim().split('\n').filter(Boolean).length < 2) {
        return { ...fallback, qualificationReason: 'Transcript too short to analyze' };
    }

    try {
        const systemPrompt = `You are analyzing a transcript of a conversation between an AI sales demo agent named Alex and a website visitor.

Make TWO independent judgments:

1. SATISFACTION — How satisfied did the VISITOR seem with the interaction?
   - positive: engaged, curious, appreciative, asking follow-up questions
   - neutral: polite but brief, no strong signal either way
   - negative: confused, frustrated, annoyed, dismissive, short replies

2. QUALIFICATION — Did the visitor show genuine purchase intent?
   - true: asked about pricing, "how do I sign up", requested a follow-up call, asked for a sales contact, compared features for a real use case, mentioned a budget or timeline
   - false: just browsing/exploring, no buying signals, testing or development context

Respond with ONLY a JSON object (no markdown, no extra text):
{
  "satisfaction": "positive" | "neutral" | "negative",
  "satisfactionReason": "one short sentence",
  "qualified": true | false,
  "qualificationReason": "one short sentence explaining why or why not"
}`;

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: transcript.slice(0, 4000) }
            ],
            max_tokens: 200,
            temperature: 0.2
        });

        const raw = response.choices[0].message.content.trim();
        const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim();
        const parsed = JSON.parse(cleaned);

        const validSatisfaction = ['positive', 'neutral', 'negative'];
        const satisfaction = validSatisfaction.includes(parsed.satisfaction)
            ? parsed.satisfaction
            : 'unknown';

        return {
            satisfaction,
            satisfactionReason: (parsed.satisfactionReason || '').slice(0, 300),
            qualified: Boolean(parsed.qualified),
            qualificationReason: (parsed.qualificationReason || '').slice(0, 300)
        };

    } catch (err) {
        console.log('⚠️ analyzeCallOutcome failed, using defaults:', err.message);
        return fallback;
    }
}

/**
 * @deprecated Use analyzeCallOutcome() instead.
 * Kept only so any old import doesn't crash during migration.
 */
export async function analyzeSatisfaction(transcript) {
    const result = await analyzeCallOutcome(transcript);
    return { satisfaction: result.satisfaction, reason: result.satisfactionReason };
}