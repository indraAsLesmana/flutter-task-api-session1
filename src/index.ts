import { neon } from "@neondatabase/serverless";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  classes,
  submissionMembers,
  submissions,
  tasks,
  users,
} from "./db/schema";

const app = new Hono();
app.use("*", cors());

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

app.get("/api/classes", async (c) => {
  const db = getDb();
  try {
    const data = await db.select().from(classes);
    return c.json({ success: true, data });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/auth/register", async (c) => {
  const db = getDb();
  const { nama, role, nipNik, email, password, classId } = await c.req.json();

  try {
    const newUser = await db
      .insert(users)
      .values({
        nama,
        role,
        nipNik,
        email: email || null,
        passwordHash: password,
        classId: role === "guru" ? null : classId,
      })
      .returning();

    return c.json({ success: true, data: newUser[0] }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  const db = getDb();
  const { nipNik, password } = await c.req.json();

  try {
    const foundUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.nipNik, nipNik), eq(users.passwordHash, password)));

    if (foundUsers.length === 0) {
      return c.json(
        { success: false, message: "NIP/NIK atau password salah" },
        401,
      );
    }

    return c.json({ success: true, data: foundUsers[0] }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/tasks", async (c) => {
  const db = getDb();
  const {
    guruId,
    classId,
    description,
    startDate,
    endDate,
    attachmentUrl,
    isTeamTask,
    maxTeamMembers,
  } = await c.req.json();

  try {
    const newTask = await db
      .insert(tasks)
      .values({
        guruId,
        classId,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        attachmentUrl: attachmentUrl || null,
        isTeamTask: isTeamTask ?? false,
        maxTeamMembers: maxTeamMembers
          ? parseInt(maxTeamMembers.toString(), 10)
          : 5,
      })
      .returning();

    return c.json({ success: true, data: newTask[0] }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/tasks", async (c) => {
  const db = getDb();
  const classId = c.req.query("classId");
  const guruId = c.req.query("guruId");
  const siswaId = c.req.query("siswaId");

  try {
    const conditions = [];
    if (classId) conditions.push(eq(tasks.classId, classId));
    if (guruId) conditions.push(eq(tasks.guruId, guruId));

    const taskList =
      conditions.length > 0
        ? await db
            .select()
            .from(tasks)
            .where(and(...conditions))
        : await db.select().from(tasks);

    if (siswaId) {
      const userDirectSubmissions = await db
        .select()
        .from(submissions)
        .where(eq(submissions.siswaId, siswaId));

      const teamMemberRows = await db
        .select({
          submissionId: submissionMembers.submissionId,
          taskId: submissions.taskId,
          submitUrl: submissions.submitUrl,
          notes: submissions.notes,
          submittedAt: submissions.submittedAt,
        })
        .from(submissionMembers)
        .innerJoin(
          submissions,
          eq(submissionMembers.submissionId, submissions.id),
        )
        .where(eq(submissionMembers.siswaId, siswaId));

      const submissionMap = new Map();
      for (const s of userDirectSubmissions) {
        submissionMap.set(s.taskId, s);
      }
      for (const tm of teamMemberRows) {
        if (!submissionMap.has(tm.taskId)) {
          submissionMap.set(tm.taskId, tm);
        }
      }

      const allSubIds = Array.from(submissionMap.values())
        .map((s: any) => s.id || s.submissionId)
        .filter((id) => typeof id === "string" && id.length > 0);

      const memberMap = new Map<string, any[]>();
      if (allSubIds.length > 0) {
        const membersWithUser = await db
          .select({
            submissionId: submissionMembers.submissionId,
            siswaId: users.id,
            nama: users.nama,
            nipNik: users.nipNik,
          })
          .from(submissionMembers)
          .innerJoin(users, eq(submissionMembers.siswaId, users.id))
          .where(inArray(submissionMembers.submissionId, allSubIds));

        for (const m of membersWithUser) {
          if (!memberMap.has(m.submissionId)) {
            memberMap.set(m.submissionId, []);
          }
          memberMap.get(m.submissionId)!.push({
            siswaId: m.siswaId,
            nama: m.nama,
            nipNik: m.nipNik,
          });
        }
      }

      const data = taskList.map((task) => {
        const sub = submissionMap.get(task.id);
        const subId = sub ? sub.id || sub.submissionId : null;
        const members = subId ? memberMap.get(subId) || [] : [];

        return {
          ...task,
          isSubmitted: !!sub,
          submittedAt: sub ? sub.submittedAt : null,
          submitUrl: sub ? sub.submitUrl : null,
          submissionNotes: sub ? sub.notes : null,
          teamMembers: members,
        };
      });

      return c.json({ success: true, data });
    }

    return c.json({ success: true, data: taskList });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default app;
