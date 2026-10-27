@echo off
cd /d "%~dp0"
title AI 英语智能语音通话伴学伙伴
echo ====================================================
echo   正在启动 AI 英语智能语音通话伙伴...
echo   服务地址: http://localhost:3000
echo ====================================================
start "" http://localhost:3000
node server.js
pause
