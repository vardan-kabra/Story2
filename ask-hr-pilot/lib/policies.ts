import policiesData from "../data/hrPolicies.json";

export interface Policy {
  topic: string;
  title: string;
  source: string;
  keywords: string[];
  content: string;
}

const POLICIES = policiesData as Policy[];

/**
 * Retrieves HR policy entries relevant to a free-text topic.
 *
 * Matching is a lightweight keyword/title score over the JSON knowledge base.
 * Every returned entry carries its `source` so the answer can cite where the
 * information came from. Returns an empty array when nothing matches, so the
 * caller can clearly say "no policy found".
 */
export function getPolicyByTopic(topic: string): Policy[] {
  const q = (topic || "").toLowerCase().trim();
  if (!q) return [];

  const scored = POLICIES.map((p) => {
    let score = 0;
    const haystacks = [p.topic, p.title, ...p.keywords].map((s) =>
      s.toLowerCase(),
    );

    for (const h of haystacks) {
      if (h === q) score += 5;
      else if (q.includes(h) || h.includes(q)) score += 3;
    }

    // Token overlap between the query and the keywords.
    const qTokens = q.split(/\s+/).filter(Boolean);
    for (const token of qTokens) {
      if (token.length < 3) continue;
      if (p.keywords.some((k) => k.toLowerCase().includes(token))) score += 1;
      if (p.title.toLowerCase().includes(token)) score += 1;
      if (p.content.toLowerCase().includes(token)) score += 0.25;
    }

    return { policy: p, score };
  }).filter((s) => s.score > 0);

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  // Keep only genuinely relevant matches: a real keyword/title hit (score >= 2)
  // that is also close to the best score. This filters out weak, common-word
  // overlaps (e.g. the word "leave" appearing in every leave policy). Cap at 3.
  const top = scored[0].score;
  const cutoff = Math.max(2, top * 0.6);
  return scored
    .filter((s) => s.score >= cutoff)
    .slice(0, 3)
    .map((s) => s.policy);
}

export function listPolicyTopics(): string[] {
  return POLICIES.map((p) => p.topic);
}
