# -*- coding: utf-8 -*-
"""
自动将 AI-Voice-Agent 工程推送到用户 GitHub 仓库并触发云端 IPA 自动打包流水线
"""

import sys, os, subprocess, requests, json, pyperclip, time

sys.stdout.reconfigure(encoding='utf-8')

print("=" * 60)
print(" 🚀 AI-Voice-Agent: 一键上传 GitHub 并自动构建 iPad Pro IPA ")
print("=" * 60)

# 1. 获取 GitHub Token
token = ""
cb = pyperclip.paste().strip()
if cb.startswith("ghp_") or cb.startswith("github_pat_"):
    print(f"检测到剪贴板中已存在有效的 GitHub Token (前缀: {cb[:10]}...)")
    use_cb = input("是否直接使用剪贴板中的 Token？(Y/n): ").strip().lower()
    if use_cb != 'n':
        token = cb

while not token:
    token = input("\n请右键粘贴您的 GitHub Token: ").strip()
    if not token:
        print("Token 不能为空，请重新输入。")

# 2. 验证 Token 有效性并获取用户名
headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "AI-Voice-Tutor-Builder"
}

print("\n正在验证 GitHub Token 并获取账户信息...")
r = requests.get("https://api.github.com/user", headers=headers, timeout=15)
if not r.ok:
    # 尝试 Bearer
    headers["Authorization"] = f"Bearer {token}"
    r = requests.get("https://api.github.com/user", headers=headers, timeout=15)

if not r.ok:
    print(f"❌ Token 验证失败 (HTTP {r.status_code}): {r.text}")
    print("请确认 Token 是否复制完整或是否重新生成。")
    input("\n按回车键退出...")
    sys.exit(1)

user_data = r.json()
username = user_data.get("login")
print(f"✔ 登录成功！GitHub 账号: {username} ({user_data.get('name') or username})")

# 3. 检查或创建仓库 ai-voice-tutor
repo_name = "ai-voice-tutor"
repo_url = f"https://api.github.com/repos/{username}/{repo_name}"

while True:
    repo_r = requests.get(repo_url, headers=headers, timeout=15)
    if repo_r.status_code == 200:
        print(f"\n✔ 成功连接到仓库: {username}/{repo_name}")
        break

    print(f"\n正在尝试自动在 GitHub 创建私有仓库 [{repo_name}]...")
    create_payload = {
        "name": repo_name,
        "private": True,
        "description": "AI 英语智能语音通话伴学伙伴 (支持 iPad Pro 原生 IPA 构建)"
    }
    create_r = requests.post("https://api.github.com/user/repos", headers=headers, json=create_payload, timeout=15)
    
    if create_r.status_code in [200, 201]:
        print("✔ 私有仓库创建成功！")
        break
    else:
        # Fine-grained token 无法通过 API 建库时的友好引导
        print("\n" + "-" * 55)
        print("💡 提示：因为您生成的是细粒度 Token (github_pat_)，GitHub")
        print("   安全策略要求在网页上直接新建仓库：")
        print(f"   👉 请在浏览器打开: https://github.com/new")
        print(f"   👉 仓库名称 (Repository name) 输入: {repo_name}")
        print("   👉 勾选 Private，然后点击绿色的【Create repository】按钮！")
        print("-" * 55)
        
        try:
            import webbrowser
            webbrowser.open("https://github.com/new")
        except:
            pass

        input(f"\n在网页上创建好 [{repo_name}] 后，请按回车键继续...")

# 4. 本地 Git 初始化与推送
workdir = r"C:\Users\mao\Desktop\AI-Voice-Agent"
os.chdir(workdir)

print("\n正在同步本地工程并推送到 GitHub...")

def run_git(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8')
    return res.returncode, res.stdout, res.stderr

run_git("git init")
run_git("git branch -M main")
run_git(f'git config user.name "{username}"')
run_git(f'git config user.email "{user_data.get("email") or username + "@users.noreply.github.com"}"')

gitignore_path = os.path.join(workdir, ".gitignore")
with open(gitignore_path, "w", encoding="utf-8") as f:
    f.write("node_modules/\n.tmp*/\n*.log\n")

run_git("git add .")
run_git('git commit -m "feat: complete iPad Pro AI voice agent with cloud IPA build"')

remote_push_url = f"https://{token}@github.com/{username}/{repo_name}.git"
run_git("git remote remove origin")
run_git(f"git remote add origin {remote_push_url}")

print("正在推送代码至 GitHub (请稍候)...")
code, out, err = run_git("git push -u origin main --force")

if code != 0:
    print("❌ Git 推送遇到问题:")
    print(err or out)
    input("\n按回车键退出...")
    sys.exit(1)

actions_url = f"https://github.com/{username}/{repo_name}/actions"
print("\n" + "=" * 60)
print("🎉 代码已成功推送到 GitHub！")
print(f"🚀 已自动触发云端 macOS 打包流水线 (Build iPad Pro IPA)！")
print(f"👉 实时打包进度与下载地址: {actions_url}")
print("=" * 60)

try:
    import webbrowser
    webbrowser.open(actions_url)
    print("\n已为您在浏览器中自动打开打包进度页面！")
except:
    pass

input("\n按回车键关闭本窗口...")
