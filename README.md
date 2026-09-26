# DSH Ponytail

Cordis/DSH adapter for the **unmodified**, pinned npm dependency [`@dietrichgebert/ponytail@4.10.0`](https://www.npmjs.com/package/@dietrichgebert/ponytail). This version targets DSH `0.1.7-rc.2`. Install it in the DSH Plugin Manager from `https://github.com/Pascapone/dsh-ponytail` or its local package directory. It is a Host plugin: no browser rebuild is required.

- Appends Ponytail's *upstream* instruction builder **after all DSH system-prompt sections**, including the Web GUI guidance and persona suffix, without replacing or mutating them (default `full`); supports `lite`, `full`, `ultra`, and `off` per session with `/ponytail <mode>`. `/ponytail` alone reports the current mode.
- Registers all six upstream Markdown skills (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`) with the DSH skill catalog, and six native slash commands. The last five submit an agent task using their upstream skill content.
- `stop ponytail` and `normal mode` as *standalone* user prompts switch off the guidance. Slash-command switches are reconstructed from successful command lifecycle records, including on resume/fork. Other sessions are unaffected.
- The upstream `PONYTAIL_DEFAULT_MODE` environment variable or platform config file (`defaultMode`) sets the default at plugin activation; otherwise `full`. Do not change upstream state files for DSH sessions.

## Compatibility boundaries

Ponytail has no generic library plugin API: its npm root export is an OpenCode adapter. This integration reads the upstream published skill files and invokes its pinned instruction/config helpers directly, rather than copying/forking their contents. This depends on their internal paths, which can change on an upstream upgrade; verify compatibility before changing the pinned version. DSH commands/skills/prompt injection are equivalent capabilities, **not** Claude/Codex/Pi/Cursor lifecycle hooks, statusline integration, host installers, or the private MCP source-tree server (which is not distributed in the npm package). Different agent models may not follow every instruction; no prompt plugin can guarantee model behavior or reproduce upstream benchmark figures.

An existing project `AGENTS.md` or another Ponytail adapter may add duplicate rules. Remove the redundant source in that workspace if this happens. Upstream `ponytail-gain` text in the pinned published skill describes its own benchmark and should not be interpreted as a measurement for the current repository.

## Check

Run `npm test` with a Node runtime. The integration test uses a sibling DSH checkout (or `DSH_HARNESS_ROOT`) to prove that the actual DSH prompt assembler retains its original sections byte-for-byte and appends Ponytail last. Set `DSH_HARNESS_ROOT` to a `0.1.7-rc.2` checkout when validating this release. A successful Plugin Manager installation and an actual agent request are still required for live verification.
