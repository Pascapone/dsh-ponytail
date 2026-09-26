import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from './index.js'

// Exercise the actual DSH prompt assembler, not a mocked concatenation.
const appBoot = resolve(process.env.DSH_HARNESS_ROOT || resolve(import.meta.dirname, '..', '..', 'deepseek-harness'), 'packages/boot/app-boot/package.json')

test('actual DSH assembler retains every original section and adds Ponytail last', async t => {
  if (!existsSync(appBoot)) return t.skip('DSH checkout not available for integration test')
  const requireHarness = createRequire(appBoot)
  const { Context } = await import(pathToFileURL(requireHarness.resolve('@deepseek-ai/cordis')).href)
  const { default: SystemPrompt, renderPrompt } = await import(pathToFileURL(requireHarness.resolve('@deepseek-ai/dsh-system-prompt')).href)
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt, { personaPrefix: 'Original DSH persona.' })
    const web = 'You are interacting with the user through the DeepSeek Harness Web GUI at http://127.0.0.1:19387.'
    ctx.systemPrompt.section({ name: 'app:web-surface', order: ctx.systemPrompt.getSectionOrder('WEB_SURFACE'), text: web })
    ctx.systemPrompt.section({ name: 'tool:read', order: ctx.systemPrompt.getSectionOrder('TOOL_READ'), text: 'Original DSH tool guidance.' })
    const original = await ctx.systemPrompt.assemble({ agent: { session: { seq: 0, snapshotEvents: () => [] } } })
    const renderedOriginal = renderPrompt(original)
    apply({
      systemPrompt: ctx.systemPrompt,
      skills: { register() {} },
      commands: { register() {} },
    })
    const updated = await ctx.systemPrompt.assemble({ agent: { session: { seq: 0, snapshotEvents: () => [] } } })
    assert.deepEqual(updated.sections.filter(s => s.name !== 'ponytail:rules'), original.sections)
    assert.equal(updated.sections.at(-1).name, 'ponytail:rules')
    assert.equal(renderPrompt(updated), `${renderedOriginal}\n\n${updated.sections.at(-1).text}`)
    assert.ok(renderPrompt(updated).includes(web))
    assert.match(renderPrompt(updated), /PONYTAIL MODE ACTIVE — level: full/)
  } finally {
    await ctx.fiber.dispose()
  }
})
