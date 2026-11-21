import { describe, expect, it } from "vitest";
import { containsPII, containsProfanity, isUsableComment, wantsExclusion } from "../src/lib/filters";
import { buildImagePrompt, characterName, containsBannedTerm, stripBannedTerms, STYLE_PROMPT } from "../src/lib/style";
import { buildParticipants, type ChatMessage } from "../src/lib/participants";
import { runQueue } from "../src/lib/queue";
import { minPollIntervalMs, parseVideoId, toRows, type LiveChatItem } from "../src/lib/youtube";
import { sanitizeProfile } from "../src/lib/generate";
import { collectorView } from "../src/lib/collector-status";
import { autoPick, searchCharacters } from "../src/lib/search";
import { FALLBACK_PERSONALITY } from "../src/lib/generate";

describe("gift 검색", () => {
  const cs = [
    { id: "1", displayName: "민수", name: "민수핑" },
    { id: "2", displayName: "민수", name: "민수핑" },
    { id: "3", displayName: "민수짱", name: "민수짱핑" },
    { id: "4", displayName: "지원", name: "지원핑" },
  ];
  it("같은 닉네임이 여러 명이면 자동 선택하지 않는다", () => {
    const r = searchCharacters(cs, "민수");
    expect(r.exactCount).toBe(2);
    expect(r.matches.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(autoPick(r.matches, r.exactCount)).toBeNull();
  });
  it("정확히 한 명이면 바로 보여 준다 (부분 일치 후보가 있어도)", () => {
    const r = searchCharacters(cs, "@민수짱");
    expect(autoPick(r.matches, r.exactCount)?.id).toBe("3");
    const r2 = searchCharacters(cs, "지");
    expect(autoPick(r2.matches, r2.exactCount)?.id).toBe("4");
  });
});

describe("collectorView", () => {
  const now = Date.parse("2026-11-24T11:00:00Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  it("running 인데 마지막 수집이 오래되면 멈춤으로 보인다", () => {
    expect(collectorView("running", ago(10), now).label).toBe("수집 중");
    expect(collectorView("running", ago(300), now)).toEqual({ label: "멈춤 (응답 없음)", tone: "warn" });
    expect(collectorView("running", undefined, now).tone).toBe("warn");
  });
  it("다른 상태는 한국어로", () => {
    expect(collectorView("finished", ago(9999), now).label).toBe("끝남");
    expect(collectorView("stopped: quotaExceeded", ago(5), now).label).toBe("멈춤: quotaExceeded");
    expect(collectorView(undefined, undefined, now).label).toBe("-");
  });
});

describe("filters", () => {
  it("개인정보를 잡는다", () => {
    expect(containsPII("제 번호 010-1234-5678 이에요")).toBe(true);
    expect(containsPII("01012345678")).toBe(true);
    expect(containsPII("메일 teacher@school.go.kr 로 주세요")).toBe(true);
    expect(containsPII("카톡 아이디: abc123")).toBe(true);
    expect(containsPII("오늘 방송 2026-11-24 최고")).toBe(false);
    expect(containsPII("19시 55분에 쉬는 시간")).toBe(false);
  });
  it("욕설을 띄어쓰기로 쪼개도 잡는다", () => {
    expect(containsProfanity("시 발")).toBe(true);
    expect(containsProfanity("ㅅ.ㅂ")).toBe(true);
    expect(containsProfanity("선생님 최고예요")).toBe(false);
  });
  it("#캐릭터제외 요청", () => {
    expect(wantsExclusion("저는 #캐릭터제외 할게요")).toBe(true);
    expect(wantsExclusion("# 캐릭터 제외")).toBe(true);
    expect(isUsableComment("#캐릭터제외")).toBe(false);
  });
});

describe("style", () => {
  it("캐릭터 이름 = 닉네임 + 핑", () => {
    expect(characterName("승엽")).toBe("승엽핑");
    expect(characterName("@seungyeop")).toBe("seungyeop핑");
    expect(characterName("행복핑")).toBe("행복핑");
    expect(characterName("   ")).toBe("익명핑");
  });
  it("기존 작품명·캐릭터 이름은 프롬프트에서 빠진다", () => {
    expect(containsBannedTerm("하츄핑 같은 모습")).toBe(true);
    expect(containsBannedTerm("Pikachu ears")).toBe(true);
    expect(containsBannedTerm("승엽핑")).toBe(false);
    expect(stripBannedTerms("pikachu yellow cheeks")).toBe("yellow cheeks");
    const prompt = buildImagePrompt({ personality: "티니핑처럼 밝은 성격", look: ["Pokemon tail", "tiny headphones", "lime scarf"] });
    expect(containsBannedTerm(prompt)).toBe(false);
    expect(prompt).toContain(STYLE_PROMPT);
    expect(prompt).toContain("tiny headphones");
  });
  it("이미지 프롬프트에 닉네임·이름이 들어가지 않는다 (look/personality 만 사용)", () => {
    const prompt = buildImagePrompt({ personality: "다정함", look: ["round glasses"] });
    expect(prompt).not.toMatch(/핑/);
  });
});

describe("sanitizeProfile", () => {
  it("금지어·개인정보를 지우고 길이를 자른다", () => {
    const p = sanitizeProfile({ personality: "하츄핑 닮은 다정함", look: ["kuromi hood", "star wand", "green boots", "extra"], quote: "연락 주세요 010-1111-2222" });
    expect(p.personality).toBe("닮은 다정함");
    expect(p.look).toEqual(["hood", "star wand", "green boots"]);
    expect(p.quote).toBe("오늘 방송 함께해서 즐거웠어요!");
  });
  it("성격·외형에도 개인정보·욕설 검사를 한다", () => {
    const p = sanitizeProfile({
      personality: "연락은 010-1234-5678 로",
      look: ["씨발 hat", "teacher@school.kr badge", "lime scarf"],
      quote: "안녕",
    });
    expect(p.personality).toBe(FALLBACK_PERSONALITY);
    expect(p.look).toEqual(["lime scarf"]);
  });
});

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  channel_id: "UC_a",
  display_name: "에이",
  message: "안녕하세요 라디오 최고!",
  published_at: "2026-11-24T10:00:00Z",
  author_role: "viewer",
  ...over,
});

describe("buildParticipants", () => {
  it("채널 ID 로 묶고, 닉네임이 같아도 다른 사람은 따로", () => {
    const ps = buildParticipants([
      msg({ channel_id: "UC_a", display_name: "민수" }),
      msg({ channel_id: "UC_a", display_name: "민수", message: "코딩 수업 이야기 좋아요" }),
      msg({ channel_id: "UC_b", display_name: "민수", message: "부산에서 들어요" }),
    ]);
    expect(ps).toHaveLength(2);
    expect(ps.find((p) => p.channel_id === "UC_a")!.comment_count).toBe(2);
  });
  it("제외 대상: 운영진·소유자·모더레이터·#캐릭터제외·쓸 댓글 없음", () => {
    const ps = buildParticipants(
      [
        msg({ channel_id: "staff" }),
        msg({ channel_id: "owner", author_role: "owner" }),
        msg({ channel_id: "mod", author_role: "moderator" }),
        msg({ channel_id: "optout", message: "재밌어요 #캐릭터제외" }),
        msg({ channel_id: "pii", message: "010-1234-5678 연락주세요" }),
        msg({ channel_id: "ok", message: "선생님들 멋져요" }),
      ],
      { staffChannelIds: new Set(["staff"]) },
    );
    const reason = Object.fromEntries(ps.map((p) => [p.channel_id, p.excluded_reason]));
    expect(reason).toEqual({ staff: "staff", owner: "staff", mod: "moderator", optout: "opt_out", pii: "no_usable_comments", ok: null });
  });
  it("대표 댓글에서 개인정보·욕설 댓글은 빠진다", () => {
    const [p] = buildParticipants([
      msg({ message: "내 메일은 a@b.com" }),
      msg({ message: "씨발 재밌다" }),
      msg({ message: "교사 개발자 응원합니다" }),
    ]);
    expect(p.top_comments).toEqual(["교사 개발자 응원합니다"]);
    expect(p.excluded).toBe(false);
  });
});

describe("runQueue", () => {
  it("동시 실행 수를 지키고 실패는 재시도한다", async () => {
    let running = 0;
    let peak = 0;
    const tries = new Map<number, number>();
    const res = await runQueue(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        tries.set(n, (tries.get(n) ?? 0) + 1);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        if (n === 3 && tries.get(n)! < 2) throw new Error("flaky");
        if (n === 5) throw new Error("always");
      },
      { concurrency: 3, retries: 2, retryDelayMs: 1 },
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(res.succeeded.sort()).toEqual([1, 2, 3, 4, 6, 7]);
    expect(res.failed.map((f) => f.item)).toEqual([5]);
    expect(tries.get(5)).toBe(3); // 1회 + 재시도 2회
  });
});

describe("youtube", () => {
  it("영상 ID 파싱", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
  });
  it("할당량: 150분 수집이면 최소 5초 간격", () => {
    expect(minPollIntervalMs(150)).toBe(5000);
  });
  it("채팅 응답을 행으로 바꾸고 역할을 표시한다", () => {
    const items = [
      {
        id: "m1",
        snippet: { type: "textMessageEvent", publishedAt: "2026-11-24T10:00:00Z", authorChannelId: "UC1", textMessageDetails: { messageText: "안녕" } },
        authorDetails: { channelId: "UC1", displayName: "하나", isChatOwner: false, isChatModerator: true },
      },
      {
        id: "m2",
        snippet: { type: "memberMilestoneChatEvent", publishedAt: "2026-11-24T10:00:01Z", authorChannelId: "UC2" },
        authorDetails: { channelId: "UC2", displayName: "둘", isChatOwner: false, isChatModerator: false },
      },
    ] as LiveChatItem[];
    expect(toRows(items)).toEqual([
      { id: "m1", channel_id: "UC1", display_name: "하나", message: "안녕", published_at: "2026-11-24T10:00:00Z", author_role: "moderator" },
    ]);
  });
});
