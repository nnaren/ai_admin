import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PluginsTab } from '../../src/tabs/plugins/PluginsTab.js';
import type { PluginOverview, PluginProjectView, PluginScopeView } from '../../src/types.js';

vi.mock('../../src/api/client.js', () => ({
  listPlugins: vi.fn(),
  browseDirectories: vi.fn(),
  addPluginProject: vi.fn(),
  removePluginProject: vi.fn(),
  setPluginEnabled: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
}));

import {
  addPluginProject,
  browseDirectories,
  installPlugin,
  listPlugins,
  removePluginProject,
  setPluginEnabled,
  uninstallPlugin,
} from '../../src/api/client.js';

const NOW = new Date('2026-10-14T12:00:00.000Z').toISOString();

function scope(over: Partial<PluginScopeView> = {}): PluginScopeView {
  return {
    scope: 'user',
    root: '/home/me',
    present: true,
    plugins: [],
    marketplaces: [],
    catalog: [],
    canInstall: true,
    ...over,
  };
}

function claudeUser(): PluginScopeView {
  return scope({
    plugins: [
      { id: 'omc-plugin@omc', name: 'omc-plugin', marketplace: 'omc', version: '5.3.0', enabled: true },
      { id: 'off@omc', name: 'off', marketplace: 'omc', enabled: false },
    ],
    marketplaces: [
      { id: 'omc', name: 'omc', source: 'https://github.com/x/y.git' },
      { id: 'official', name: 'official' },
    ],
    catalog: [
      { id: 'doc-tool@official', name: 'doc-tool', marketplace: 'official', sourcePath: '/mkt/official/doc' },
      {
        id: 'newbie@omc',
        name: 'newbie',
        marketplace: 'omc',
        version: '0.1.0',
        sourcePath: '/mkt/omc/newbie',
        description: 'not installed yet',
      },
      { id: 'omc-plugin@omc', name: 'omc-plugin', marketplace: 'omc', sourcePath: '/mkt/omc/src' },
      { id: 'remote@omc', name: 'remote', marketplace: 'omc', source: 'github:o/r' },
    ],
  });
}

function projectView(over: Partial<PluginProjectView> = {}): PluginProjectView {
  const path = over.path ?? '/code/my-app';
  return {
    id: 'my-app',
    name: 'my-app',
    path,
    scopes: {
      claudecode: scope({
        scope: 'project',
        root: path,
        plugins: [{ id: 'proj@omc', name: 'proj', marketplace: 'omc', enabled: true }],
        catalog: [
          {
            id: 'newbie@omc',
            name: 'newbie',
            marketplace: 'omc',
            version: '0.1.0',
            sourcePath: '/mkt/omc/newbie',
          },
        ],
      }),
      codex: scope({ scope: 'project', root: path, present: false }),
    },
    ...over,
  };
}

function overview(over: Partial<PluginOverview> = {}): PluginOverview {
  return {
    refreshedAt: NOW,
    home: '/home/me',
    tools: [
      { id: 'claudecode', label: 'Claude Code', color: 'amber', userScope: claudeUser() },
      {
        id: 'codex',
        label: 'Codex',
        color: 'green',
        userScope: scope({
          plugins: [{ id: 'browser@openai-bundled', name: 'browser', marketplace: 'openai-bundled', enabled: true }],
          marketplaces: [{ id: 'openai-bundled', name: 'openai-bundled' }],
        }),
      },
      {
        id: 'deepseek',
        label: 'DeepSeek Harness',
        color: 'blue',
        userScope: scope({ canInstall: false, note: '需 pnpm 安装' }),
      },
    ],
    projects: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listPlugins).mockReset();
  vi.mocked(browseDirectories).mockReset();
  vi.mocked(addPluginProject).mockReset();
  vi.mocked(removePluginProject).mockReset();
  vi.mocked(setPluginEnabled).mockReset();
  vi.mocked(installPlugin).mockReset();
  vi.mocked(uninstallPlugin).mockReset();
  vi.mocked(setPluginEnabled).mockResolvedValue(undefined);
  vi.mocked(installPlugin).mockResolvedValue(undefined);
  vi.mocked(uninstallPlugin).mockResolvedValue(undefined);
  vi.mocked(removePluginProject).mockResolvedValue(undefined);
  vi.mocked(listPlugins).mockResolvedValue(overview());
  vi.mocked(browseDirectories).mockResolvedValue({
    path: '/home/me',
    parent: '/home',
    home: true,
    dirs: [{ name: 'code', path: '/home/me/code' }],
  });
});

describe('PluginsTab — layout', () => {
  it('puts the three tools in column 1 and the resident user scope in column 2', async () => {
    render(<PluginsTab />);
    await screen.findByTestId('plugin-col-user-claudecode');

    const layout = screen.getByTestId('plugins-layout');
    const rail = screen.getByTestId('tool-rail');
    const userCol = screen.getByTestId('plugin-col-user-claudecode');

    expect(within(rail).getByTestId('tool-claudecode')).toBeInTheDocument();
    expect(within(rail).getByTestId('tool-codex')).toBeInTheDocument();
    expect(within(rail).getByTestId('tool-deepseek')).toBeInTheDocument();

    // Column order: rail → user scope → projects.
    const order = [...layout.children].map((el) => el.getAttribute('data-testid'));
    expect(order[0]).toBe('tool-rail');
    expect(order[1]).toBe('plugin-col-user-claudecode');
    expect(layout).toContainElement(userCol);
    expect(screen.getByTestId('plugin-scope-user')).toHaveTextContent('用户级 · 常驻');
  });

  it('shows one column per project after the user column, in registry order', async () => {
    vi.mocked(listPlugins).mockResolvedValue(
      overview({
        projects: [
          projectView(),
          projectView({ id: 'other', name: 'other', path: '/code/other' }),
        ],
      }),
    );
    render(<PluginsTab />);
    await screen.findByTestId('plugin-col-my-app-claudecode');

    const order = [...screen.getByTestId('plugins-layout').children].map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(order).toEqual([
      'tool-rail',
      'plugin-col-user-claudecode',
      'plugin-col-my-app-claudecode',
      'plugin-col-other-claudecode',
      'project-add',
    ]);
    expect(screen.getByTestId('plugin-scope-my-app')).toHaveTextContent('项目级');
    expect(screen.getByTestId('plugin-root-my-app-claudecode')).toHaveTextContent('/code/my-app');
  });

  it('switches every column to the tool picked in the rail', async () => {
    vi.mocked(listPlugins).mockResolvedValue(overview({ projects: [projectView()] }));
    render(<PluginsTab />);
    await screen.findByTestId('plugin-col-user-claudecode');

    fireEvent.click(screen.getByTestId('tool-codex'));

    await screen.findByTestId('plugin-col-user-codex');
    expect(screen.getByTestId('plugin-col-my-app-codex')).toBeInTheDocument();
    // the project column keeps its own (absent) tool state
    expect(screen.getByTestId('plugin-empty-my-app')).toHaveTextContent('没有此工具的配置');
    expect(screen.getByTestId('plugin-user-browser')).toBeInTheDocument();
  });

  it('keeps the tool choice scoped to the tab, defaulting to Claude Code', async () => {
    render(<PluginsTab />);
    await screen.findByTestId('plugin-col-user-claudecode');
    expect(screen.getByTestId('tool-claudecode')).toHaveAttribute('aria-current', 'true');
  });
});

describe('PluginsTab — user column actions', () => {
  it('activates a plugin and refetches what the server stored', async () => {
    vi.mocked(listPlugins)
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(
        overview({
          tools: [
            {
              id: 'claudecode',
              label: 'Claude Code',
              color: 'amber',
              userScope: claudeUser(),
            },
            {
              id: 'codex',
              label: 'Codex',
              color: 'green',
              userScope: scope(),
            },
          ],
        }),
      );
    render(<PluginsTab />);
    const toggle = await screen.findByTestId('toggle-user-off');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(setPluginEnabled).toHaveBeenCalledWith('claudecode', 'user', 'off@omc', true, undefined);
    });
  });

  it('deactivates an active plugin', async () => {
    render(<PluginsTab />);
    const toggle = await screen.findByTestId('toggle-user-omc-plugin');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(setPluginEnabled).toHaveBeenCalledWith('claudecode', 'user', 'omc-plugin@omc', false, undefined);
    });
  });

  it('installs a marketplace plugin that has a local source, from the dialog', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    fireEvent.click(await screen.findByTestId('install-pick-claudecode-newbie'));
    await waitFor(() => {
      expect(installPlugin).toHaveBeenCalledWith('claudecode', 'user', 'omc', 'newbie', undefined);
    });
  });

  it('marks an already-installed offer and blocks a remote-only one', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    await screen.findByTestId('install-list');
    expect(screen.getByTestId('install-pick-claudecode-omc-plugin')).toHaveTextContent('已安装');
    const remote = screen.getByTestId('install-pick-claudecode-remote');
    expect(remote).toBeDisabled();
    expect(remote).toHaveAttribute('title', expect.stringContaining('工具自身安装'));
  });

  it('uninstalls a plugin', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('uninstall-user-omc-plugin'));
    await waitFor(() => {
      expect(uninstallPlugin).toHaveBeenCalledWith('claudecode', 'user', 'omc-plugin@omc', undefined);
    });
  });

  it('filters the selected marketplace by search text', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    await screen.findByTestId('install-list');
    fireEvent.change(screen.getByTestId('install-search'), { target: { value: 'remot' } });
    expect(screen.queryByTestId('install-row-newbie')).not.toBeInTheDocument();
    expect(screen.getByTestId('install-row-remote')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('install-search'), { target: { value: 'nothing-here' } });
    expect(screen.getByTestId('install-no-match')).toBeInTheDocument();
  });

  it('explains that DeepSeek cannot be installed from the panel', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('tool-deepseek'));
    expect(await screen.findByTestId('plugin-col-user-deepseek')).toHaveTextContent('需 pnpm 安装');
  });

  it('shows how long ago the inventory was refreshed', async () => {
    vi.mocked(listPlugins).mockResolvedValue(
      overview({ refreshedAt: new Date(Date.now() - 3 * 60_000).toISOString() }),
    );
    render(<PluginsTab />);
    await screen.findByTestId('plugins-refreshed');
    expect(screen.getByTestId('plugins-refreshed')).toHaveTextContent('3分钟前更新');
  });

  it('reports an unreadable tool without hiding the others', async () => {
    vi.mocked(listPlugins).mockResolvedValue(
      overview({
        tools: [
          {
            id: 'claudecode',
            label: 'Claude Code',
            color: 'amber',
            userScope: scope({ present: false, lastError: 'settings.json is not valid JSON' }),
          },
        ],
      }),
    );
    render(<PluginsTab />);
    expect(await screen.findByTestId('plugin-error-user')).toHaveTextContent('not valid JSON');
    expect(screen.getByTestId('tool-claudecode')).toHaveTextContent('读取失败');
  });

  it('surfaces a failed write in a banner', async () => {
    vi.mocked(setPluginEnabled).mockRejectedValue(new Error('settings.json is not valid JSON'));
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('toggle-user-off'));
    expect(await screen.findByTestId('plugin-error-banner')).toHaveTextContent('not valid JSON');
  });
});

describe('PluginsTab — project columns', () => {
  beforeEach(() => {
    vi.mocked(listPlugins).mockResolvedValue(overview({ projects: [projectView()] }));
  });

  it('scopes mutations to the project the column belongs to', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('toggle-my-app-proj'));
    await waitFor(() => {
      expect(setPluginEnabled).toHaveBeenCalledWith('claudecode', 'project', 'proj@omc', false, 'my-app');
    });
  });

  it('installs into the project column without touching the user column', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-my-app'));
    const dialog = await screen.findByTestId('install-modal');
    expect(dialog).toHaveTextContent('安装到 本项目');
    fireEvent.click(screen.getByTestId('install-pick-claudecode-newbie'));
    await waitFor(() => {
      expect(installPlugin).toHaveBeenCalledWith('claudecode', 'project', 'omc', 'newbie', 'my-app');
    });
  });

  it('labels the project action 移除 rather than 卸载', async () => {
    render(<PluginsTab />);
    expect(await screen.findByTestId('uninstall-my-app-proj')).toHaveTextContent('移除');
    expect(screen.getByTestId('uninstall-user-omc-plugin')).toHaveTextContent('卸载');
  });

  it('removes the project from its column header', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-remove-my-app'));
    await waitFor(() => {
      expect(removePluginProject).toHaveBeenCalledWith('my-app');
    });
  });

  it('adds a project by path, which appends a column', async () => {
    vi.mocked(addPluginProject).mockResolvedValue(projectView({ id: 'second', name: 'second', path: '/code/second' }));
    vi.mocked(listPlugins)
      .mockResolvedValueOnce(overview({ projects: [projectView()] }))
      .mockResolvedValue(
        overview({ projects: [projectView(), projectView({ id: 'second', name: 'second', path: '/code/second' })] }),
      );

    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.change(screen.getByTestId('project-path-input'), { target: { value: '/code/second' } });
    fireEvent.click(screen.getByTestId('project-add-submit'));

    await waitFor(() => {
      expect(addPluginProject).toHaveBeenCalledWith('/code/second');
    });
    expect(await screen.findByTestId('plugin-col-second-claudecode')).toHaveTextContent('/code/second');
  });

  it('reports a rejected project path', async () => {
    vi.mocked(addPluginProject).mockRejectedValue(new Error('目录不存在：/nope'));
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.change(screen.getByTestId('project-path-input'), { target: { value: '/nope' } });
    fireEvent.click(screen.getByTestId('project-add-submit'));
    expect(await screen.findByTestId('plugin-error-banner')).toHaveTextContent('目录不存在');
  });

  it('still offers the add-project column when no project is registered', async () => {
    vi.mocked(listPlugins).mockResolvedValue(overview());
    render(<PluginsTab />);
    expect(await screen.findByTestId('project-add')).toBeInTheDocument();
  });
});

describe('PluginsTab — install dialog', () => {
  it('keeps the marketplace out of the column until asked', async () => {
    render(<PluginsTab />);
    await screen.findByTestId('install-open-user');
    // the column shows installed plugins only
    expect(screen.queryByTestId('install-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('install-open-user')).toHaveTextContent('安装 · 4');

    fireEvent.click(screen.getByTestId('install-open-user'));
    await screen.findByTestId('install-modal');
    expect(screen.getByTestId('install-marketplace')).toHaveTextContent('official');
  });

  it('lists the plugins of the selected marketplace and switches on demand', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    const select = await screen.findByTestId('install-marketplace');

    // first marketplace is alphabetical: omc
    expect(select).toHaveValue('omc');
    expect(screen.getByTestId('install-row-newbie')).toBeInTheDocument();
    expect(screen.queryByTestId('install-row-doc-tool')).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'official' } });
    expect(screen.getByTestId('install-row-doc-tool')).toBeInTheDocument();
    expect(screen.queryByTestId('install-row-newbie')).not.toBeInTheDocument();
  });

  it('shows where a marketplace comes from, and installs with that marketplace', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    const dialog = await screen.findByTestId('install-modal');
    expect(dialog).toHaveTextContent('安装到 用户级');
    expect(dialog).toHaveTextContent('https://github.com/x/y.git');

    fireEvent.change(screen.getByTestId('install-marketplace'), { target: { value: 'official' } });
    fireEvent.click(screen.getByTestId('install-pick-claudecode-doc-tool'));
    await waitFor(() => {
      expect(installPlugin).toHaveBeenCalledWith('claudecode', 'user', 'official', 'doc-tool', undefined);
    });
  });

  it('closes without installing', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('install-open-user'));
    await screen.findByTestId('install-modal');
    fireEvent.click(screen.getByTestId('install-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('install-modal')).not.toBeInTheDocument();
    });
    expect(installPlugin).not.toHaveBeenCalled();
  });

  it('says so when a tool has no marketplace to install from', async () => {
    vi.mocked(listPlugins).mockResolvedValue(
      overview({
        tools: [
          {
            id: 'deepseek',
            label: 'DeepSeek Harness',
            color: 'blue',
            userScope: scope({ canInstall: false, note: '需 pnpm 安装' }),
          },
        ],
      }),
    );
    render(<PluginsTab />);
    const open = await screen.findByTestId('install-open-user');
    expect(open).toBeDisabled();
    expect(open).toHaveTextContent('安装 · 0');
  });
});

describe('PluginsTab — project path picker', () => {
  beforeEach(() => {
    vi.mocked(listPlugins).mockResolvedValue(overview());
  });

  it('browses real directories and fills the path from a click', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.click(screen.getByTestId('project-browse'));

    await screen.findByTestId('dir-browser');
    expect(browseDirectories).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId('dir-current')).toHaveTextContent('/home/me');

    vi.mocked(browseDirectories).mockResolvedValue({
      path: '/home/me/code',
      parent: '/home/me',
      home: false,
      dirs: [{ name: 'my-app', path: '/home/me/code/my-app' }],
    });
    fireEvent.click(screen.getByTestId('dir-code'));
    await waitFor(() => {
      expect(browseDirectories).toHaveBeenLastCalledWith('/home/me/code');
    });
    expect(screen.getByTestId('project-path-input')).toHaveValue('/home/me/code');
  });

  it('confirms the browsed directory and adds the project', async () => {
    vi.mocked(browseDirectories).mockResolvedValue({
      path: '/home/me/code/my-app',
      parent: '/home/me/code',
      home: false,
      dirs: [],
    });
    vi.mocked(addPluginProject).mockResolvedValue({
      id: 'my-app',
      name: 'my-app',
      path: '/home/me/code/my-app',
      scopes: {},
    });
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.click(screen.getByTestId('project-browse'));
    await screen.findByTestId('dir-browser');

    fireEvent.click(screen.getByTestId('dir-pick'));
    expect(screen.queryByTestId('dir-browser')).not.toBeInTheDocument();
    expect(screen.getByTestId('project-path-input')).toHaveValue('/home/me/code/my-app');

    fireEvent.click(screen.getByTestId('project-add-submit'));
    await waitFor(() => {
      expect(addPluginProject).toHaveBeenCalledWith('/home/me/code/my-app');
    });
  });

  it('walks up a directory', async () => {
    vi.mocked(browseDirectories).mockResolvedValue({
      path: '/home/me/code',
      parent: '/home/me',
      home: false,
      dirs: [],
    });
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.click(screen.getByTestId('project-browse'));
    await screen.findByTestId('dir-browser');
    fireEvent.click(screen.getByTestId('dir-up'));
    await waitFor(() => {
      expect(browseDirectories).toHaveBeenLastCalledWith('/home/me');
    });
  });

  it('still accepts a typed path without browsing', async () => {
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.change(screen.getByTestId('project-path-input'), {
      target: { value: '/typed/path' },
    });
    fireEvent.click(screen.getByTestId('project-add-submit'));
    await waitFor(() => {
      expect(addPluginProject).toHaveBeenCalledWith('/typed/path');
    });
    expect(browseDirectories).not.toHaveBeenCalled();
  });

  it('shows a browse error in place of the directory list', async () => {
    vi.mocked(browseDirectories).mockResolvedValue({
      path: '/home/me/secret',
      parent: '/home/me',
      home: false,
      dirs: [],
      error: '没有读取权限：/home/me/secret',
    });
    render(<PluginsTab />);
    fireEvent.click(await screen.findByTestId('project-add'));
    fireEvent.click(screen.getByTestId('project-browse'));
    expect(await screen.findByTestId('dir-current')).toHaveTextContent('没有读取权限');
    expect(screen.getByTestId('dir-pick')).toBeDisabled();
  });
});
