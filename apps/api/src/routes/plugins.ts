import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PluginScanner } from '../services/pluginScanner.js';
import type { PluginStore } from '../services/pluginStore.js';
import { dirExists, expandHome } from '../services/plugins/fsUtils.js';
import { browseDirectories } from '../services/plugins/browse.js';
import type { PluginAdapter, PluginScopeTarget } from '../services/plugins/types.js';
import type { PluginScope } from '../types.js';

/**
 * Plugins tab API.
 *
 *   GET    /api/plugins                              → full overview (3 tools, N projects)
 *   POST   /api/plugins/projects                     → add a project by directory path
 *   DELETE /api/plugins/projects/:projectId          → forget a project
 *   GET    /api/plugins/browse                       → list subdirectories (path picker)
 *   POST   /api/plugins/:tool/:scope/:pluginId/activate
 *   POST   /api/plugins/:tool/:scope/:pluginId/deactivate
 *   POST   /api/plugins/:tool/:scope/install         → install from a marketplace
 *   DELETE /api/plugins/:tool/:scope/:pluginId       → uninstall
 *
 * `:scope` is `user` or `project`; project scope carries `?project=<projectId>`.
 * `pluginId` is `name@marketplace` and is URL-encoded by the client.
 */
export function registerPluginRoutes(
  app: FastifyInstance,
  scanner: PluginScanner,
  store: PluginStore,
): void {
  app.get('/api/plugins', async () => scanner.overview());

  app.get<{ Querystring: { path?: string } }>('/api/plugins/browse', async (req) =>
    browseDirectories(req.query.path, scanner.home),
  );

  app.post<{ Body: { path?: string } }>('/api/plugins/projects', async (req, reply) => {
    const input = req.body?.path;
    if (typeof input !== 'string' || input.trim().length === 0) {
      return reply.code(400).send({ error: 'path is required' });
    }
    // Validate before writing: a project that is not a directory on this machine
    // would only ever produce an empty, useless project view.
    const probe = expandHome(input.trim(), scanner.home);
    if (!(await dirExists(probe))) {
      return reply.code(400).send({ error: `目录不存在：${probe}` });
    }
    try {
      const project = await store.add(input);
      return reply.code(201).send({ project: await scanner.projectView(project) });
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { projectId: string } }>(
    '/api/plugins/projects/:projectId',
    async (req, reply) => {
      try {
        await store.remove(req.params.projectId);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message });
      }
    },
  );

  app.post<{ Params: MutationParams; Querystring: { project?: string } }>(
    '/api/plugins/:tool/:scope/:pluginId/:action',
    async (req, reply) => {
      const action = req.params.action;
      if (action !== 'activate' && action !== 'deactivate') {
        return reply.code(404).send({ error: `unknown action "${action}"` });
      }
      return withScope(req, reply, scanner, async ({ adapter, target }) => {
        await adapter.setEnabled(target, req.params.pluginId, action === 'activate');
        return { ok: true };
      });
    },
  );

  app.post<{ Params: ScopeParams; Querystring: { project?: string }; Body: InstallBody }>(
    '/api/plugins/:tool/:scope/install',
    async (req, reply) => {
      const { marketplace, plugin } = req.body ?? {};
      if (typeof plugin !== 'string' || typeof marketplace !== 'string') {
        return reply.code(400).send({ error: 'marketplace and plugin are required' });
      }
      return withScope(req, reply, scanner, async ({ adapter, target }) => {
        if (!adapter.canInstall) {
          return reply.code(409).send({ error: adapter.note ?? '该工具不支持面板安装' });
        }
        await adapter.install(target, { plugin, marketplace });
        return { ok: true };
      });
    },
  );

  app.delete<{ Params: MutationParams; Querystring: { project?: string } }>(
    '/api/plugins/:tool/:scope/:pluginId',
    async (req, reply) => {
      return withScope(req, reply, scanner, async ({ adapter, target }) => {
        await adapter.uninstall(target, req.params.pluginId);
        return { ok: true };
      });
    },
  );
}

interface ScopeParams {
  tool: string;
  scope: PluginScope;
}

type MutationParams = ScopeParams & { pluginId: string; action: string };

interface InstallBody {
  marketplace?: string;
  plugin?: string;
}

interface ScopeRequest {
  params: ScopeParams;
  query: { project?: string };
}

/**
 * Resolve tool + scope, run the mutation, and map failures onto status codes:
 * an unknown tool/project is a 404, while a refused write (unknown plugin,
 * unparseable config, install not supported) is a 409 the UI shows verbatim.
 */
async function withScope(
  req: ScopeRequest,
  reply: FastifyReply,
  scanner: PluginScanner,
  run: (ctx: { adapter: PluginAdapter; target: PluginScopeTarget }) => Promise<unknown>,
) {
  try {
    const { adapter, target } = await scanner.target(req.params.tool, req.params.scope, req.query.project);
    return await run({ adapter, target });
  } catch (err) {
    const message = explain(err as NodeJS.ErrnoException);
    const notFound =
      message.startsWith('unknown') ||
      message.startsWith('project scope requires') ||
      message.startsWith('找不到');
    return reply.code(notFound ? 404 : 409).send({ error: message });
  }
}

/** A raw `EPERM` tells the operator nothing; say what actually failed. */
function explain(err: NodeJS.ErrnoException): string {
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return `没有写入权限：${err.path ?? '未知路径'}（该工具的配置由当前用户拥有）`;
  }
  return err.message;
}
