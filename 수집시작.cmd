@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title 댓글 수집기 - 창을 닫지 마세요

:: 캐릭터 생성 도우미 마감 시각 (이 시각에 마지막 회차를 돌고 끝남). 바꾸려면 여기만 고치세요.
set "GEN_UNTIL=20:50"

echo ============================================================
echo   유튜브 라이브 댓글 수집기
echo ============================================================
echo.
echo   - 방송 시작 10분 전(18:50)에 켜 두세요.
echo   - 방송 전에는 "활성 라이브 채팅이 없습니다"가 10초마다 나옵니다. 정상입니다.
echo   - 수집기가 멈추면 자동으로 다시 켜지고, 멈춘 곳부터 이어 받습니다.
echo   - 노트북 절전 모드를 꺼 두세요. 이 창을 닫으면 수집이 멈춥니다.
echo   - 끝내려면 Ctrl+C 를 두 번 누르세요. (채팅이 닫히면 스스로 끝납니다)
echo.
echo   * 캐릭터 생성 도우미 창도 자동으로 하나 더 열립니다. 두 창 모두 닫지 마세요.
echo     5분마다 새로 채팅한 사람의 캐릭터를 만들고, !GEN_UNTIL! 에 마지막으로 만든 뒤 끝납니다.
echo.

if not exist ".env.local" (
  echo [오류] .env.local 파일이 없습니다. 이 파일이 있는 폴더에서 실행하세요.
  goto end
)

:: 주소 입력은 PowerShell 이 받는다 (cmd 의 set /p 는 UTF-8 콘솔에서 불안정)
<nul set /p "=유튜브 영상 주소(또는 영상 ID)를 붙여 넣고 Enter: "
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\collect-forever.ps1" -GenerateUntil !GEN_UNTIL!

:end
echo.
echo 수집기가 끝났습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
