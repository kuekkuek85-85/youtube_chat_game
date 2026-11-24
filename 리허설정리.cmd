@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 리허설 데이터 정리

echo ============================================================
echo   리허설 데이터 정리 (본방송 전에만 쓰세요)
echo ============================================================
echo.
echo   먼저 수집기 창과 캐릭터 생성기 창을 모두 닫으세요.
echo   본방송이 시작된 뒤에 실행하면 본방송 데이터도 지워집니다.
echo.

if not exist ".env.local" (
  echo [오류] .env.local 파일이 없습니다.
  goto end
)

call npm run reset --silent
if errorlevel 1 goto end

echo.
choice /c YN /n /m "위 내용을 모두 지울까요? 지우려면 Y, 그만두려면 N: "
if errorlevel 2 (
  echo 아무것도 지우지 않았습니다.
  goto end
)
call npm run reset --silent -- --yes

:end
echo.
echo 아무 키나 누르면 창이 닫힙니다.
pause >nul
