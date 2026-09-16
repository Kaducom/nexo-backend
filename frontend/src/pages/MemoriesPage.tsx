import { FormEvent, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import {
  Brain,
  Check,
  Hash,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import IconButton from "../components/ui/IconButton";

import { cardMotion, pageMotion, staggerContainer } from "../design/motion";
import { db } from "../db";
import { formatDateTime } from "../utils";

export default function MemoriesPage() {
  const memories =
    useLiveQuery(
      () => db.memories.orderBy("updatedAt").reverse().toArray(),
      []
    ) ?? [];

  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim() || !content.trim()) {
      return;
    }

    const now = new Date().toISOString();

    await db.memories.add({
      title: title.trim(),
      content: content.trim(),

      tags: tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),

      createdAt: now,
      updatedAt: now
    });

    setTitle("");
    setContent("");
    setTags("");

    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 1800);
  }

  async function handleDelete(id?: number) {
    if (!id) return;

    const confirmed = window.confirm(
      "Deseja realmente excluir esta memória?"
    );

    if (!confirmed) return;

    await db.memories.delete(id);
  }

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) {
      return memories;
    }

    return memories.filter((memory) =>
      [
        memory.title,
        memory.content,
        memory.tags.join(" ")
      ].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [memories, normalizedQuery]);

  return (
    <motion.div
      className="page nexo-memories-page"
      variants={pageMotion}
      initial="hidden"
      animate="visible"
    >
      <PageHeader
        eyebrow="MEMÓRIA"
        title="O que você não quer esquecer?"
        description="Guarde fatos, informações e referências para encontrar depois."
      />

      <motion.section
        className="nexo-memory-stats"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="nexo-memory-stat"
          variants={cardMotion}
        >
          <div className="nexo-memory-stat-icon">
            <Brain size={20} />
          </div>

          <div>
            <span>Memórias guardadas</span>
            <strong>{memories.length}</strong>
          </div>
        </motion.div>

        <motion.div
          className="nexo-memory-stat"
          variants={cardMotion}
        >
          <div className="nexo-memory-stat-icon secondary">
            <Hash size={20} />
          </div>

          <div>
            <span>Resultados visíveis</span>
            <strong>{filtered.length}</strong>
          </div>
        </motion.div>
      </motion.section>

      <div className="nexo-memory-layout">
        <motion.form
          className="nexo-memory-create"
          onSubmit={handleSubmit}
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-memory-panel-header">
            <div>
              <span className="nexo-card-eyebrow">
                <Plus size={14} />
                NOVA MEMÓRIA
              </span>

              <h2>Guardar informação</h2>

              <p>
                Registre algo que o NEXO deve manter acessível
                para você.
              </p>
            </div>

            <div className="nexo-memory-header-icon">
              <Brain size={21} />
            </div>
          </div>

          <div className="nexo-memory-form">
            <label className="nexo-field">
              <span>Título</span>

              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Ex.: Troquei a senha do iCloud"
                autoComplete="off"
              />
            </label>

            <label className="nexo-field">
              <div className="nexo-field-label-row">
                <span>Informação</span>

                <small>
                  {content.length} caracteres
                </small>
              </div>

              <textarea
                value={content}
                onChange={(event) =>
                  setContent(event.target.value)
                }
                placeholder="Registre aqui o que aconteceu ou o que precisa lembrar..."
                rows={7}
              />
            </label>

            <label className="nexo-field">
              <span>Tags</span>

              <div className="nexo-input-with-icon">
                <Hash size={16} />

                <input
                  value={tags}
                  onChange={(event) =>
                    setTags(event.target.value)
                  }
                  placeholder="icloud, conta, segurança"
                  autoComplete="off"
                />
              </div>

              <small>
                Separe as tags usando vírgulas.
              </small>
            </label>

            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={!title.trim() || !content.trim()}
              icon={
                saved ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )
              }
            >
              {saved
                ? "Memória guardada"
                : "Guardar memória"}
            </Button>
          </div>

          <div className="nexo-security-note">
            <div>
              <ShieldCheck size={17} />
            </div>

            <p>
              <strong>Informações sensíveis</strong>
              Esta área ainda não é um cofre de senhas.
              Credenciais terão um módulo criptografado
              separado no futuro.
            </p>
          </div>
        </motion.form>

        <motion.section
          className="nexo-memory-library"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-memory-library-header">
            <div>
              <span className="nexo-card-eyebrow">
                <Brain size={14} />
                BIBLIOTECA
              </span>

              <h2>Suas memórias</h2>
            </div>

            <Badge variant="primary">
              {memories.length}
              {memories.length === 1
                ? " memória"
                : " memórias"}
            </Badge>
          </div>

          <div className="nexo-memory-search">
            <Search size={18} />

            <input
              aria-label="Pesquisar memórias"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Pesquisar por título, conteúdo ou tag..."
            />

            {query && (
              <button
                type="button"
                className="nexo-search-clear"
                onClick={() => setQuery("")}
                aria-label="Limpar pesquisa"
                title="Limpar pesquisa"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {normalizedQuery && (
            <div className="nexo-search-result-info">
              <Search size={13} />

              <span>
                {filtered.length === 0
                  ? "Nenhum resultado"
                  : `${filtered.length} ${
                      filtered.length === 1
                        ? "resultado"
                        : "resultados"
                    }`}
                {" para "}
                <strong>“{query.trim()}”</strong>
              </span>
            </div>
          )}

          <div className="nexo-memory-list">
            {filtered.map((memory, index) => (
              <motion.article
                className="nexo-memory-card"
                key={memory.id}
                initial={{
                  opacity: 0,
                  y: 8
                }}
                animate={{
                  opacity: 1,
                  y: 0
                }}
                transition={{
                  duration: 0.25,
                  delay: Math.min(index * 0.035, 0.25)
                }}
              >
                <div className="nexo-memory-card-top">
                  <div className="nexo-memory-card-title">
                    <div className="nexo-memory-card-icon">
                      <Brain size={17} />
                    </div>

                    <div>
                      <h3>{memory.title}</h3>

                      <span>
                        {formatDateTime(memory.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <IconButton
                    icon={<Trash2 size={16} />}
                    label="Excluir memória"
                    variant="danger"
                    onClick={() =>
                      handleDelete(memory.id)
                    }
                  />
                </div>

                <p className="nexo-memory-content">
                  {memory.content}
                </p>

                {!!memory.tags.length && (
                  <div className="nexo-memory-tags">
                    {memory.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="primary"
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </motion.article>
            ))}

            {!filtered.length && (
              <EmptyState
                icon={
                  normalizedQuery ? (
                    <Search size={24} />
                  ) : (
                    <Brain size={24} />
                  )
                }
                title={
                  normalizedQuery
                    ? "Nenhuma memória encontrada"
                    : "Sua memória está vazia"
                }
                description={
                  normalizedQuery
                    ? "Tente pesquisar usando outro título, conteúdo ou tag."
                    : "Quando você guardar alguma informação importante, ela aparecerá aqui."
                }
                action={
                  normalizedQuery ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<X size={14} />}
                      onClick={() => setQuery("")}
                    >
                      Limpar pesquisa
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>

          {!!memories.length && (
            <div className="nexo-memory-library-footer">
              <Info size={13} />

              <span>
                Pesquise usando palavras do título,
                conteúdo ou tags.
              </span>
            </div>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}