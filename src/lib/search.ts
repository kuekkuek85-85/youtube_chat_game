// /gift 닉네임 검색 (화면과 테스트에서 같이 쓴다)
export interface Searchable {
  id: string;
  displayName: string;
  name: string;
}

export const normNick = (s: string) => s.toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

/** 정확히 일치 → 부분 일치 순서로 최대 20개 */
export function searchCharacters<T extends Searchable>(characters: T[], query: string): { matches: T[]; exactCount: number } {
  const q = normNick(query);
  if (!q) return { matches: [], exactCount: 0 };
  const exact = characters.filter((c) => normNick(c.displayName) === q || normNick(c.name) === q);
  const partial = characters.filter((c) => !exact.includes(c) && (normNick(c.displayName).includes(q) || normNick(c.name).includes(q)));
  return { matches: [...exact, ...partial].slice(0, 20), exactCount: exact.length };
}

/**
 * 바로 카드를 보여 줄 대상. 후보가 하나뿐이거나 정확히 일치하는 사람이 딱 한 명일 때만.
 * 같은 닉네임이 여러 명이면 null → 목록에서 본인이 고르게 한다.
 */
export function autoPick<T extends Searchable>(matches: T[], exactCount: number): T | null {
  if (matches.length === 1) return matches[0];
  if (exactCount === 1) return matches[0];
  return null;
}
