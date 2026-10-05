// Candado de solo lectura para los subagentes del chat lateral: decide si una llamada a
// herramienta escribe, envía o cambia algo. Devuelve el motivo del bloqueo, o undefined.
// Heurístico: ataja lo evidente (enviar, borrar, escribir archivos, firmar con un script);
// el aviso del agente le pide además no intentarlo.

const HERRAMIENTAS_PROHIBIDAS = new Set([
  'Write',
  'Edit',
  'NotebookEdit',
  'Agent',
  'Task',
  'Workflow',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'PushNotification',
  'SendMessage',
  'SendUserMessage',
  'SendUserFile',
  'EnterWorktree',
  'ExitWorktree',
  'Artifact',
  'ArtifactData',
  'ArtifactComments',
  'DesignSync',
])

// Acciones de un MCP que cambian estado: enviar, crear, borrar, hacer clic en un navegador...
const MCP_ESCRITURA =
  /(send|draft|create|delete|remove|trash|modify|update|manage|set_|batch|import|copy|move|upload|share|permission|reply|forward|post|write|edit|insert|append|clear|rename|archive|label|auth|click|type|fill|press|select|drag|hover|evaluate|run_code|file_upload|dialog|install|drop|submit|form|execute|exec|publish|pin|sign|firm|pay|transfer)/

// Comandos que, en posición de comando, siempre cambian algo o salen del equipo.
const COMANDOS_PROHIBIDOS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'tee', 'dd', 'chmod', 'chown', 'chflags', 'ln',
  'truncate', 'shred', 'unlink', 'install', 'rsync', 'scp', 'ssh', 'sftp', 'ftp', 'kill', 'pkill',
  'killall', 'launchctl', 'osascript', 'open', 'shortcuts', 'mail', 'sendmail', 'crontab', 'sudo',
  'diskutil', 'pmset', 'networksetup', 'brew', 'npm', 'npx', 'pnpm', 'yarn', 'pip', 'pip3', 'gem',
  'trash', 'shutdown', 'reboot', 'halt', 'xattr', 'lpr', 'lp', 'claude', 'cmux', 'hs', 'adb',
  'automator', 'say', 'tmux', 'screen', 'nohup', 'caffeinate', 'mdutil', 'tccutil', 'csrutil',
  'cmux-browser-here', 'mdlight', 'playwright',
])

const INTERPRETES = new Set(['python', 'python3', 'node', 'ruby', 'perl', 'deno', 'bun', 'php', 'swift'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'dash'])

const CODIGO_ESCRITURA =
  /(open\([^)]*['"][wax+]b?['"]|write_text|write_bytes|\.write\(|unlink|rmtree|os\.remove|os\.rename|os\.replace|os\.makedirs|os\.mkdir|shutil\.|subprocess|os\.system|os\.popen|writeFile|appendFile|fs\.rm|fs\.unlink|child_process|requests\.(post|put|delete|patch)|urlopen\([^)]*data=|smtplib|\.save\(|\.to_csv\(|\.to_excel\(|sqlite3\.connect\([^)]*\)\.execute\([^)]*(insert|update|delete|drop|create))/i

const REDIRECCION = /(^|[^0-9&<>=-])>{1,2}\|?\s*(?!\/dev\/null\b|&)[^\s&|>]/

const base = (palabra: string): string => palabra.replace(/^['"]|['"]$/g, '').split('/').pop() ?? palabra

function motivoBash(comando: string): string | undefined {
  if (REDIRECCION.test(comando.replace(/(['"]).*?\1/g, '""'))) return 'redirige la salida a un archivo'

  // bash -c "..." / sh -c '...': se revisa lo de adentro.
  for (const m of comando.matchAll(/\b(?:bash|sh|zsh|dash)\s+-l?c\s+(['"])([\s\S]*?)\1/g)) {
    const dentro = motivoBash(m[2] ?? '')
    if (dentro) return dentro
  }

  const segmentos = comando.split(/\|\||&&|[;|&\n]|\$\(|`/)
  for (const seg of segmentos) {
    const palabras = seg.trim().split(/\s+/).filter(Boolean)
    while (palabras.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(palabras[0] ?? '')) palabras.shift()
    while (palabras.length && ['command', 'env', 'exec', 'time', 'nice', 'timeout', 'gtimeout'].includes(base(palabras[0] ?? ''))) {
      palabras.shift()
      if (/^\d/.test(palabras[0] ?? '')) palabras.shift()
    }
    const cmd = base(palabras[0] ?? '')
    const resto = palabras.slice(1).join(' ')
    if (!cmd) continue

    if (COMANDOS_PROHIBIDOS.has(cmd)) return `usa \`${cmd}\``
    if (cmd.startsWith('./') || (palabras[0] ?? '').includes('/') && !/^\/(usr\/)?bin\//.test(palabras[0] ?? '') && !/^\/opt\/homebrew\/bin\//.test(palabras[0] ?? ''))
      return 'ejecuta un script'
    if (cmd === 'git' && /^(-C\s+\S+\s+)?(commit|push|add|reset|checkout|switch|restore|rm|mv|stash|merge|rebase|tag|branch|clean|cherry-pick|revert|apply|am|pull|fetch|clone|init|config|worktree|submodule|gc|prune|notes|update-ref|filter-branch)\b/.test(resto))
      return 'modifica el repositorio git'
    if (cmd === 'gh' && !/^(\S+\s+)?(view|list|status|diff|checks|search|browse\s+--no-browser)\b/.test(resto) && !/^api\b(?!.*(-X|--method|-f\b|-F\b|--field|--raw-field|--input))/.test(resto))
      return 'usa gh con una acción que no es de lectura'
    if (cmd === 'curl' && /(\s|^)(-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|-d\b|--data\S*|-F\b|--form\S*|-T\b|--upload-file|-o\b|-O\b|--output)/i.test(` ${resto}`))
      return 'curl con envío de datos o descarga a archivo'
    if (cmd === 'wget') return 'usa wget'
    if ((cmd === 'sed' || cmd === 'gsed') && /(^|\s)(-i|--in-place)/.test(resto)) return 'edita un archivo con sed -i'
    if (cmd === 'perl' && /(^|\s)-\w*i/.test(resto)) return 'edita un archivo con perl -i'
    if (cmd === 'defaults' && /^(write|delete|import|rename)\b/.test(resto)) return 'cambia preferencias del sistema'
    if (cmd === 'security' && /^(add|delete|set|import|create|unlock)/.test(resto)) return 'cambia el llavero'
    if (cmd === 'sqlite3' && /\b(insert|update|delete|drop|create|alter|replace|vacuum|attach)\b/i.test(resto)) return 'modifica una base sqlite'
    if (cmd === 'find' && /(\s|^)(-delete|-exec(dir)?\s+(rm|mv|cp|chmod|chown|sed|perl|tee)\b)/.test(` ${resto}`)) return 'find que borra o modifica'
    if (cmd === 'xargs' && /\b(rm|mv|cp|chmod|chown|sed|perl|tee|kill)\b/.test(resto)) return 'xargs que borra o modifica'
    if (INTERPRETES.has(cmd.replace(/[\d.]+$/, '')) || INTERPRETES.has(cmd)) {
      if (/(^|\s)-c\b|(^|\s)-e\b|(^|\s)--eval\b|(^|\s)-p\b/.test(resto)) {
        if (CODIGO_ESCRITURA.test(resto)) return 'código que escribe o envía'
      } else if (/(^|\s)-m\s+(json\.tool|pydoc|zipfile\s+-l|tarfile\s+-l)\b/.test(resto) || resto === '' || /^--?(version|help)\b/.test(resto)) {
        // lectura
      } else {
        return 'ejecuta un script'
      }
    }
    if (SHELLS.has(cmd) && !/(^|\s)-l?c\b/.test(resto) && resto !== '') return 'ejecuta un script'
  }
  return undefined
}

export function motivoBloqueo(tool: string, input: Record<string, unknown>): string | undefined {
  if (HERRAMIENTAS_PROHIBIDAS.has(tool)) return `usa ${tool}`
  if (tool.startsWith('mcp__')) {
    const accion = tool.split('__').slice(2).join('__').toLowerCase()
    return MCP_ESCRITURA.test(accion) ? `usa ${accion}` : undefined
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const comando = typeof input.command === 'string' ? input.command : ''
    return motivoBash(comando)
  }
  return undefined
}
