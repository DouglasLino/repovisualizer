
import { useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import type { BranchSettings } from "./layout/branchSettings";

interface BranchSettingsPanelProps {
  settings: BranchSettings;
  onSave: (settings: BranchSettings) => void;
  onClose: () => void;
}

export function BranchSettingsPanel({
  settings,
  onSave,
  onClose
}: BranchSettingsPanelProps) {
  const [draft, setDraft] = useState<BranchSettings>(() => ({
    mainBranches: [...settings.mainBranches],
    groupSeparators: [...settings.groupSeparators]
  }));

  const [newBranch, setNewBranch] = useState("");
  const [newSeparator, setNewSeparator] = useState("");

  function addBranch() {
    const branch = newBranch.trim();

    if (!branch) return;

    if (
      draft.mainBranches.some(
        (item) => item.toLowerCase() === branch.toLowerCase()
      )
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      mainBranches: [...current.mainBranches, branch]
    }));

    setNewBranch("");
  }

  function removeBranch(branch: string) {
    setDraft((current) => ({
      ...current,
      mainBranches: current.mainBranches.filter((item) => item !== branch)
    }));
  }

  function moveBranch(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= draft.mainBranches.length) {
      return;
    }

    setDraft((current) => {
      const next = [...current.mainBranches];

      [next[index], next[targetIndex]] = [
        next[targetIndex],
        next[index]
      ];

      return {
        ...current,
        mainBranches: next
      };
    });
  }

  function addSeparator() {
    const separator = newSeparator.trim();

    if (!separator || separator.length !== 1) return;
    if (draft.groupSeparators.includes(separator)) return;

    setDraft((current) => ({
      ...current,
      groupSeparators: [...current.groupSeparators, separator]
    }));

    setNewSeparator("");
  }

  function removeSeparator(separator: string) {
    setDraft((current) => ({
      ...current,
      groupSeparators: current.groupSeparators.filter(
        (item) => item !== separator
      )
    }));
  }

  function handleSave() {
    onSave({
      mainBranches: [...draft.mainBranches],
      groupSeparators: [...draft.groupSeparators]
    });
  }

  return (
    <div className="branch-settings-backdrop" onMouseDown={onClose}>
      <section
        className="branch-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="branch-settings-header">
          <div>
            <h2 id="branch-settings-title">Configuración de ramas</h2>
            <p>Personaliza cómo se organizan las ramas del diagrama.</p>
          </div>

          <Button
            type="button"
            icon="pi pi-times"
            text
            rounded
            aria-label="Cerrar configuraciones"
            onClick={onClose}
          />
        </header>

        <div className="branch-settings-content">
          <section className="branch-settings-section">
            <h3>Ramas principales</h3>
            <p>
              Estas ramas aparecerán a la derecha del diagrama. El orden de
              esta lista determina su posición.
            </p>

            <div className="branch-settings-list">
              {draft.mainBranches.map((branch, index) => (
                <div className="branch-settings-row" key={branch}>
                  <span className="branch-settings-order">{index + 1}</span>
                  <strong>{branch}</strong>

                  <div className="branch-settings-row-actions">
                    <Button
                      type="button"
                      icon="pi pi-arrow-up"
                      text
                      rounded
                      disabled={index === 0}
                      aria-label={`Mover ${branch} hacia arriba`}
                      onClick={() => moveBranch(index, -1)}
                    />

                    <Button
                      type="button"
                      icon="pi pi-arrow-down"
                      text
                      rounded
                      disabled={index === draft.mainBranches.length - 1}
                      aria-label={`Mover ${branch} hacia abajo`}
                      onClick={() => moveBranch(index, 1)}
                    />

                    <Button
                      type="button"
                      icon="pi pi-trash"
                      text
                      rounded
                      severity="danger"
                      aria-label={`Eliminar ${branch}`}
                      onClick={() => removeBranch(branch)}
                    />
                  </div>
                </div>
              ))}

              {draft.mainBranches.length === 0 ? (
                <p className="branch-settings-empty">
                  No hay ramas principales configuradas.
                </p>
              ) : null}
            </div>

            <div className="branch-settings-add">
              <InputText
                value={newBranch}
                onChange={(event) => setNewBranch(event.target.value)}
                placeholder="Ejemplo: production"
                aria-label="Nombre de la nueva rama principal"
                onKeyDown={(event) => {
                  if (event.key === "Enter") addBranch();
                }}
              />

              <Button
                type="button"
                label="Agregar"
                icon="pi pi-plus"
                onClick={addBranch}
                disabled={!newBranch.trim()}
              />
            </div>
          </section>

          <section className="branch-settings-section">
            <h3>Separadores de agrupación</h3>
            <p>
              Las ramas que no estén en la lista principal se agruparán
              automáticamente usando estos separadores.
            </p>

            <div className="branch-settings-separators">
              {draft.groupSeparators.map((separator) => (
                <div className="branch-settings-separator" key={separator}>
                  <code>{separator}</code>

                  <Button
                    type="button"
                    icon="pi pi-times"
                    text
                    rounded
                    severity="danger"
                    aria-label={`Eliminar separador ${separator}`}
                    onClick={() => removeSeparator(separator)}
                  />
                </div>
              ))}
            </div>

            <div className="branch-settings-add">
              <InputText
                value={newSeparator}
                onChange={(event) => setNewSeparator(event.target.value)}
                placeholder="Nuevo separador"
                maxLength={1}
                aria-label="Nuevo separador de agrupación"
                onKeyDown={(event) => {
                  if (event.key === "Enter") addSeparator();
                }}
              />

              <Button
                type="button"
                label="Agregar"
                icon="pi pi-plus"
                onClick={addSeparator}
                disabled={
                  newSeparator.trim().length !== 1 ||
                  draft.groupSeparators.includes(newSeparator.trim())
                }
              />
            </div>

            <small>
              Ejemplos: feature/login, bugfix_error y ejemplo_a.
            </small>
          </section>
        </div>

        <footer className="branch-settings-footer">
          <Button
            type="button"
            label="Cancelar"
            severity="secondary"
            outlined
            onClick={onClose}
          />

          <Button
            type="button"
            label="Guardar cambios"
            icon="pi pi-check"
            onClick={handleSave}
          />
        </footer>
      </section>
    </div>
  );
}
