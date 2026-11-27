
import type { GraphResponse } from "../../../types/graph";
import {
  DEFAULT_BRANCH_SETTINGS,
  type BranchSettings
} from "./branchSettings";

/**
 * Comprueba si una rama está incluida en la lista
 * configurable de ramas principales.
 */
export function isEnvironmentBranch(
  branch: string,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): boolean {
  return settings.mainBranches.some(
    (mainBranch) => mainBranch.toLowerCase() === branch.toLowerCase()
  );
}

/**
 * Obtiene el grupo al que pertenece una rama.
 *
 * Ejemplos:
 * feature/login  -> feature
 * ejemplo_a      -> ejemplo
 * bugfix/error   -> bugfix
 */
function branchGroup(
  branch: string,
  settings: BranchSettings
): string {
  const separators = settings.groupSeparators
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  let separatorIndex = -1;

  for (const separator of separators) {
    const index = branch.indexOf(separator);

    if (
      index > 0 &&
      (separatorIndex === -1 || index < separatorIndex)
    ) {
      separatorIndex = index;
    }
  }

  return (
    separatorIndex > 0
      ? branch.slice(0, separatorIndex)
      : branch
  ).trim().toLowerCase();
}

/**
 * Ordena ramas relacionadas utilizando las relaciones
 * existentes en el grafo, evitando ciclos.
 */
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
    if (fromBranch === toBranch) {
      return true;
    }

    if (visited.has(fromBranch)) {
      return false;
    }

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
    if (
      !parentBranch ||
      !childBranch ||
      parentBranch === childBranch
    ) {
      return;
    }

    if (
      !branchSet.has(parentBranch) ||
      !branchSet.has(childBranch)
    ) {
      return;
    }

    // Solo ordenamos relaciones dentro del mismo grupo.
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

    // Evitamos introducir ciclos.
    if (hasPath(childBranch, parentBranch)) {
      return;
    }

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
    .filter(
      (branch) => (incomingCount.get(branch) ?? 0) === 0
    )
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
    ...fallbackOrder.filter(
      (branch) => !orderedSet.has(branch)
    )
  ];
}

/**
 * Agrupa y ordena las ramas que no son principales.
 */
export function groupedBranches(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const fallbackOrder = branches
    .filter(
      (branch) => !isEnvironmentBranch(branch, settings)
    )
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

/**
 * Devuelve las ramas principales respetando exactamente
 * el orden definido en la configuración.
 */
export function environmentBranches(
  branches: string[],
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  const availableBranches = new Map(
    branches.map((branch) => [branch.toLowerCase(), branch])
  );

  const ordered: string[] = [];
  const included = new Set<string>();

  settings.mainBranches.forEach((mainBranch) => {
    const normalized = mainBranch.toLowerCase();
    const actualBranch = availableBranches.get(normalized);

    if (actualBranch && !included.has(normalized)) {
      ordered.push(actualBranch);
      included.add(normalized);
    }
  });

  return ordered;
}

/**
 * Devuelve la secuencia de ramas para el diseño horizontal.
 * Las ramas principales quedan a la derecha y los grupos
 * automáticos se distribuyen hacia la izquierda.
 */
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

/**
 * Obtiene los grupos únicos respetando los separadores
 * configurados.
 */
function groupedBranchGroups(
  branches: string[],
  graph?: GraphResponse,
  settings: BranchSettings = DEFAULT_BRANCH_SETTINGS
): string[] {
  return Array.from(
    new Set(
      groupedBranches(branches, graph, settings).map(
        (branch) => branchGroup(branch, settings)
      )
    )
  );
}

/**
 * Calcula la columna de una rama agrupada.
 */
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

/**
 * Calcula la fila de una rama agrupada.
 */
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
