import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import type { AssembleContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import { apply, modeFromEvents } from '@pascapone/dsh-ponytail'

function session(events: SessionEvent[] = []) { return { seq: events.length, snapshotEvents: () => events } }
const run = (id: string, args: string) => ({ type: 'command/run', data: { commandId: id, name: 'ponytail', args } } as SessionEvent<'command/run'>)
const done = (id: string, kind: 'success' | 'error' = 'success') => ({ type: 'command/done', data: { commandId: id, kind } } as SessionEvent<'command/done'>)

test('mode changes only on successful, paired commands, and stays session-local', () => {
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a')], 'full'), 'ultra')
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a', 'error')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' ultra')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' invalid'), done('a')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a'), run('b', ' off'), done('b')], 'full'), 'off')
  assert.equal(modeFromEvents([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'normal mode!' }] } } as unknown as SessionEvent<'user/message'>], 'full'), 'off')
  assert.equal(modeFromEvents([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'add a normal mode toggle' }] } } as unknown as SessionEvent<'user/message'>], 'full'), 'full')
})

test('registers six upstream skills and six DSH commands, and injects original rules', () => {
  const registered = { skills: [], commands: [] } as unknown as {
    skills: SkillRegistration[]
    commands: CommandDefinition[]
    section: PromptSection & { text(context: AssembleContext): string }
  }
  const ctx = {
    skills: { register: (entry: SkillRegistration) => registered.skills.push(entry) },
    commands: { register: (entry: CommandDefinition) => registered.commands.push(entry) },
    systemPrompt: {
      getSectionOrder: (name: string) => { assert.equal(name, 'DEPLOYMENT_PERSONA_SUFFIX'); return 10200 },
      section: (entry: typeof registered.section) => { registered.section = entry },
    },
  }
  apply(ctx as unknown as Context)
  assert.deepEqual(registered.skills.map(entry => entry.name), registered.commands.map(entry => entry.name))
  assert.equal(registered.skills.length, 6)
  assert.equal(registered.section.order, 10300)
  assert.equal(registered.section.complete, undefined)
  assert.equal(registered.section.interpolate, false)
  assert.match(registered.section.text({ agent: { session: session() } } as unknown as AssembleContext), /PONYTAIL MODE ACTIVE — level: full/)
  const off = session([run('x', ' off'), done('x')])
  assert.equal(registered.section.text({ agent: { session: off } } as unknown as AssembleContext), '')
  const ultra = session([run('x', ' ultra'), done('x')])
  assert.match(registered.section.text({ agent: { session: ultra } } as unknown as AssembleContext), /level: ultra/)
  const mode = registered.commands[0]
  assert.equal((mode.handler({ agent: { session: session() }, rawInput: ' bogus' } as unknown as CommandInvocation) as CommandResult).kind, 'error')
  assert.equal((mode.handler({ agent: { session: session() }, rawInput: ' off' } as unknown as CommandInvocation) as CommandResult).kind, 'success')
  let message!: Parameters<Agent['steer']>[0]
  registered.commands[1].handler({ agent: { steer: (value: typeof message) => { message = value } }, rawInput: '' } as unknown as CommandInvocation)
  assert.match((message.content[0] as { text: string }).text, /Review diffs for unnecessary complexity/)
})
