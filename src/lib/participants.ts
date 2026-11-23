// 채팅 메시지 → 참여자 묶기 (순수 함수, 테스트 대상)
import { containsPII, containsProfanity, isUsableComment, wantsExclusion } from "./filters";

export interface ChatMessage {
  id: string;
  channel_id: string;
  display_name: string;
  message: string;
  published_at: string;
  author_role: string; // owner | moderator | viewer
}

export interface Participant {
  channel_id: string;
  display_name: string;
  comment_count: number;
  top_comments: string[];
  keywords: string[];
  excluded: boolean;
  excluded_reason: string | null;
}

export interface BuildOptions {
  staffChannelIds?: Set<string>;
  excludeModerators?: boolean;
}

const STOPWORDS = new Set([
  "그리고", "그래서", "근데", "진짜", "너무", "정말", "완전", "오늘", "지금", "우리", "저희", "여러분",
  "안녕하세요", "감사합니다", "있어요", "합니다", "ㅋㅋ", "ㅋㅋㅋ", "ㅎㅎ", "ㅎㅎㅎ", "the", "and",
]);

/** 아주 단순한 키워드 추출: 2글자 이상 단어 빈도 상위 5개 */
export function extractKeywords(comments: string[], max = 5): string[] {
  const freq = new Map<string, number>();
  for (const c of comments) {
    for (const raw of c.split(/[\s,.!?~()[\]{}"'“”‘’…·]+/)) {
      const w = raw.replace(/[ㅋㅎㅠㅜ^]+$/g, "").replace(/(은|는|이|가|을|를|도|요|에|의|로|과|와)$/u, "");
      if (w.length < 2 || STOPWORDS.has(w) || /^[ㅋㅎㅠㅜ]+$/.test(w) || /^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

/** 대표 댓글 고르기: 쓸 수 있는 댓글 중 길이가 적당하고 서로 다른 것 최대 3개 */
export function pickTopComments(comments: string[], max = 3): string[] {
  const usable = [...new Set(comments.map((c) => c.trim()).filter(isUsableComment))];
  const scored = usable.map((c, i) => ({ c, i, score: Math.min(c.length, 60) }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, max).map((s) => s.c.slice(0, 200));
}

export function buildParticipants(messages: ChatMessage[], opts: BuildOptions = {}): Participant[] {
  const staff = opts.staffChannelIds ?? new Set<string>();
  const excludeModerators = opts.excludeModerators ?? true;
  const groups = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const list = groups.get(m.channel_id) ?? [];
    list.push(m);
    groups.set(m.channel_id, list);
  }

  const result: Participant[] = [];
  for (const [channel_id, list] of groups) {
    list.sort((a, b) => a.published_at.localeCompare(b.published_at));
    const latest = list[list.length - 1];
    const texts = list.map((m) => m.message);
    const top = pickTopComments(texts);

    let reason: string | null = null;
    if (staff.has(channel_id) || list.some((m) => m.author_role === "owner")) reason = "staff";
    else if (excludeModerators && list.some((m) => m.author_role === "moderator")) reason = "moderator";
    else if (texts.some(wantsExclusion)) reason = "opt_out";
    else if (containsProfanity(latest.display_name) || containsPII(latest.display_name)) reason = "bad_nickname"; // 닉네임은 그대로 공개되므로
    else if (top.length === 0) reason = "no_usable_comments";

    result.push({
      channel_id,
      display_name: latest.display_name,
      comment_count: list.length,
      top_comments: top,
      keywords: extractKeywords(top),
      excluded: reason !== null,
      excluded_reason: reason,
    });
  }
  return result.sort((a, b) => b.comment_count - a.comment_count);
}
