@echo off
cd /d "%~dp0"
title 一键上传GitHub并自动编译IPA
python push_to_github.py
pause
