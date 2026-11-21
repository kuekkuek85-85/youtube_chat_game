/**
 * /admin "수집 상태" 표시용.
 * 수집기 프로세스가 강제 종료(창 닫기, 작업 끝내기, 절전)되면 settings 에 "running" 이 남는다.
 * 마지막 폴링이 오래됐으면 실제로는 멈춘 것으로 보여 준다.
 */
export const STALE_AFTER_MS = 90_000; // 폴링 간격(최대 수십 초) + 여유

export interface CollectorView {
  label: string;
  tone: "ok" | "warn" | "idle";
}

export function collectorView(status: string | undefined, lastPoll: string | undefined, now = Date.now()): CollectorView {
  if (!status) return { label: "-", tone: "idle" };
  const age = lastPoll ? now - new Date(lastPoll).getTime() : Infinity;

  if (status === "running") {
    return age > STALE_AFTER_MS ? { label: "멈춤 (응답 없음)", tone: "warn" } : { label: "수집 중", tone: "ok" };
  }
  if (status.startsWith("retrying")) {
    return age > STALE_AFTER_MS * 2 ? { label: "멈춤 (응답 없음)", tone: "warn" } : { label: "재시도 중", tone: "warn" };
  }
  if (status.startsWith("waiting")) return { label: "방송 시작 대기", tone: "idle" };
  if (status === "finished") return { label: "끝남", tone: "idle" };
  if (status.startsWith("stopped:")) return { label: `멈춤: ${status.slice(8).trim()}`, tone: "warn" };
  if (status.startsWith("crashed:")) return { label: "오류로 종료", tone: "warn" };
  return { label: status, tone: "idle" };
}
