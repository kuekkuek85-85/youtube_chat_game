// 댓글 필터: 개인정보, 욕설·비방, 제외 요청 (PRD 6-2, 8)

export const EXCLUDE_TAG = "#캐릭터제외";

const PII_PATTERNS: RegExp[] = [
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/, // 휴대전화
  /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/, // 일반 전화
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // 이메일
  /\d{6}[-\s]?[1-4]\d{6}/, // 주민등록번호
  /\d{3,6}-\d{2,6}-\d{3,8}/, // 계좌번호 형태
  /(카톡|카카오톡|오픈채팅|텔레그램)\s*(아이디|id|ID)?\s*[:：]/i,
  /open\.kakao\.com/i,
];

// 대표적인 욕설·비방어. 띄어쓰기·특수문자로 쪼갠 경우도 잡도록 비교 전 정규화한다.
const PROFANITY = [
  "시발", "씨발", "씨빨", "ㅅㅂ", "ㅆㅂ", "시바", "씨바", "병신", "ㅂㅅ", "븅신", "좆", "존나", "졸라", "ㅈㄴ",
  "개새", "새끼", "ㅅㄲ", "미친놈", "미친년", "미친새", "닥쳐", "꺼져", "지랄", "ㅈㄹ", "엿먹", "등신", "또라이",
  "fuck", "shit", "bitch", "asshole",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s.\-_*~!@#$%^&()+=|\\/,'"`·ㆍ]/g, "");
}

export function containsPII(text: string): boolean {
  return PII_PATTERNS.some((re) => re.test(text));
}

export function containsProfanity(text: string): boolean {
  const n = normalize(text);
  return PROFANITY.some((w) => n.includes(w));
}

export function wantsExclusion(text: string): boolean {
  return text.replace(/\s/g, "").includes(EXCLUDE_TAG);
}

/** 대표 댓글 후보로 쓸 수 있는지 */
export function isUsableComment(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (containsPII(t) || containsProfanity(t) || wantsExclusion(t)) return false;
  return true;
}
