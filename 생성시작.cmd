@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 캐릭터 생성 도우미 - 창을 닫지 마세요

echo ============================================================
echo   방송 중 캐릭터 생성 도우미
echo ============================================================
echo.
echo   - 수집기(수집시작.cmd)를 켠 뒤, 방송이 시작되면 이 창도 켜 두세요.
echo   - 5분마다 새로 채팅한 사람의 캐릭터를 만듭니다. (#캐릭터제외 자동 반영)
echo   - 만들어진 카드는 /admin 에서 틈틈이 승인하세요.
echo   - 마감 시각을 넣으면 그 시각에 마지막으로 한 번 더 만들고 끝납니다.
echo   - 끝내려면 Ctrl+C 를 두 번 누르세요.
echo.

if not exist ".env.local" (
  echo [오류] .env.local 파일이 없습니다. 이 파일이 있는 폴더에서 실행하세요.
  goto end
)

<nul set /p "=마감 시각 (예: 20:40, 없으면 그냥 Enter): "
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\live-start.ps1"

:end
echo.
echo 생성 도우미가 끝났습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
