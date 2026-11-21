/**
 * API 키로 라이브 채팅을 읽지 못할 때만 사용: 방송 채널(교육청 계정) 관리자 OAuth 리프레시 토큰 발급
 *
 * 1) Google Cloud Console > 사용자 인증 정보 > OAuth 클라이언트 ID 만들기 > 유형 "데스크톱 앱"
 * 2) .env.local 에 YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET 입력
 * 3) npm run youtube:oauth → 브라우저에서 방송 채널 계정으로 로그인·허용
 * 4) 출력된 YOUTUBE_REFRESH_TOKEN 을 .env.local 에 붙여 넣기
 *
 * 권한 범위는 읽기 전용(youtube.readonly)입니다.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(".env.local 에 YOUTUBE_CLIENT_ID 와 YOUTUBE_CLIENT_SECRET 을 먼저 넣으세요.");
  process.exit(2);
}

const port = 53682;
const redirectUri = `http://127.0.0.1:${port}/callback`;
const state = randomBytes(16).toString("hex");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/youtube.readonly",
  access_type: "offline",
  prompt: "consent",
  state,
}).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirectUri);
  if (url.pathname !== "/callback") return res.writeHead(404).end();
  if (url.searchParams.get("state") !== state) return res.writeHead(400).end("state mismatch");
  const code = url.searchParams.get("code");
  if (!code) return res.writeHead(400).end(url.searchParams.get("error") ?? "no code");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const json = (await tokenRes.json()) as { refresh_token?: string; error?: string };
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<p>완료! 터미널로 돌아가세요.</p>");
  if (json.refresh_token) {
    console.log("\n.env.local 에 아래 줄을 추가하세요:\n");
    console.log(`YOUTUBE_REFRESH_TOKEN=${json.refresh_token}\n`);
  } else {
    console.error("리프레시 토큰을 받지 못했습니다:", json);
  }
  server.close();
});

server.listen(port, "127.0.0.1", () => {
  console.log("브라우저에서 아래 주소를 열고, 방송 채널 계정으로 로그인해 허용하세요:\n");
  console.log(authUrl.toString());
});
