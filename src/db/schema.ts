import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tingkat: varchar("tingkat", { length: 5 }).notNull(), // 'X', 'XI', 'XII'
    namaKelas: varchar("nama_kelas", { length: 5 }).notNull(), // 'a', 'b', 'c', 'd'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tingkat_nama_kelas_idx").on(table.tingkat, table.namaKelas),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  nama: varchar("nama", { length: 100 }).notNull(),
  role: varchar("role", { length: 10 }).notNull(), // 'guru' | 'siswa'
  nipNik: varchar("nip_nik", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 100 }),
  passwordHash: text("password_hash").notNull(),
  classId: uuid("class_id").references(() => classes.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  guruId: uuid("guru_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  attachmentUrl: text("attachment_url"),
  isTeamTask: boolean("is_team_task").default(false).notNull(),
  maxTeamMembers: integer("max_team_members").default(5).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 4. Tabel Submissions
export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  siswaId: uuid("siswa_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  submitUrl: text("submit_url").notNull(),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

// 5. Tabel Submission Members (Team Task Members)
export const submissionMembers = pgTable(
  "submission_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    siswaId: uuid("siswa_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("submission_siswa_idx").on(table.submissionId, table.siswaId),
  ],
);
