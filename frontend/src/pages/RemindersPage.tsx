import { FormEvent, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Info,
  Plus,
  RotateCcw,
  Trash2
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import IconButton from "../components/ui/IconButton";

import { cardMotion, pageMotion, staggerContainer } from "../design/motion";
import { db } from "../db";
import { formatDateTime, localDateTimeValue } from "../utils";
import { mirrorReminderDelete, mirrorReminderUpsert } from "../services/reminderSync";

export default function RemindersPage() {
  const reminders =
    useLiveQuery(
      () => db.reminders.orderBy("startsAt").toArray(),
      []
    ) ?? [];

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState(localDateTimeValue());
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim() || !startsAt) {
      return;
    }

    const newId = await db.reminders.add({
      title: title.trim(),
      notes: notes.trim(),
      startsAt: new Date(startsAt).toISOString(),
      completed: false,
      createdAt: new Date().toISOString()
    });

    const created = await db.reminders.get(newId);

    if (created) {
      void mirrorReminderUpsert(created);
    }

    setTitle("");
    setNotes("");
    setStartsAt(localDateTimeValue());

    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 1800);
  }

  async function handleToggle(id?: number, completed?: boolean) {
    if (!id) return;

    await db.reminders.update(id, {
      completed: !completed
    });

    const updated = await db.reminders.get(id);

    if (updated) {
      void mirrorReminderUpsert(updated);
    }
  }

  async function handleDelete(id?: number) {
    if (!id) return;

    const confirmed = window.confirm(
      "Deseja realmente excluir este lembrete?"
    );

    if (!confirmed) return;

    await db.reminders.delete(id);

    void mirrorReminderDelete(id);
  }

  const now = Date.now();

  const pendingReminders = useMemo(
    () =>
      reminders.filter(
        (reminder) => !reminder.completed
      ),
    [reminders]
  );

  const completedReminders = useMemo(
    () =>
      reminders.filter(
        (reminder) => reminder.completed
      ),
    [reminders]
  );

  const upcomingReminders = useMemo(
    () =>
      reminders.filter(
        (reminder) =>
          !reminder.completed &&
          new Date(reminder.startsAt).getTime() >= now
      ),
    [reminders, now]
  );

  const overdueReminders = useMemo(
    () =>
      reminders.filter(
        (reminder) =>
          !reminder.completed &&
          new Date(reminder.startsAt).getTime() < now
      ),
    [reminders, now]
  );

  const nextReminder = upcomingReminders[0];

  function getReminderStatus(reminder: (typeof reminders)[number]) {
    if (reminder.completed) {
      return {
        label: "Concluído",
        variant: "success" as const,
        className: "completed"
      };
    }

    if (new Date(reminder.startsAt).getTime() < Date.now()) {
      return {
        label: "Atrasado",
        variant: "danger" as const,
        className: "overdue"
      };
    }

    return {
      label: "Agendado",
      variant: "primary" as const,
      className: "upcoming"
    };
  }

  return (
    <motion.div
      className="page nexo-reminders-page"
      variants={pageMotion}
      initial="hidden"
      animate="visible"
    >
      <PageHeader
        eyebrow="TEMPO"
        title="Lembretes e compromissos"
        description="Organize o que precisa acontecer e mantenha seus próximos compromissos sob controle."
      />

      <motion.section
        className="nexo-reminder-stats"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="nexo-reminder-stat"
          variants={cardMotion}
        >
          <div className="nexo-reminder-stat-icon purple">
            <Bell size={19} />
          </div>

          <div>
            <span>Pendentes</span>
            <strong>{pendingReminders.length}</strong>
          </div>
        </motion.div>

        <motion.div
          className="nexo-reminder-stat"
          variants={cardMotion}
        >
          <div className="nexo-reminder-stat-icon amber">
            <Clock3 size={19} />
          </div>

          <div>
            <span>Atrasados</span>
            <strong>{overdueReminders.length}</strong>
          </div>
        </motion.div>

        <motion.div
          className="nexo-reminder-stat"
          variants={cardMotion}
        >
          <div className="nexo-reminder-stat-icon green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Concluídos</span>
            <strong>{completedReminders.length}</strong>
          </div>
        </motion.div>
      </motion.section>

      {nextReminder && (
        <motion.section
          className="nexo-next-reminder-banner"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-next-reminder-symbol">
            <CalendarDays size={21} />
          </div>

          <div className="nexo-next-reminder-info">
            <span>PRÓXIMO COMPROMISSO</span>

            <strong>{nextReminder.title}</strong>

            <small>
              {formatDateTime(nextReminder.startsAt)}
            </small>
          </div>

          <Badge variant="primary">
            Próximo
          </Badge>
        </motion.section>
      )}

      <div className="nexo-reminder-layout">
        <motion.form
          className="nexo-reminder-create"
          onSubmit={handleSubmit}
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-reminder-panel-header">
            <div>
              <span className="nexo-card-eyebrow">
                <Plus size={14} />
                NOVO LEMBRETE
              </span>

              <h2>Adicionar compromisso</h2>

              <p>
                Diga ao NEXO o que precisa acontecer e quando.
              </p>
            </div>

            <div className="nexo-reminder-header-icon">
              <Bell size={21} />
            </div>
          </div>

          <div className="nexo-reminder-form">
            <label className="nexo-field">
              <span>Título</span>

              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Ex.: Sair para consulta"
                autoComplete="off"
              />
            </label>

            <label className="nexo-field">
              <span>Data e hora</span>

              <div className="nexo-input-with-icon">
                <CalendarDays size={16} />

                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) =>
                    setStartsAt(event.target.value)
                  }
                />
              </div>
            </label>

            <label className="nexo-field">
              <div className="nexo-field-label-row">
                <span>Observações</span>

                <small>
                  {notes.length} caracteres
                </small>
              </div>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                placeholder="Ex.: preciso sair 40 minutos antes"
                rows={6}
              />
            </label>

            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={!title.trim() || !startsAt}
              icon={
                saved ? (
                  <Check size={17} />
                ) : (
                  <Bell size={17} />
                )
              }
            >
              {saved
                ? "Lembrete criado"
                : "Criar lembrete"}
            </Button>
          </div>

          <div className="nexo-reminder-push-note">
            <div>
              <Bell size={16} />
            </div>

            <p>
              <strong>Notificações inteligentes</strong>
              Nesta etapa o compromisso fica registrado no
              NEXO. Os avisos automáticos fora do app serão
              conectados ao sistema de notificações.
            </p>
          </div>
        </motion.form>

        <motion.section
          className="nexo-reminder-agenda"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-reminder-agenda-header">
            <div>
              <span className="nexo-card-eyebrow">
                <CalendarDays size={14} />
                AGENDA
              </span>

              <h2>Seus compromissos</h2>
            </div>

            <Badge variant="primary">
              {reminders.length}{" "}
              {reminders.length === 1
                ? "item"
                : "itens"}
            </Badge>
          </div>

          {reminders.length ? (
            <div className="nexo-reminder-list">
              {reminders.map((reminder, index) => {
                const status = getReminderStatus(reminder);

                return (
                  <motion.article
                    className={`nexo-reminder-card ${status.className}`}
                    key={reminder.id}
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
                      delay: Math.min(
                        index * 0.035,
                        0.25
                      )
                    }}
                  >
                    <div className="nexo-reminder-card-marker">
                      {reminder.completed ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Circle size={18} />
                      )}
                    </div>

                    <div className="nexo-reminder-card-body">
                      <div className="nexo-reminder-card-heading">
                        <div>
                          <h3>{reminder.title}</h3>

                          <div className="nexo-reminder-date">
                            <Clock3 size={13} />

                            <span>
                              {formatDateTime(
                                reminder.startsAt
                              )}
                            </span>
                          </div>
                        </div>

                        <Badge variant={status.variant}>
                          {status.label}
                        </Badge>
                      </div>

                      {reminder.notes && (
                        <p>{reminder.notes}</p>
                      )}

                      <div className="nexo-reminder-actions">
                        <Button
                          type="button"
                          variant={
                            reminder.completed
                              ? "secondary"
                              : "ghost"
                          }
                          size="sm"
                          icon={
                            reminder.completed ? (
                              <RotateCcw size={14} />
                            ) : (
                              <Check size={14} />
                            )
                          }
                          onClick={() =>
                            handleToggle(
                              reminder.id,
                              reminder.completed
                            )
                          }
                        >
                          {reminder.completed
                            ? "Reabrir"
                            : "Concluir"}
                        </Button>

                        <IconButton
                          icon={<Trash2 size={15} />}
                          label="Excluir lembrete"
                          variant="danger"
                          onClick={() =>
                            handleDelete(reminder.id)
                          }
                        />
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title="Sua agenda está vazia"
              description="Crie seu primeiro lembrete e o NEXO vai organizar seus próximos compromissos aqui."
            />
          )}

          {!!reminders.length && (
            <div className="nexo-reminder-agenda-footer">
              <Info size={13} />

              <span>
                Compromissos concluídos continuam no histórico
                até serem excluídos.
              </span>
            </div>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}