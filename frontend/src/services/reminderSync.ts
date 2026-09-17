import type { Reminder } from "../types";

// Mirroring is committed with the account sync upload, including offline retries.
export async function mirrorReminderUpsert(_reminder: Reminder) {}
export async function mirrorReminderDelete(_id?: number) {}
export async function mirrorReminderDeleteMany(_ids: number[]) {}
