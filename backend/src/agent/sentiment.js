import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null;

/**
 * Combined call-outcome analysis — ONE Groq call that judges:
 *   1. Visitor satisfaction  (how the visitor came across)
 *   2. Lead qualification    (genuine purchase intent vs casual browsing)
 *   3. Lead score            (hot / warm / cold buying temperature)
 *
 * Returns:
 * {
 *   satisfaction: 'positive'|'neutral'|'negative'|'unknown',
 *   satisfactionReason: string,
 *   qualified: boolean,
 *   qualificationReason: string,
 *   leadScore: 'hot'|'warm'|'cold'|'unknown',
 *   leadScoreReason: string
 * }
 *
 * Always resolves — never throws. Falls back to safe defaults on any error.
 */
export async function analyzeCallOutcome(transcript) {
    const fallback = {
        satisfaction: 'unknown',
        satisfactionReason: '',
        qualified: false,
        qualificationReason: 'Could not analyze transcript',
        leadScore: 'unknown',
        leadScoreReason: ''
    };

    if (!transcript || transcript.trim().split('\n').filter(Boolean).length < 2) {
        return { ...fallback, qualificationReason: 'Transcript too short to analyze' };
    }

    if (!groq) {
        console.log('⚠️ GROQ_API_KEY missing, skipping sentiment analysis');
        return fallback;
    }

    try {
        const systemPrompt = `You are analyzing a transcript of a conversation between an AI sales agent and a website visitor. Lines may be labelled with the agent's name, "User" for the visitor, or a human specialist who joined the call.

Make these independent judgments:

1. SATISFACTION — How satisfied did the VISITOR seem with the interaction?
   - positive: engaged, curious, appreciative, asking follow-up questions
   - neutral: polite but brief, no strong signal either way
   - negative: confused, frustrated, annoyed, dismissive, short replies

2. QUALIFICATION — Did the visitor show genuine purchase intent?
   - true: asked about pricing, "how do I sign up", requested a follow-up call, asked for a sales contact, compared features for a real use case, mentioned a budget or timeline
   - false: just browsing/exploring, no buying signals, testing or development context

3. LEAD SCORE — How close is the visitor to buying?
   - hot: clear intent now: asked to buy/book/sign up, gave budget + timeline, requested a call or quote, clicked through to a product
   - warm: real interest but no commitment: compared options, asked about pricing or fit, wants to think it over
   - cold: no buying signals: browsing, off-topic, support-only, or disengaged

4. SUMMARY — A concise 1-2 sentence overview of what the conversation covered and what the visitor asked.

Respond with ONLY a JSON object (no markdown, no extra text):
{
  "summary": "1-2 sentence summary of the demo session",
  "satisfaction": "positive" | "neutral" | "negative",
  "satisfactionReason": "one short sentence",
  "qualified": true | false,
  "qualificationReason": "one short sentence explaining why or why not",
  "leadScore": "hot" | "warm" | "cold",
  "leadScoreReason": "one short sentence"
}`;

        const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
        const response = await groq.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: transcript.slice(0, 4000) }
            ],
            max_tokens: 450,
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
            summary: (parsed.summary || '').slice(0, 500),
            satisfaction,
            satisfactionReason: (parsed.satisfactionReason || '').slice(0, 300),
            qualified: Boolean(parsed.qualified),
            qualificationReason: (parsed.qualificationReason || '').slice(0, 300),
            leadScore: ['hot', 'warm', 'cold'].includes(parsed.leadScore) ? parsed.leadScore : 'unknown',
            leadScoreReason: (parsed.leadScoreReason || '').slice(0, 300)
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