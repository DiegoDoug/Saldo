/**
 * Tag manager: rename, recolour, or delete the tags in the registry. Renaming
 * rewrites the tag across every transaction that carries it (see `renameTag`),
 * so membership and the registry never drift apart.
 */

import { ArrowLeft, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CATEGORY_COLORS } from "../../shared/theme";
import { EmptyState } from "../../shared/ui/EmptyState";
import type { LocalTag } from "../../db/db";
import { useTags } from "./hooks";
import { deleteTag, renameTag, setTagColor } from "./localRepo";
import { tagColor } from "./tagColor";

export function TagsPage() {
  const navigate = useNavigate();
  const tags = useTags();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <button
          aria-label="Volver"
          onClick={() => navigate(-1)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card hover:bg-paper"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-semibold">Etiquetas</h1>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          icon={<Tags size={24} />}
          title="Sin etiquetas"
          message="Añade etiquetas al registrar un movimiento; aquí podrás darles color y gestionarlas."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TagRow({ tag }: { tag: LocalTag }) {
  const [name, setName] = useState(tag.name);
  const [editingColor, setEditingColor] = useState(false);
  const color = tagColor(tag.name, new Map([[tag.name, tag.color]]));

  return (
    <li className="card-panel flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <button
          aria-label={`Color de ${tag.name}`}
          onClick={() => setEditingColor((v) => !v)}
          className="h-7 w-7 shrink-0 rounded-full border border-line"
          style={{ background: color }}
        />
        <input
          className="min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-sm font-medium outline-none focus:border-line"
          aria-label={`Nombre de ${tag.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== tag.name) void renameTag(tag.id, trimmed);
            else setName(tag.name);
          }}
        />
        <button
          aria-label={`Eliminar ${tag.name}`}
          onClick={() => void deleteTag(tag.id)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {editingColor && (
        <div className="flex flex-wrap gap-1.5 pl-9">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Color ${c}`}
              aria-pressed={tag.color === c}
              onClick={() => {
                void setTagColor(tag.id, c);
                setEditingColor(false);
              }}
              className={`h-7 w-7 rounded-full border-2 ${tag.color === c ? "border-ink" : "border-line"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </li>
  );
}
