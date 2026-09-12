/**
 * Generic tab registry. Each TabDef is self-describing.
 *
 * INVARIANT: The TabHost (apps/web/src/tabs/TabHost.tsx) MUST NOT import
 * the gateways schema or any specific business/API shape. This file is the
 * only thing the TabHost reads, and TabDef is intentionally minimal.
 */

import type { ComponentType } from 'react';

export interface TabDef {
  /** Unique id, used as the activeTab key. */
  id: string;
  /** URL path segment, used for future routing. */
  path: string;
  /** Human-readable label rendered in the tab strip. */
  label: string;
  /** The component to render when this tab is active. */
  component: ComponentType;
}

const tabs: TabDef[] = [];

export function registerTab(tab: TabDef): void {
  if (tabs.some((t) => t.id === tab.id)) {
    throw new Error(`Tab id "${tab.id}" is already registered`);
  }
  tabs.push(tab);
}

export function getTabs(): readonly TabDef[] {
  return tabs;
}

export function getTab(id: string): TabDef | undefined {
  return tabs.find((t) => t.id === id);
}
