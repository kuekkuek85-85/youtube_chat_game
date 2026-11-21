// YouTube Data API v3: 라이브 채팅 읽기 (PRD 6-1)
// 인증 우선순위: OAuth(리프레시 토큰) → API 키

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message);
  }
  /** 다시 시도해도 소용없는 오류 (채팅 종료, 할당량 초과, 권한 없음 등) */
  get fatal(): boolean {
    return [
      "liveChatEnded",
      "liveChatDisabled",
      "liveChatNotFound",
      "quotaExceeded",
      "dailyLimitExceeded",
      "forbidden",
      "insufficientPermissions",
      "keyInvalid",
    ].includes(this.reason);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function oauthToken(): Promise<string | null> {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new YouTubeError(res.status, "oauthRefreshFailed", `OAuth 토큰 갱신 실패: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

export function authMode(): "oauth" | "apikey" | "none" {
  if (process.env.YOUTUBE_REFRESH_TOKEN) return "oauth";
  if (process.env.YOUTUBE_API_KEY) return "apikey";
  return "none";
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  const token = await oauthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  else if (process.env.YOUTUBE_API_KEY) url.searchParams.set("key", process.env.YOUTUBE_API_KEY);
  else throw new YouTubeError(0, "noCredentials", "YOUTUBE_API_KEY 또는 OAuth 환경변수가 필요합니다.");

  const res = await fetch(url, { headers });
  if (!res.ok) {
    let reason = "unknown";
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      reason = body.error?.errors?.[0]?.reason ?? reason;
      message = body.error?.message ?? message;
    } catch {}
    throw new YouTubeError(res.status, reason, `${res.status} ${reason}: ${message}`);
  }
  return (await res.json()) as T;
}

/** 영상 ID 또는 URL 에서 영상 ID 를 뽑는다. */
export function parseVideoId(input: string): string {
  const s = input.trim();
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    s.match(/\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  throw new Error(`영상 ID를 알아볼 수 없습니다: ${input}`);
}

/** videos.list (1 unit) 로 activeLiveChatId 를 얻는다. */
export async function getLiveChatId(videoId: string): Promise<{ liveChatId: string; title: string }> {
  const data = await call<{
    items: { snippet?: { title?: string }; liveStreamingDetails?: { activeLiveChatId?: string } }[];
  }>("videos", { part: "liveStreamingDetails,snippet", id: videoId });
  const item = data.items?.[0];
  if (!item) throw new YouTubeError(404, "videoNotFound", `영상을 찾을 수 없습니다: ${videoId}`);
  const liveChatId = item.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId)
    throw new YouTubeError(404, "noActiveLiveChat", "활성 라이브 채팅이 없습니다. 방송이 시작됐는지, 채팅이 켜져 있는지 확인하세요.");
  return { liveChatId, title: item.snippet?.title ?? "" };
}

export interface LiveChatItem {
  id: string;
  snippet: {
    type: string;
    displayMessage?: string;
    publishedAt: string;
    authorChannelId: string;
    textMessageDetails?: { messageText: string };
    superChatDetails?: { userComment?: string };
  };
  authorDetails: {
    channelId: string;
    displayName: string;
    isChatOwner: boolean;
    isChatModerator: boolean;
  };
}

export interface LiveChatPage {
  items: LiveChatItem[];
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  offlineAt?: string;
}

/** liveChatMessages.list (5 units/호출) */
export function listChatMessages(liveChatId: string, pageToken?: string): Promise<LiveChatPage> {
  const params: Record<string, string> = {
    liveChatId,
    part: "id,snippet,authorDetails",
    maxResults: "2000",
  };
  if (pageToken) params.pageToken = pageToken;
  return call<LiveChatPage>("liveChat/messages", params);
}

/** 저장할 메시지만 골라 행으로 바꾼다 (일반 채팅·슈퍼챗 댓글) */
export function toRows(items: LiveChatItem[]) {
  return items
    .map((it) => {
      const text =
        it.snippet.textMessageDetails?.messageText ??
        it.snippet.superChatDetails?.userComment ??
        (it.snippet.type === "textMessageEvent" ? it.snippet.displayMessage : undefined);
      if (!text) return null;
      return {
        id: it.id,
        channel_id: it.authorDetails.channelId || it.snippet.authorChannelId,
        display_name: it.authorDetails.displayName,
        message: text,
        published_at: it.snippet.publishedAt,
        author_role: it.authorDetails.isChatOwner ? "owner" : it.authorDetails.isChatModerator ? "moderator" : "viewer",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 할당량 계산: liveChatMessages.list 는 호출당 5 units, 기본 하루 10,000 units.
 * 주어진 시간(분) 동안 쓸 수 있는 최소 폴링 간격(ms)을 돌려준다. (예비분 reserve 를 남김)
 */
export function minPollIntervalMs(minutes: number, dailyQuota = 10_000, reserve = 1_000, costPerCall = 5): number {
  const calls = Math.floor((dailyQuota - reserve) / costPerCall);
  return Math.ceil((minutes * 60_000) / calls);
}
