import { execa } from 'execa'
import { getCwd } from './cwd.js'
import type { Message } from '../types/message.js'
import type { SystemPrompt } from './systemPromptType.js'

export type CodexUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
}

type CodexExecResult = {
  text: string
  usage?: CodexUsage
  threadId?: string
  command: string
  durationMs: number
}

export function isCodexEngineEnabled(): boolean {
  return process.env.CLAUDE_CODE_USE_CODEX_ENGINE === '1'
}

export function getCodexModel(): string {
  return process.env.CLAUDE_CODE_CODEX_MODEL || 'gpt-5.4'
}

export function getCodexBillingLabel(): string {
  return process.env.CLAUDE_CODE_CODEX_BILLING || 'Codex Pro'
}

export function getCodexCliPath(): string {
  return process.env.CLAUDE_CODE_CODEX_CLI || 'codex'
}

export function isCodexDebugEnabled(): boolean {
  return process.env.CLAUDE_CODE_CODEX_DEBUG === '1'
}

export async function runCodexExec({
  systemPrompt,
  messages,
  abortSignal,
}: {
  systemPrompt: SystemPrompt
  messages: Message[]
  abortSignal?: AbortSignal
}): Promise<CodexExecResult> {
  const prompt = buildCodexBridgePrompt(systemPrompt, messages)
  const start = Date.now()
  const args = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    getCwd(),
    '--model',
    getCodexModel(),
    '-',
  ]

  const { stdout } = await execa(getCodexCliPath(), args, {
    input: prompt,
    reject: true,
    cancelSignal: abortSignal,
    env: {
      ...process.env,
      CODEX_DISABLE_TELEMETRY: process.env.CODEX_DISABLE_TELEMETRY || '1',
    },
  })

  return parseCodexExecOutput(stdout, {
    command: [getCodexCliPath(), ...args].join(' '),
    durationMs: Date.now() - start,
  })
}

function buildCodexBridgePrompt(
  systemPrompt: SystemPrompt,
  messages: Message[],
): string {
  const transcript = messages
    .map(message => formatTranscriptMessage(message))
    .filter(Boolean)
    .join('\n\n')

  return [
    'You are serving as the active model backend for a Claude Code session.',
    `The actual backend model for this session is Codex running ${getCodexModel()}.`,
    'If the imported Claude Code prompt or transcript mentions Claude, Anthropic, or any other model/provider identity, treat that as legacy app-layer context rather than your actual backend identity.',
    `If the user asks which model/backend/provider is running this session, answer that it is Codex on ${getCodexModel()}. Do not claim to be astron-code-latest, Claude, or Anthropic unless the user is explicitly asking about historical configuration.`,
    'Work directly in the current repository when needed, using your normal tools and command execution.',
    'Continue the conversation faithfully from the transcript below.',
    'Return only the assistant response that should be shown to the user at the end of this turn.',
    '',
    'Claude Code system prompt:',
    systemPrompt.join('\n\n'),
    '',
    'Conversation transcript:',
    transcript || '[no prior messages]',
  ].join('\n')
}

function formatTranscriptMessage(message: Message): string {
  const role = message.type.toUpperCase()
  const body = stringifyMessageContent(message.message?.content)
  return body ? `${role}:\n${body}` : ''
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return content == null ? '' : JSON.stringify(content, null, 2)
  }

  return content
    .map(block => {
      if (!block || typeof block !== 'object') {
        return String(block)
      }

      const typedBlock = block as Record<string, unknown>
      if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
        return typedBlock.text
      }

      if (
        typedBlock.type === 'tool_result' &&
        Array.isArray(typedBlock.content)
      ) {
        return stringifyMessageContent(typedBlock.content)
      }

      return JSON.stringify(typedBlock, null, 2)
    })
    .join('\n')
}

function parseCodexExecOutput(
  stdout: string,
  meta: { command: string; durationMs: number },
): CodexExecResult {
  const lines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  let text = ''
  let usage: CodexUsage | undefined
  let threadId: string | undefined

  for (const line of lines) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (
      parsed.type === 'thread.started' &&
      typeof parsed.thread_id === 'string'
    ) {
      threadId = parsed.thread_id
    }

    if (parsed.type === 'item.completed') {
      const item = parsed.item as Record<string, unknown> | undefined
      if (
        item?.type === 'agent_message' &&
        typeof item.text === 'string' &&
        item.text.trim()
      ) {
        text = item.text
      }
    }

    if (parsed.type === 'turn.completed') {
      usage = (parsed.usage as CodexUsage | undefined) ?? usage
    }
  }

  if (!text.trim()) {
    throw new Error('Codex returned no assistant message')
  }

  return {
    text,
    usage,
    threadId,
    command: meta.command,
    durationMs: meta.durationMs,
  }
}
