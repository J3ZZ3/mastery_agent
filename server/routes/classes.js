import { Router } from "express";
import { asyncRoute } from "../lib/asyncRoute.js";
import { parseBody } from "../lib/parseBody.js";
import { requestSchemas } from "../validation/schemas.js";
import { requireStudent, requireTeacher } from "../auth/middleware.js";
import {
  addStudent,
  archiveClass,
  createClass,
  deleteClassPermanently,
  deleteStudentHistory,
  getClass,
  getStudentClass,
  listClasses,
  listStudents,
  removeStudent,
  resetStudentPin,
  rotateJoinCode,
  updateClass,
} from "../services/classroomService.js";
import {
  checkStudentPractice,
  getStudentLearningProgress,
  getStudentLearningSession,
  requireStudentSession,
  startStudentLearningSession,
  submitStudentDiagnostic,
  submitStudentMastery,
  submitStudentPractice,
} from "../services/classroomLearningService.js";
import { openSessionEventStream } from "../services/sessionStream.js";
import {
  getClassProgress,
  getClassStudentProgress,
} from "../services/classroomProgressService.js";

/* ------------------------------ teacher ------------------------------ */

export const classesRouter = Router();

classesRouter.use(requireTeacher);

const teacherId = (req) => req.auth.teacher.id;

classesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ classes: await listClasses(teacherId(req)) });
  }),
);

classesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.createClass, req.body, "class");
    const classroom = await createClass(teacherId(req), body);
    res.status(201).json({ class: classroom });
  }),
);

classesRouter.get(
  "/:classId",
  asyncRoute(async (req, res) => {
    res.json(await getClass(teacherId(req), req.params.classId));
  }),
);

classesRouter.patch(
  "/:classId",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.updateClass, req.body, "class update");
    const classroom = await updateClass(teacherId(req), req.params.classId, body);
    res.json({ class: classroom });
  }),
);

classesRouter.delete(
  "/:classId",
  asyncRoute(async (req, res) => {
    const classroom = await archiveClass(teacherId(req), req.params.classId);
    res.json({ class: classroom });
  }),
);

classesRouter.post(
  "/:classId/join-code",
  asyncRoute(async (req, res) => {
    const classroom = await rotateJoinCode(teacherId(req), req.params.classId);
    res.json({ class: classroom });
  }),
);

classesRouter.delete(
  "/:classId/permanent",
  asyncRoute(async (req, res) => {
    parseBody(requestSchemas.confirmPermanentDelete, req.body, "class deletion");
    await deleteClassPermanently(teacherId(req), req.params.classId);
    res.status(204).end();
  }),
);

classesRouter.get(
  "/:classId/students",
  asyncRoute(async (req, res) => {
    res.json({ students: await listStudents(teacherId(req), req.params.classId) });
  }),
);

classesRouter.get(
  "/:classId/progress",
  asyncRoute(async (req, res) => {
    res.json(await getClassProgress(teacherId(req), req.params.classId));
  }),
);

classesRouter.get(
  "/:classId/students/:studentId/progress",
  asyncRoute(async (req, res) => {
    res.json(
      await getClassStudentProgress(
        teacherId(req),
        req.params.classId,
        req.params.studentId,
      ),
    );
  }),
);

classesRouter.post(
  "/:classId/students",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.addStudent, req.body, "student");
    const result = await addStudent(teacherId(req), req.params.classId, body);
    res.status(201).json(result);
  }),
);

classesRouter.post(
  "/:classId/students/:studentId/pin",
  asyncRoute(async (req, res) => {
    const result = await resetStudentPin(
      teacherId(req),
      req.params.classId,
      req.params.studentId,
    );
    res.json(result);
  }),
);

classesRouter.delete(
  "/:classId/students/:studentId",
  asyncRoute(async (req, res) => {
    await removeStudent(teacherId(req), req.params.classId, req.params.studentId);
    res.status(204).end();
  }),
);

classesRouter.delete(
  "/:classId/students/:studentId/history",
  asyncRoute(async (req, res) => {
    const result = await deleteStudentHistory(
      teacherId(req),
      req.params.classId,
      req.params.studentId,
    );
    res.json(result);
  }),
);

/* ------------------------------ student ------------------------------ */

export const studentRouter = Router();

studentRouter.use(requireStudent);

studentRouter.get(
  "/class",
  asyncRoute(async (req, res) => {
    res.json(await getStudentClass(req.auth.student.id));
  }),
);

const studentId = (req) => req.auth.student.id;

studentRouter.get(
  "/sessions",
  asyncRoute(async (req, res) => {
    res.json(await getStudentLearningProgress(studentId(req)));
  }),
);

studentRouter.post(
  "/sessions",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.startClassroomSession, req.body ?? {}, "session");
    const result = await startStudentLearningSession(studentId(req), body);
    res.status(result.resumed ? 200 : 201).json(result);
  }),
);

studentRouter.get(
  "/sessions/:sessionId",
  asyncRoute(async (req, res) => {
    res.json(await getStudentLearningSession(studentId(req), req.params.sessionId));
  }),
);

studentRouter.get("/sessions/:sessionId/events", async (req, res, next) => {
  try {
    const session = await requireStudentSession(studentId(req), req.params.sessionId);
    openSessionEventStream(req, res, session);
  } catch (error) {
    next(error);
  }
});

studentRouter.post(
  "/sessions/:sessionId/diagnostic",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.diagnostic, req.body, "diagnostic");
    const result = await submitStudentDiagnostic(
      studentId(req),
      req.params.sessionId,
      body.answers,
    );
    res.json(result);
  }),
);

studentRouter.post(
  "/sessions/:sessionId/practice/check",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.practiceCheck, req.body, "practice check");
    const result = await checkStudentPractice(studentId(req), req.params.sessionId, body);
    res.json(result);
  }),
);

studentRouter.post(
  "/sessions/:sessionId/practice",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.practice, req.body, "practice");
    const result = await submitStudentPractice(
      studentId(req),
      req.params.sessionId,
      body.answers,
    );
    res.json(result);
  }),
);

studentRouter.post(
  "/sessions/:sessionId/mastery",
  asyncRoute(async (req, res) => {
    const body = parseBody(requestSchemas.mastery, req.body, "mastery");
    const result = await submitStudentMastery(
      studentId(req),
      req.params.sessionId,
      body.answers,
    );
    res.json(result);
  }),
);
