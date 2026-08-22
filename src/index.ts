import { neon } from "@neondatabase/serverless";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
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

app.get("/api/tasks/:id/submissions", async (c) => {
  const db = getDb();
  const taskId = c.req.param("id");

  try {
    const taskData = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (taskData.length === 0) {
      return c.json({ success: false, message: "Tugas tidak ditemukan" }, 404);
    }
    const task = taskData[0];

    const studentsInClass = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "siswa"), eq(users.classId, task.classId)));

    const taskSubmissions = await db
      .select()
      .from(submissions)
      .where(eq(submissions.taskId, taskId));

    const subIds = taskSubmissions.map((s) => s.id);
    const memberMap = new Map<string, any[]>();

    if (subIds.length > 0) {
      const membersWithUser = await db
        .select({
          submissionId: submissionMembers.submissionId,
          siswaId: users.id,
          nama: users.nama,
          nipNik: users.nipNik,
        })
        .from(submissionMembers)
        .innerJoin(users, eq(submissionMembers.siswaId, users.id))
        .where(inArray(submissionMembers.submissionId, subIds));

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

    const studentSubmissionMap = new Map<
      string,
      { sub: any; members: any[] }
    >();

    for (const sub of taskSubmissions) {
      const members = memberMap.get(sub.id) || [];
      studentSubmissionMap.set(sub.siswaId, { sub, members });
      for (const m of members) {
        if (!studentSubmissionMap.has(m.siswaId)) {
          studentSubmissionMap.set(m.siswaId, { sub, members });
        }
      }
    }

    const studentList = studentsInClass.map((student) => {
      const entry = studentSubmissionMap.get(student.id);
      return {
        siswaId: student.id,
        nama: student.nama,
        nipNik: student.nipNik,
        email: student.email,
        isSubmitted: !!entry,
        submitUrl: entry ? entry.sub.submitUrl : null,
        notes: entry ? entry.sub.notes : null,
        submittedAt: entry ? entry.sub.submittedAt : null,
        teamMembers: entry ? entry.members : [],
      };
    });

    return c.json({
      success: true,
      data: {
        task,
        students: studentList,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/submissions", async (c) => {
  const db = getDb();
  const { taskId, siswaId, submitUrl, notes, teamMemberIds } =
    await c.req.json();

  try {
    const existingDirect = await db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.taskId, taskId), eq(submissions.siswaId, siswaId)),
      );

    let resultSubmission;
    if (existingDirect.length > 0) {
      const updated = await db
        .update(submissions)
        .set({
          submitUrl,
          notes: notes || null,
          submittedAt: new Date(),
        })
        .where(eq(submissions.id, existingDirect[0].id))
        .returning();
      resultSubmission = updated[0];
    } else {
      const inserted = await db
        .insert(submissions)
        .values({
          taskId,
          siswaId,
          submitUrl,
          notes: notes || null,
        })
        .returning();
      resultSubmission = inserted[0];
    }

    // Save team members in submission_members junction table
    const rawList = Array.isArray(teamMemberIds)
      ? [siswaId, ...teamMemberIds]
      : [siswaId];
    const memberList: string[] = Array.from(
      new Set(
        rawList
          .filter((id) => id && typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim()),
      ),
    );

    await db
      .delete(submissionMembers)
      .where(eq(submissionMembers.submissionId, resultSubmission.id));

    const memberRows = memberList.map((mId: string) => ({
      submissionId: resultSubmission.id,
      siswaId: mId,
    }));
    await db.insert(submissionMembers).values(memberRows);

    return c.json({ success: true, data: resultSubmission }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/students/search", async (c) => {
  const db = getDb();
  const classId = c.req.query("classId");
  const query = c.req.query("query") || "";

  if (!classId) {
    return c.json(
      { success: false, message: "classId query parameter is required" },
      400,
    );
  }

  try {
    const conditions = [eq(users.role, "siswa"), eq(users.classId, classId)];

    if (query.trim()) {
      const pattern = `%${query.trim()}%`;
      conditions.push(
        or(ilike(users.nama, pattern), ilike(users.nipNik, pattern))!,
      );
    }

    const result = await db
      .select({
        id: users.id,
        siswaId: users.id,
        nama: users.nama,
        nipNik: users.nipNik,
        email: users.email,
        classId: users.classId,
      })
      .from(users)
      .where(and(...conditions))
      .limit(20);

    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default app;
