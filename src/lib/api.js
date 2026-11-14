const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed with status ${response.status}.`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export const api = {
  health: () => request("/health"),

  // Classroom pilot
  me: () => request("/auth/me"),
  authConfig: () => request("/auth/config"),
  teacherSignup: (body) =>
    request("/auth/teacher/signup", { method: "POST", body: JSON.stringify(body) }),
  teacherLogin: (body) =>
    request("/auth/teacher/login", { method: "POST", body: JSON.stringify(body) }),
  teacherForgotPassword: (body) =>
    request("/auth/teacher/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  teacherResetPassword: (body) =>
    request("/auth/teacher/reset-password", { method: "POST", body: JSON.stringify(body) }),
  teacherVerifyEmail: (body) =>
    request("/auth/teacher/verify-email", { method: "POST", body: JSON.stringify(body) }),
  resendTeacherVerification: () =>
    request("/auth/teacher/resend-verification", { method: "POST" }),
  studentLogin: (body) =>
    request("/auth/student/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  classes: () => request("/classes"),
  archivedClasses: () => request("/classes/archived"),
  createClass: (body) =>
    request("/classes", { method: "POST", body: JSON.stringify(body) }),
  classDetail: (classId) => request(`/classes/${classId}`),
  classProgress: (classId) => request(`/classes/${classId}/progress`),
  classStudentProgress: (classId, studentId) =>
    request(`/classes/${classId}/students/${studentId}/progress`),
  updateClass: (classId, body) =>
    request(`/classes/${classId}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveClass: (classId) => request(`/classes/${classId}`, { method: "DELETE" }),
  restoreClass: (classId) =>
    request(`/classes/${classId}/restore`, { method: "POST" }),
  rotateJoinCode: (classId) =>
    request(`/classes/${classId}/join-code`, { method: "POST" }),
  deleteClassPermanently: (classId) =>
    request(`/classes/${classId}/permanent`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    }),
  addStudent: (classId, body) =>
    request(`/classes/${classId}/students`, { method: "POST", body: JSON.stringify(body) }),
  importStudents: (classId, body) =>
    request(`/classes/${classId}/students/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resetStudentPin: (classId, studentId) =>
    request(`/classes/${classId}/students/${studentId}/pin`, { method: "POST" }),
  removeStudent: (classId, studentId) =>
    request(`/classes/${classId}/students/${studentId}`, { method: "DELETE" }),
  deleteStudentHistory: (classId, studentId) =>
    request(`/classes/${classId}/students/${studentId}/history`, { method: "DELETE" }),
  planInfo: () => request("/plan/info"),
  uploadResource: async (slot, file) => {
    const response = await fetch(`/api/plan/resources/${slot}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": file.name,
      },
      body: file,
    });
    const data = await parseResponse(response);
    if (!response.ok) {
      const error = new Error(
        data?.error || `Upload failed with status ${response.status}.`,
      );
      error.status = response.status;
      throw error;
    }
    return data;
  },
  resourceOutline: (slot) => request(`/plan/resources/${slot}/outline`),
  resourcePages: (slot, from = 1, to = null) =>
    request(
      `/plan/resources/${slot}/pages?from=${from}${to ? `&to=${to}` : ""}`,
    ),
  analyzeResource: (slot, goal = null) =>
    request(`/plan/resources/${slot}/analyze`, {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),
  agentRun: (runId) => request(`/plan/agent-runs/${runId}`),
  agentRuns: (limit = 10) => request(`/plan/agent-runs?limit=${limit}`),
  studentClass: () => request("/student/class"),
  studentProgress: () => request("/student/sessions"),
  startStudentSession: (body = {}) =>
    request("/student/sessions", { method: "POST", body: JSON.stringify(body) }),
  studentSession: (sessionId) => request(`/student/sessions/${sessionId}`),
  submitStudentDiagnostic: (sessionId, answers) =>
    request(`/student/sessions/${sessionId}/diagnostic`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  checkStudentPractice: (sessionId, questionId, answer) =>
    request(`/student/sessions/${sessionId}/practice/check`, {
      method: "POST",
      body: JSON.stringify({ questionId, answer }),
    }),
  submitStudentPractice: (sessionId, answers) =>
    request(`/student/sessions/${sessionId}/practice`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  submitStudentMastery: (sessionId, answers) =>
    request(`/student/sessions/${sessionId}/mastery`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
};
