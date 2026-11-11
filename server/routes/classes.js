import { Router } from "express";
import { asyncRoute } from "../lib/asyncRoute.js";
import { parseBody } from "../lib/parseBody.js";
import { requestSchemas } from "../validation/schemas.js";
import { requireStudent, requireTeacher } from "../auth/middleware.js";
import {
  addStudent,
  archiveClass,
  createClass,
  getClass,
  getStudentClass,
  listClasses,
  listStudents,
  removeStudent,
  resetStudentPin,
  updateClass,
} from "../services/classroomService.js";

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

classesRouter.get(
  "/:classId/students",
  asyncRoute(async (req, res) => {
    res.json({ students: await listStudents(teacherId(req), req.params.classId) });
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

/* ------------------------------ student ------------------------------ */

export const studentRouter = Router();

studentRouter.use(requireStudent);

studentRouter.get(
  "/class",
  asyncRoute(async (req, res) => {
    res.json(await getStudentClass(req.auth.student.id));
  }),
);
