import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, modeFromEvents } from './index.js'

function session(events = []) { return { seq: events.length, snapshotEvents: () => events } }
const run = (id, args) => ({ type: 'command/run', data: { commandId: id, name: 'ponytail', args } })
const done = (id, kind = 'success') => ({ type: 'command/done', data: { commandId: id, kind } })

test('mode changes only on successful, paired commands, and stays session-local', () => {
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a')], 'full'), 'ultra')
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a', 'error')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' ultra')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' invalid'), done('a')], 'full'), 'full')
  assert.equal(modeFromEvents([run('a', ' ultra'), done('a'), run('b', ' off'), done('b')], 'full'), 'off')
  assert.equal(modeFromEvents([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'normal mode!' }] } }], 'full'), 'off')
  assert.equal(modeFromEvents([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'add a normal mode toggle' }] } }], 'full'), 'full')
})

test('registers six upstream skills and six DSH commands, and injects original rules', () => {
  const registered = { skills: [], commands: [] }
  const ctx = {
    skills: { register: entry => registered.skills.push(entry) },
    commands: { register: entry => registered.commands.push(entry) },
    systemPrompt: {
      getSectionOrder: name => { assert.equal(name, 'DEPLOYMENT_PERSONA_SUFFIX'); return 10200 },
      section: entry => { registered.section = entry },
    },
  }
  apply(ctx)
  assert.deepEqual(registered.skills.map(entry => entry.name), registered.commands.map(entry => entry.name))
  assert.equal(registered.skills.length, 6)
  assert.equal(registered.section.order, 10300)
  assert.equal(registered.section.complete, undefined)
  assert.equal(registered.section.interpolate, false)
  assert.match(registered.section.text({ agent: { session: session() } }), /PONYTAIL MODE ACTIVE — level: full/)
  const off = session([run('x', ' off'), done('x')])
  assert.equal(registered.section.text({ agent: { session: off } }), '')
  const ultra = session([run('x', ' ultra'), done('x')])
  assert.match(registered.section.text({ agent: { session: ultra } }), /level: ultra/)
  const mode = registered.commands[0]
  assert.equal(mode.handler({ agent: { session: session() }, rawInput: ' bogus' }).kind, 'error')
  assert.equal(mode.handler({ agent: { session: session() }, rawInput: ' off' }).kind, 'success')
  let message
  registered.commands[1].handler({ agent: { steer: value => { message = value } }, rawInput: '' })
  assert.match(message.content[0].text, /Review diffs for unnecessary complexity/)
})
