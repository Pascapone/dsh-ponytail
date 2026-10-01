import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'

type Mode = 'off' | 'lite' | 'full' | 'ultra'
// The pinned upstream CommonJS hooks do not ship TypeScript declarations.
type ConfigHooks = {
  getDefaultMode(): Mode
  normalizeMode(input: unknown): Mode | null
  isDeactivationCommand(text: string): boolean
}

// The npm root export is an OpenCode adapter, not a Cordis plugin. Resolve the
// pinned package and consume its actual instruction builder and six skill files.
const require = createRequire(import.meta.url)
const packageRoot = resolve(dirname(require.resolve('@dietrichgebert/ponytail')), '..', '..')
const { getDefaultMode, normalizeMode, isDeactivationCommand } = require(join(packageRoot, 'hooks/ponytail-config.js')) as ConfigHooks
const { getPonytailInstructions } = require(join(packageRoot, 'hooks/ponytail-instructions.js')) as { getPonytailInstructions(mode: Mode): string }
const names = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help']
const defaultMode = getDefaultMode()

function skill(name: string): SkillRegistration {
  const path = join(packageRoot, 'skills', name, 'SKILL.md')
  const text = readFileSync(path, 'utf8')
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!frontmatter) throw new Error(`Ponytail skill ${name} has no frontmatter`)
  const description = frontmatter[1].match(/^description:\s*>\s*\r?\n((?:[ \t]+[^\r\n]*\r?\n)+)/m)
  if (!description) throw new Error(`Ponytail skill ${name} has no description`)
  return {
    name,
    description: description[1].split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' '),
    content: text,
    path,
    source: 'runtime',
    resourceBase: { kind: 'directory', path: dirname(path) },
    invocation: { modelInvocable: true, userInvocable: true },
  }
}

const skills = new Map(names.map(name => [name, skill(name)]))

// A command lifecycle is the durable authority for mode changes. No cross-
// conversation flag file and no invented Session event type are necessary.
export function modeFromEvents(events: readonly SessionEvent[], initial: Mode = defaultMode): Mode {
  let mode = initial
  const pending = new Map<CommandId, string | undefined>()
  for (const event of events) {
    if (event.type === 'command/run' && event.data.name === 'ponytail') {
      pending.set(event.data.commandId, event.data.args)
    } else if (event.type === 'command/done' && pending.has(event.data.commandId)) {
      const input = pending.get(event.data.commandId)
      pending.delete(event.data.commandId)
      if (event.data.kind === 'success' && input !== undefined) {
        mode = normalizeMode(input.trim()) || mode
      }
    } else if (event.type === 'user/message' && event.data.source?.kind === 'user') {
      const blocks = event.data.content
      if (blocks?.length === 1 && blocks[0].type === 'text' && isDeactivationCommand(blocks[0].text)) mode = 'off'
    }
  }
  return mode
}

export const inject = ['skills', 'systemPrompt', 'commands']

export function apply(ctx: Context): void {
  const cache = new WeakMap<Session, { seq: Session['seq']; mode: Mode }>()
  function current(session: Session): Mode {
    const previous = cache.get(session)
    if (previous?.seq === session.seq) return previous.mode
    // ponytail: one O(n) replay per new log cursor; use a session projection if very long sessions make this measurable.
    const mode = modeFromEvents(session.snapshotEvents(), defaultMode)
    cache.set(session, { seq: session.seq, mode })
    return mode
  }

  ctx.systemPrompt.section({
    name: 'ponytail:rules',
    // Append after DSH's Web-surface guidance and deployment persona suffix.
    // Never shadow a DSH-owned section or designate this as a complete prompt.
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 100,
    interpolate: false,
    text: ({ agent }) => {
      if (!agent) return ''
      const mode = current(agent.session)
      return mode === 'off' ? '' : getPonytailInstructions(mode)
    },
  })

  for (const entry of skills.values()) ctx.skills.register(entry)

  ctx.commands.register({
    name: 'ponytail',
    description: 'Show or change Ponytail intensity (lite/full/ultra/off)',
    input: { hint: '[lite|full|ultra|off]' },
    handler: ({ agent, rawInput }) => {
      const input = rawInput.trim().toLowerCase()
      if (!input) return { kind: 'success', text: `Ponytail: ${current(agent.session)}. Use /ponytail lite|full|ultra|off.` }
      const mode = normalizeMode(input)
      if (!mode) return { kind: 'error', text: 'Expected /ponytail lite|full|ultra|off.' }
      // command/done is appended by DSH after the handler returns; next step
      // reads the successful paired run rather than a transient process flag.
      return { kind: 'success', text: `Ponytail ${mode} (effective from the next step in this session).` }
    },
  })

  for (const name of names.slice(1)) {
    const entry = skills.get(name)!
    ctx.commands.register({
      name,
      description: entry.description,
      handler: ({ agent, rawInput }) => {
        if (rawInput.trim()) return { kind: 'error', text: `/${name} takes no arguments.` }
        // These skills are model tasks, not host-side scripts. The durable
        // followup lets the model use DSH's own tools on the actual workspace.
        agent.steer(createMessage({
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: `Apply the upstream Ponytail skill ${name} to the current workspace.\n\n${entry.content}` }],
        }))
        return { kind: 'success', text: `Started /${name}.` }
      },
    })
  }
}
