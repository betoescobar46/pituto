import { expect, test } from 'claude-code/testing'

import { motivoBloqueo } from './guardia'

const bash = (command: string) => motivoBloqueo('Bash', { command })

test('G1: herramientas que escriben o lanzan otros agentes', () => {
  for (const t of ['Write', 'Edit', 'NotebookEdit', 'Agent', 'CronCreate', 'Artifact', 'SendMessage']) {
    expect(motivoBloqueo(t, {})).toBeDefined()
  }
  for (const t of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch', 'Skill']) {
    expect(motivoBloqueo(t, {})).toBeUndefined()
  }
})

test('G2: MCP de correo, WhatsApp, calendario y navegador', () => {
  const prohibidos = [
    'mcp__google-workspace__send_gmail_message',
    'mcp__google-workspace__draft_gmail_message',
    'mcp__google-workspace__manage_event',
    'mcp__google-workspace__modify_gmail_message_labels',
    'mcp__google-workspace__create_drive_file',
    'mcp__google-workspace__set_drive_file_permissions',
    'mcp__google-workspace__start_google_auth',
    'mcp__whatsapp__send_message',
    'mcp__whatsapp__send_file',
    'mcp__whatsapp__send_audio_message',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_type',
    'mcp__playwright__browser_fill_form',
    'mcp__playwright__browser_evaluate',
    'mcp__claude_ai_Claude_Docs__create',
    'mcp__claude_ai_Claude_Docs__batch',
  ]
  for (const t of prohibidos) expect([t, motivoBloqueo(t, {})]).toEqual([t, expect.any(String)])
  const permitidos = [
    'mcp__google-workspace__search_gmail_messages',
    'mcp__google-workspace__get_gmail_message_content',
    'mcp__google-workspace__get_gmail_thread_content',
    'mcp__google-workspace__get_events',
    'mcp__google-workspace__list_calendars',
    'mcp__google-workspace__search_drive_files',
    'mcp__google-workspace__get_drive_file_content',
    'mcp__whatsapp__list_messages',
    'mcp__whatsapp__search_contacts',
    'mcp__whatsapp__get_chat',
    'mcp__whatsapp__list_chats',
    'mcp__whatsapp__get_last_interaction',
    'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_navigate',
    'mcp__claude_ai_Claude_Docs__read',
    'mcp__pubmed__search_articles',
  ]
  for (const t of permitidos) expect([t, motivoBloqueo(t, {})]).toEqual([t, undefined])
})

test('G3: Bash que escribe, borra, envía o ejecuta scripts', () => {
  const prohibidos = [
    'rm -rf /tmp/x',
    'echo hola > a.txt',
    'echo hola >> ~/notas.md',
    'cat a | tee b',
    'mv a b',
    'cp a b',
    'mkdir nueva',
    'touch x',
    "osascript -e 'tell application \"Messages\" to send \"hola\"'",
    'open https://example.com',
    'curl -X POST https://api.x/y -d "{}"',
    'curl -s https://x/y -o salida.pdf',
    'git push',
    'git -C /repo commit -m x',
    'git checkout main',
    'gh pr create --fill',
    'gh issue comment 3 --body x',
    'gh api repos/x/y -X DELETE',
    "sed -i '' 's/a/b/' f.txt",
    'find . -name "*.tmp" -delete',
    'find . -name x -exec rm {} \\;',
    'ls | xargs rm',
    'sqlite3 db.sqlite "delete from t"',
    'python3 utils/ecert_firmar.py doc.pdf',
    'node scripts/enviar.mjs',
    './deploy.sh',
    'bash script.sh',
    "bash -c 'rm -rf x'",
    "python3 -c \"open('x.txt','w').write('a')\"",
    "python3 -c 'import subprocess; subprocess.run([\"ls\"])'",
    "python3 -c 'import requests; requests.post(\"https://x\")'",
    'claude -p "haz algo"',
    'defaults write com.apple.dock autohide -bool true',
    'security delete-generic-password -s x',
    'kill 123',
    'sudo ls',
    'npm install x',
    'FOO=1 rm x',
    'cd /tmp && rm x',
    'ls; rm x',
    'echo $(rm x)',
    '/Users/me/.local/bin/open-browser https://x',
    'wget https://x',
  ]
  for (const c of prohibidos) expect([c, bash(c)]).toEqual([c, expect.any(String)])
})

test('G3: Bash de lectura pasa', () => {
  const permitidos = [
    'ls -la',
    'grep -rn "Cintya" . 2>/dev/null',
    'find . -maxdepth 1 -name "*.md" | wc -l',
    'cat archivo.md | head -50',
    'pdftotext informe.pdf - | head',
    'git log --oneline -5',
    'git status',
    'git diff HEAD~1',
    'gh pr view 12',
    'gh api repos/x/y',
    'curl -s https://api.ejemplo.cl/estado',
    'python3 -c "import json,sys; print(json.load(open(\'a.json\'))[\'x\'])"',
    'python3 -m json.tool a.json',
    'sqlite3 ~/chat-mcp/store/messages.db "select count(*) from messages"',
    'jq ".items[] | select(.x > 3)" a.json',
    'echo hola 2>&1',
    'ls > /dev/null',
    'date',
    'mdfind -name informe',
    'wc -l *.md',
    'head -c 300 /tmp/x.txt',
    'awk \'{print $1}\' a.txt',
    'sort a | uniq -c',
    '/usr/bin/python3 -c "print(1)"',
    'bash -c "ls -la"',
  ]
  for (const c of permitidos) expect([c, bash(c)]).toEqual([c, undefined])
})
