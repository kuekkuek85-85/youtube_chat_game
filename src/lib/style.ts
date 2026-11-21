// 캐릭터 스타일과 금지어를 한곳에 고정한다. (PRD 6-3)
// 이미지 프롬프트에는 닉네임·캐릭터 이름을 넣지 않는다. 외형 키워드와 성격만 넣는다.

export const BRAND = {
  lime: "#D4FF2A",
  green: "#B4EFA0",
  dark: "#0A0D0C",
} as const;

/** 이미지마다 똑같이 붙는 스타일 문장 */
export const STYLE_PROMPT = [
  "An original cute 2D mascot character, newly designed, not based on any existing franchise.",
  "Flat vector illustration, thick clean outlines, simple rounded shapes, big friendly eyes, chibi proportions, full body, centered, facing the viewer.",
  `Color palette built around lime ${BRAND.lime}, soft green ${BRAND.green} and near-black ${BRAND.dark} accents.`,
  "Plain single-color pastel background, square composition, generous margin around the character.",
  "No text, no letters, no logos, no watermark, no real human face, not a photograph.",
].join(" ");

/**
 * 프롬프트에 들어가면 안 되는 기존 작품명·캐릭터 이름.
 * "핑"이라는 글자 자체는 허용(○○핑 이름은 쓰되, 이미지 프롬프트에는 이름을 넣지 않음).
 */
export const BANNED_TERMS: string[] = [
  // 티니핑 시리즈
  "티니핑", "캐치티니핑", "하츄핑", "바로핑", "차차핑", "라라핑", "해핑", "아자핑", "키키핑",
  "조아핑", "믿어핑", "꾸래핑", "포실핑", "방글핑", "베베핑", "똑똑핑", "시러핑", "악동핑",
  "teenieping", "tiniping", "tinyping", "heartsping",
  // 그 밖의 유명 캐릭터·작품
  "포켓몬", "피카츄", "pokemon", "pokémon", "pikachu",
  "산리오", "헬로키티", "쿠로미", "마이멜로디", "시나모롤", "폼폼푸린", "sanrio", "hello kitty", "kuromi", "my melody", "cinnamoroll",
  "디즈니", "미키마우스", "disney", "mickey mouse",
  "뽀로로", "pororo", "짱구", "crayon shin-chan", "도라에몽", "doraemon", "스누피", "snoopy",
  "미니언", "minion", "카카오프렌즈", "춘식이", "라인프렌즈", "kakao friends", "line friends",
  "펭수", "잔망루피", "둘리", "몰랑", "커비", "kirby", "마리오", "mario", "젤다", "zelda",
  "지브리", "토토로", "ghibli", "totoro", "산리오캐릭터즈",
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BANNED_RE = new RegExp(BANNED_TERMS.map(escapeRegExp).join("|"), "gi");

export function containsBannedTerm(text: string): boolean {
  BANNED_RE.lastIndex = 0;
  return BANNED_RE.test(text);
}

/** 금지어를 지우고 공백을 정리한다. */
export function stripBannedTerms(text: string): string {
  return text.replace(BANNED_RE, "").replace(/\s{2,}/g, " ").trim();
}

/** 닉네임 정리: 앞의 @ 제거, 공백·특수문자 정리 */
export function cleanNickname(displayName: string): string {
  return displayName
    .replace(/^@+/, "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 캐릭터 이름 = 닉네임 + "핑" (이미 핑으로 끝나면 그대로). 너무 길면 자른다. */
export function characterName(displayName: string): string {
  let base = cleanNickname(displayName);
  if (base.length > 12) base = base.slice(0, 12);
  if (!base) base = "익명";
  return base.endsWith("핑") ? base : `${base}핑`;
}

export interface CharacterProfile {
  personality: string;
  look: string[];
  quote: string;
}

/** 이미지 프롬프트를 만든다. 금지어는 여기서 한 번 더 걸러낸다. */
export function buildImagePrompt(profile: Pick<CharacterProfile, "personality" | "look">): string {
  const look = profile.look.map(stripBannedTerms).filter(Boolean).slice(0, 3);
  const personality = stripBannedTerms(profile.personality);
  const prompt = [
    STYLE_PROMPT,
    look.length ? `Distinctive features: ${look.join(", ")}.` : "",
    personality ? `Personality to express through pose and expression: ${personality}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (containsBannedTerm(prompt)) throw new Error("banned term leaked into image prompt");
  return prompt;
}
