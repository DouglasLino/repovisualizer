
import type { GraphResponse } from "../../../types/graph";
import {
  DEFAULT_BRANCH_SETTINGS,
  type BranchSettings
} from "./branchSettings";

/**
 * Comprueba si una rama está configurada como rama principal.
 * La comparación no distingue entre mayúsculas y minúsculas.
 */
function isMainBranch(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): boolean {
  const name = branch.trim().toLowerCase();

  return settings.mainBranches.some(
    (mainBranch) => mainBranch.trim().toLowerCase() === name
  );
}

/**
 * Identifica las ramas que deben mostrarse a la derecha.
 */
export function isEnvironmentBranch(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): boolean {
  return isMainBranch(branch, settings);
}

/**
 * Obtiene el grupo de una rama usando los separadores configurados.
 *
 * Ejemplos:
 * feature/login -> feature
 * ejemplo_a     -> ejemplo
 * bugfix/error  -> bugfix
 */
function branchGroup(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string {
  const separators = settings.groupSeparators
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let separatorIndex = -1;

  for (const separator of separators) {
    const index = branch.indexOf(separator);

    if (index > 0 && (separatorIndex === -1 || index < separatorIndex)) {
      separatorIndex = index;
    }
  }

  const group = separatorIndex > 0
    ? branch.slice(0, separatorIndex)
    : branch;

  return group.trim().toLowerCase();
}

/** Orders project branches from graph evidence while avoiding inferred cycles. */
function branchRelationOrder(
  graph: GraphResponse | null | undefined,
  branches: string[],
  fallbackOrder: string[],
  settings: BranchSettings
): string[] {
  if (!graph || branches.length < 2) {
    return fallbackOrder;
  }

  const branchSet = new Set(branches);
  const fallbackIndex = new Map(
    fallbackOrder.map((branch, index) => [branch, index])
  );
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map(
    branches.map((branch) => [branch, new Set<string>()])
  );
  const incomingCount = new Map(
    branches.map((branch) => [branch, 0])
  );

  function hasPath(
    fromBranch: string,
    toBranch: string,
    visited = new Set<string>()
  ): boolean {
    if (fromBranch === toBranch) {
      return true;
    }

    if (visited.has(fromBranch)) {
      return false;
    }

    visited.add(fromBranch);

    return Array.from(outgoing.get(fromBranch) ?? [])
      .some((childBranch) =>
        hasPath(childBranch, toBranch, visited)
      );
  }

  function addConstraint(
    parentBranch: string | null | undefined,
    childBranch: string | null | undefined
  ) {
    if (!parentBranch || !childBranch || parentBranch === childBranch) {
      return;
    }

    if (!branchSet.has(parentBranch) || !branchSet.has(childBranch)) {
      return;
    }

    if (
      branchGroup(parentBranch, settings) !==
      branchGroup(childBranch, settings)
    ) {
      return;
    }

    const children = outgoing.get(parentBranch);

    if (!children || children.has(childBranch)) {
      return;
    }

    if (hasPath(childBranch, parentBranch)) {
      return;
    }

    children.add(childBranch);

    incomingCount.set(
      childBranch,
      (incomingCount.get(childBranch) ?? 0) + 1
    );
  }

  ["pull_request_merge", "merge", "branch_assumed", "branch_possible"]
    .forEach((edgeType) => {
      graph.edges
        .filter((edge) => edge.type === edgeType)
        .forEach((edge) => {
          const sourceBranch = nodeById.get(edge.source)?.branch;
          const targetBranch = nodeById.get(edge.target)?.branch;

          addConstraint(sourceBranch, targetBranch);
        });
    });

  const ordered: string[] = [];

  const queue = branches
    .filter((branch) => (incomingCount.get(branch) ?? 0) === 0)
    .sort(
      (left, right) =>
        (fallbackIndex.get(left) ?? 0) -
        (fallbackIndex.get(right) ?? 0)
    );

  while (queue.length > 0) {
    const current = queue.shift() as string;

    ordered.push(current);

    Array.from(outgoing.get(current) ?? [])
      .sort(
        (left, right) =>
          (fallbackIndex.get(left) ?? 0) -
          (fallbackIndex.get(right) ?? 0)
      )
      .forEach((child) => {
        const nextIncoming =
          (incomingCount.get(child) ?? 0) - 1;

        incomingCount.set(child, nextIncoming);

        if (nextIncoming === 0) {
          queue.push(child);

          queue.sort(
            (left, right) =>
              (fallbackIndex.get(left) ?? 0) -
              (fallbackIndex.get(right) ?? 0)
          );
        }
      });
  }

  if (ordered.length === branches.length) {
    return ordered;
  }

  const orderedSet = new Set(ordered);

  return [
    ...ordered,
    ...fallbackOrder.filter((branch) => !orderedSet.has(branch))
  ];
}

/** Orders grouped branches using graph evidence and configured separators. */
export function groupedBranches(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const fallbackOrder = branches
    .filter((branch) => !isMainBranch(branch, settings))
    .sort((left, right) => {
      const leftGroup = branchGroup(left, settings);
      const rightGroup = branchGroup(right, settings);

      if (leftGroup !== rightGroup) {
        return leftGroup.localeCompare(rightGroup);
      }

      return left.localeCompare(right);
    });

  return branchRelationOrder(
    graph,
    fallbackOrder,
    fallbackOrder,
    settings
  );
}

/** Returns configured main branches in their configured order. */
export function environmentBranches(
  branches: string[],
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const availableBranches = new Map(
    branches.map((branch) => [branch.trim().toLowerCase(), branch])
  );

  return settings.mainBranches
    .map((mainBranch) =>
      availableBranches.get(mainBranch.trim().toLowerCase())
    )
    .filter((branch): branch is string => branch !== undefined);
}

/** Returns the branch sequence used by the horizontal layout mode. */
export function horizontalBranches(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  return [
    ...groupedBranches(branches, graph, settings),
    ...environmentBranches(branches, settings)
  ];
}

function groupedBranchGroups(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  return Array.from(
    new Set(
      groupedBranches(branches, graph, settings)
        .map((branch) => branchGroup(branch, settings))
    )
  );
}

export function groupedBranchColumn(
  branch: string,
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): number {
  const grouped = groupedBranches(branches, graph, settings);
  const group = branchGroup(branch, settings);

  let offset = 0;

  for (const currentGroup of groupedBranchGroups(
    branches,
    graph,
    settings
  )) {
    if (currentGroup === group) {
      return offset + Math.max(
        0,
        grouped
          .filter(
            (current) => branchGroup(current, settings) === group
          )
          .indexOf(branch)
      );
    }

    offset += grouped.filter(
      (current) => branchGroup(current, settings) === currentGroup
    ).length;
  }

  return Math.max(0, grouped.indexOf(branch));
}

export function groupedBranchRow(
  branch: string,
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): number {
  return Math.max(
    0,
    groupedBranchGroups(branches, graph, settings)
      .indexOf(branchGroup(branch, settings))
  );
}
