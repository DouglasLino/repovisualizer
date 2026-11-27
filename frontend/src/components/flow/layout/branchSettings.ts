
/**
 * Configuración de las reglas de organización de ramas.
 */

export interface BranchSettings {
  /**
   * Ramas que se muestran a la derecha del diagrama.
   * El orden del arreglo determina su posición.
   */
  mainBranches: string[];

  /**
   * Separadores utilizados para agrupar ramas
   * automáticamente a la izquierda.
   */
  groupSeparators: string[];
}

/**
 * Configuración predeterminada de RepoVisualizer.
 */
export const DEFAULT_BRANCH_SETTINGS: BranchSettings = {
  mainBranches: [
    "main",
    "master",
    "dev",
    "development",
    "qa",
    "uat"
  ],

  groupSeparators: [
    "/",
    "_"
  ]
};

/**
 * Obtiene una copia independiente de la configuración
 * predeterminada.
 */
export function createDefaultBranchSettings(): BranchSettings {
  return {
    mainBranches: [...DEFAULT_BRANCH_SETTINGS.mainBranches],
    groupSeparators: [...DEFAULT_BRANCH_SETTINGS.groupSeparators]
  };
}
