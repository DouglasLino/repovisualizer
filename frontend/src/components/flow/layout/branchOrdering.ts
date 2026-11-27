
import type { GraphResponse } from "../../../types/graph";
import {
  DEFAULT_BRANCH_SETTINGS,
  type BranchSettings
} from "./branchSettings";

/** Compara nombres de ramas sin distinguir mayúsculas y minúsculas. */
function normalizeBranch(branch: string): string {
  return branch.trim().toLowerCase();
}

/** Comprueba si una rama está configurada como rama principal. */
export function isEnvironmentBranch(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): boolean {
  const name = normalizeBranch(branch);

  return settings.mainBranches.some(
    (mainBranch) => normalizeBranch(mainBranch) === name
  );
}

/** Obtiene el grupo de una rama según los separadores configurados. */
function branchGroup(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string {
  const name = branch.trim();
  const separators = settings.groupSeparators
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let firstSeparatorIndex = -1;

  for (const separator of separators) {
    const index = name.indexOf(separator);

    if (
      index > 0 &&
      (firstSeparatorIndex === -1 || index < firstSeparatorIndex)
    ) {
      firstSeparatorIndex = index;
    }
  }

  const group =
    firstSeparatorIndex > 0
      ? name.slice(0, firstSeparatorIndex)
      : name;

  return group.trim().toLowerCase();
}

/** Ordena ramas del mismo grupo usando las relaciones del grafo. */
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

  const nodeById = new Map(
    graph.nodes.map((node) => [node.id, node])
  );

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
    if (fromBranch === toBranch) return true;
    if (visited.has(fromBranch)) return false;

    visited.add(fromBranch);

    return Array.from(outgoing.get(fromBranch) ?? []).some(
      (childBranch) =>
        hasPath(childBranch, toBranch, visited)
    );
  }

  function addConstraint(
    parentBranch: string | null | undefined,
    childBranch: string | null | undefined
  ) {
    if (!parentBranch || !childBranch) return;
    if (parentBranch === childBranch) return;
    if (!branchSet.has(parentBranch) || !branchSet.has(childBranch)) return;

    if (
      branchGroup(parentBranch, settings) !==
      branchGroup(childBranch, settings)
    ) {
      return;
    }

    const children = outgoing.get(parentBranch);

    if (!children || children.has(childBranch)) return;
    if (hasPath(childBranch, parentBranch)) return;

    children.add(childBranch);

    incomingCount.set(
      childBranch,
      (incomingCount.get(childBranch) ?? 0) + 1
    );
  }

  [
    "pull_request_merge",
    "merge",
    "branch_assumed",
    "branch_possible"
  ].forEach((edgeType) => {
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

/** Ordena las ramas agrupadas que no son ramas principales. */
export function groupedBranches(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const fallbackOrder = branches
    .filter((branch) => !isEnvironmentBranch(branch, settings))
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

/** Devuelve las ramas principales siguiendo el orden de configuración. */
export function environmentBranches(
  branches: string[],
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const availableBranches = new Map(
    branches.map((branch) => [normalizeBranch(branch), branch])
  );

  const ordered: string[] = [];
  const included = new Set<string>();

  settings.mainBranches.forEach((mainBranch) => {
    const normalized = normalizeBranch(mainBranch);
    const actualBranch = availableBranches.get(normalized);

    if (actualBranch && !included.has(normalized)) {
      ordered.push(actualBranch);
      included.add(normalized);
    }
  });

  return ordered;
}

/** Devuelve el orden de ramas para el diseño horizontal. */
export function horizontalBranches(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  return [
    ...environmentBranches(branches, settings),
    ...groupedBranches(branches, graph, settings)
  ];
}

function groupedBranchGroups(
  branches: string[],
  graph: GraphResponse | undefined,
  settings: BranchSettings
): string[] {
  return Array.from(
    new Set(
      groupedBranches(branches, graph, settings).map(
        (branch) => branchGroup(branch, settings)
      )
    )
  );
}

/** Calcula la columna de una rama agrupada. */
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
      return (
        offset +
        Math.max(
          0,
          grouped
            .filter(
              (current) =>
                branchGroup(current, settings) === group
            )
            .indexOf(branch)
        )
      );
    }

    offset += grouped.filter(
      (current) =>
        branchGroup(current, settings) === currentGroup
    ).length;
  }

  return Math.max(0, grouped.indexOf(branch));
}

/** Calcula la fila de una rama agrupada. */
export function groupedBranchRow(
  branch: string,
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): number {
  return Math.max(
    0,
    groupedBranchGroups(branches, graph, settings).indexOf(
      branchGroup(branch, settings)
    )
  );
}
