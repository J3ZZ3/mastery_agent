import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { STATUS_META } from "../../lib/constants.js";
import { formatDate, percent, relativeTime } from "../../lib/format.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  SectionHeading,
  Spinner,
  StatCard,
} from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import CopyButton from "../../components/CopyButton.jsx";
import { printPinSlips } from "../../lib/pinSlips.js";

export default function TeacherClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const { refresh } = useAuth();

  const [data, setData] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [pinInfo, setPinInfo] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", subject: "", grade: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classroom, classProgress] = await Promise.all([
        api.classDetail(classId),
        api.classProgress(classId),
      ]);
      setData(classroom);
      setProgress(classProgress);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        await refresh();
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [classId, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAdd = async (event) => {
    event?.preventDefault();
    setAddError("");
    if (!newName.trim()) {
      setAddError("Enter the student's name.");
      return;
    }

    setAdding(true);
    try {
      const result = await api.addStudent(classId, { displayName: newName.trim() });
      setAddOpen(false);
      setNewName("");
      setPinInfo({ ...result, kind: "created" });
      notify(`${result.student.displayName} added to the roster.`, "success");
      await load();
    } catch (err) {
      setAddError(err.message || "Could not add the student.");
    } finally {
      setAdding(false);
    }
  };

  const resetPin = async (student) => {
    setResettingId(student.id);
    try {
      const result = await api.resetStudentPin(classId, student.id);
      setPinInfo({ ...result, kind: "reset" });
      await load();
    } catch (err) {
      notify(err.message || "Could not reset the PIN.", "error");
    } finally {
      setResettingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.removeStudent(classId, removeTarget.id);
      notify(`${removeTarget.displayName} removed from the class.`, "success");
      setRemoveTarget(null);
      await load();
    } catch (err) {
      notify(err.message || "Could not remove the student.", "error");
    } finally {
      setRemoving(false);
    }
  };

  const confirmRotate = async () => {
    setRotating(true);
    try {
      const result = await api.rotateJoinCode(classId);
      setData((current) => (current ? { ...current, class: result.class } : current));
      setRotateOpen(false);
      notify("Class code rotated. Share the new code with your students.", "success");
    } catch (err) {
      notify(err.message || "Could not rotate the class code.", "error");
    } finally {
      setRotating(false);
    }
  };

  const openEdit = () => {
    const classroom = data?.class;
    if (!classroom) return;
    setEditForm({
      name: classroom.name,
      subject: classroom.subject,
      grade: classroom.grade ? String(classroom.grade) : "",
    });
    setEditError("");
    setEditOpen(true);
  };

  const submitEdit = async (event) => {
    event?.preventDefault();
    setEditError("");

    if (editForm.name.trim().length < 2) {
      setEditError("Give the class a name of at least 2 characters.");
      return;
    }

    setSavingEdit(true);
    try {
      const result = await api.updateClass(classId, {
        name: editForm.name.trim(),
        subject: editForm.subject.trim() || "Mathematics",
        grade: editForm.grade === "" ? null : Number(editForm.grade),
      });
      setData((current) => (current ? { ...current, class: result.class } : current));
      setEditOpen(false);
      notify("Class details updated.", "success");
      await load();
    } catch (err) {
      setEditError(err.message || "Could not update the class.");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await api.archiveClass(classId);
      notify("Class archived. You can restore it from your class list.", "success");
      navigate("/portal/teacher", { replace: true });
    } catch (err) {
      notify(err.message || "Could not archive the class.", "error");
    } finally {
      setArchiving(false);
    }
  };

  const restoreArchived = async () => {
    setRestoring(true);
    try {
      const result = await api.restoreClass(classId);
      setData((current) => (current ? { ...current, class: result.class } : current));
      notify("Class restored. Students can sign in with the class code again.", "success");
      await load();
    } catch (err) {
      notify(err.message || "Could not restore the class.", "error");
    } finally {
      setRestoring(false);
    }
  };

  const submitImport = async (event) => {
    event?.preventDefault();
    setImportError("");

    if (!csv.trim()) {
      setImportError("Paste at least one student name.");
      return;
    }

    setImporting(true);
    try {
      const result = await api.importStudents(classId, { csv });
      setImportOpen(false);
      setImportResult(result);
      setCsv("");
      notify(
        result.imported.length
          ? `Imported ${result.imported.length} student${result.imported.length === 1 ? "" : "s"}.`
          : "No new students were imported.",
        result.imported.length ? "success" : "info",
      );
      await load();
    } catch (err) {
      setImportError(err.message || "Could not import the roster.");
    } finally {
      setImporting(false);
    }
  };

  const printImported = () => {
    if (!importResult?.imported?.length) return;
    const opened = printPinSlips({
      className: classroom.name,
      joinUrl,
      joinCode: classroom.joinCode,
      slips: importResult.imported.map((entry) => ({
        displayName: entry.student.displayName,
        pin: entry.pin,
      })),
    });
    if (!opened) notify("Allow pop-ups to print the PIN slips.", "error");
  };

  const printOne = () => {
    if (!pinInfo) return;
    const opened = printPinSlips({
      className: classroom.name,
      joinUrl,
      joinCode: classroom.joinCode,
      slips: [{ displayName: pinInfo.student.displayName, pin: pinInfo.pin }],
    });
    if (!opened) notify("Allow pop-ups to print the PIN slip.", "error");
  };

  const confirmDeleteClass = async () => {
    setDeleting(true);
    try {
      await api.deleteClassPermanently(classId);
      notify("Class and all of its data were permanently deleted.", "success");
      navigate("/portal/teacher", { replace: true });
    } catch (err) {
      notify(err.message || "Could not delete the class.", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-600">
        <Spinner />
        Loading the roster…
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-bold">Class not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This class does not exist, or it belongs to another teacher.
        </p>
        <Link
          to="/portal/teacher"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to classes
        </Link>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load this class">
          {error.message}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  const classroom = data.class;
  const students = data.students;
  const joinLink = `${window.location.origin}/portal/student`;
  const progressById = new Map((progress?.students || []).map((item) => [item.id, item]));
  const stats = progress?.stats;

  return (
    <div className="space-y-7">
      <Link
        to="/portal/teacher"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-ink-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All classes
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Class roster</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{classroom.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {classroom.subject}
              {classroom.grade ? ` · Grade ${classroom.grade}` : ""}
            </p>
            {classroom.consentAttestedAt ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Consent attested {formatDate(classroom.consentAttestedAt)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                No consent attestation on file. Confirm permission before adding learners.
              </p>
            )}
            {classroom.archivedAt ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <Archive className="h-3 w-3" aria-hidden="true" />
                Archived {formatDate(classroom.archivedAt)} · students cannot sign in
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={classroom.joinCode} label="Copy class code" />
            <Button variant="secondary" icon={Pencil} onClick={openEdit}>
              Edit
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setRotateOpen(true)}>
              Rotate code
            </Button>
            {classroom.archivedAt ? (
              <Button
                variant="secondary"
                icon={ArchiveRestore}
                loading={restoring}
                onClick={restoreArchived}
              >
                Restore
              </Button>
            ) : (
              <Button variant="secondary" icon={Archive} onClick={() => setArchiveOpen(true)}>
                Archive
              </Button>
            )}
            <Button variant="mint" icon={UserPlus} onClick={() => setAddOpen(true)}>
              Add student
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Class code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.24em] text-ink-950">
              {classroom.joinCode}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Students enter this code with their name and PIN.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Join link</p>
            <p className="mt-1 truncate font-mono text-sm text-ink-950">{joinLink}</p>
            <div className="mt-2">
              <CopyButton value={joinLink} label="Copy join link" />
            </div>
          </div>
        </div>
      </Card>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Students"
            value={stats.totalStudents}
            hint={`${stats.notStarted} not started`}
            icon={Users}
            tone="sky"
          />
          <StatCard
            label="Active now"
            value={stats.activeStudents}
            hint="In a diagnostic, lesson or mastery check"
            icon={Activity}
            tone="mint"
          />
          <StatCard
            label="Recovered"
            value={stats.recovered}
            hint={`${stats.masteryRecovery}% of completed cycles met the threshold`}
            icon={CheckCircle2}
            tone="mint"
          />
          <StatCard
            label="Needs support"
            value={stats.needsSupport}
            hint="Review the evidence and recommend a next step"
            icon={AlertTriangle}
            tone="amber"
          />
        </div>
      ) : null}

      <SectionHeading
        title={`Roster · ${students.length}`}
        description="Each student gets a one-time PIN. Open a student to see their diagnosis, mastery result and Teacher Insight."
        action={
          classroom.archivedAt ? null : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={Upload}
                onClick={() => {
                  setImportError("");
                  setImportOpen(true);
                }}
              >
                Import CSV
              </Button>
              <Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>
                Add student
              </Button>
            </div>
          )
        }
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add each student by name. The server returns a 4-digit PIN once — share it with that student."
          action={
            classroom.archivedAt ? null : (
              <Button variant="mint" icon={UserPlus} onClick={() => setAddOpen(true)}>
                Add the first student
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-200">
            {students.map((student) => {
              const state = progressById.get(student.id);
              const status = state ? STATUS_META[state.status] || STATUS_META.not_started : null;
              return (
                <li
                  key={student.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={student.displayName} accent="sky" size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-950">{student.displayName}</p>
                      <p className="text-[11px] text-slate-500">
                        Added {formatDate(student.createdAt)} ·{" "}
                        {student.lastSeenAt ? `Last seen ${relativeTime(student.lastSeenAt)}` : "Never signed in"}
                        {state?.latestScore !== null && state?.latestScore !== undefined
                          ? ` · Mastery ${percent(state.latestScore)}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {status ? (
                      <Badge tone={status.tone}>{status.label}</Badge>
                    ) : (
                      <Badge tone={student.lastSeenAt ? "mint" : "slate"}>
                        {student.lastSeenAt ? "Active" : "Not joined"}
                      </Badge>
                    )}
                    <Link
                      to={`/portal/teacher/classes/${classId}/students/${student.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View progress
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={KeyRound}
                      loading={resettingId === student.id}
                      onClick={() => resetPin(student)}
                    >
                      Reset PIN
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => setRemoveTarget(student)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="border-rose-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-base font-bold text-rose-900">Danger zone</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Permanently delete this class, its roster, PINs and every learning session. This is the
              erasure path for a pilot cohort and cannot be undone.
            </p>
          </div>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => {
              setDeleteText("");
              setDeleteOpen(true);
            }}
          >
            Delete class permanently
          </Button>
        </div>
      </Card>

      <Modal
        open={addOpen}
        onClose={() => (adding ? null : setAddOpen(false))}
        title="Add a student"
        description="Use the name the student will recognise. It must be unique in this class."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button variant="mint" icon={UserPlus} onClick={submitAdd} loading={adding}>
              Add student
            </Button>
          </>
        }
      >
        <form onSubmit={submitAdd} className="space-y-4" noValidate>
          {addError ? <Alert tone="error">{addError}</Alert> : null}
          <Field id="studentName" label="Student name">
            <input
              id="studentName"
              type="text"
              required
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={inputClasses}
              placeholder="Thabo Mokoena"
            />
          </Field>
          <p className="text-xs leading-5 text-slate-500">
            The PIN is generated by the server and shown once after the student is created.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(pinInfo)}
        onClose={() => setPinInfo(null)}
        title={pinInfo?.kind === "created" ? "Student added" : "New PIN"}
        description="This PIN is shown once. Give it to the student now; it cannot be read again."
        footer={
          <>
            <Button variant="secondary" icon={Printer} onClick={printOne}>
              Print PIN slip
            </Button>
            <Button variant="mint" onClick={() => setPinInfo(null)}>
              Done
            </Button>
          </>
        }
      >
        {pinInfo ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {pinInfo.kind === "created" ? "PIN for" : "New PIN for"}{" "}
              <span className="font-semibold text-ink-950">{pinInfo.student.displayName}</span>
            </p>
            <div className="rounded-xl border border-mint-200 bg-mint-50 p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint-800">
                4-digit PIN
              </p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.35em] text-ink-950">
                {pinInfo.pin}
              </p>
            </div>
            <div className="flex justify-center">
              <CopyButton value={pinInfo.pin} label="Copy PIN" />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              The student signs in at <span className="font-mono">{joinLink}</span> with the class code{" "}
              <span className="font-mono font-semibold">{classroom.joinCode}</span>, their name and this PIN.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => (removing ? null : setRemoveTarget(null))}
        title="Remove student"
        description="This removes the student from the roster, deletes their PIN and permanently deletes their learning history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={confirmRemove} loading={removing}>
              Remove student
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Remove <span className="font-semibold text-ink-950">{removeTarget?.displayName}</span> from{" "}
          <span className="font-semibold text-ink-950">{classroom.name}</span>? Their diagnosis, mastery
          results and Teacher Insight will be erased.
        </p>
      </Modal>

      <Modal
        open={rotateOpen}
        onClose={() => (rotating ? null : setRotateOpen(false))}
        title="Rotate the class code"
        description="A new code is generated immediately. The old code stops working for new sign-ins."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRotateOpen(false)} disabled={rotating}>
              Cancel
            </Button>
            <Button variant="mint" icon={RotateCcw} onClick={confirmRotate} loading={rotating}>
              Rotate code
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          <p>
            Current code:{" "}
            <span className="font-mono font-semibold tracking-[0.18em] text-ink-950">
              {classroom.joinCode}
            </span>
          </p>
          <p>
            Students who are already signed in stay signed in. Use this if the code was shared too widely.
            Then give the new code only to your roster.
          </p>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => (savingEdit ? null : setEditOpen(false))}
        title="Edit class"
        description="Update the class name, subject or grade. The class code and roster stay the same."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button variant="mint" icon={Pencil} onClick={submitEdit} loading={savingEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={submitEdit} className="space-y-4" noValidate>
          {editError ? <Alert tone="error">{editError}</Alert> : null}

          <Field id="editClassName" label="Class name">
            <input
              id="editClassName"
              type="text"
              required
              maxLength={80}
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              className={inputClasses}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="editClassSubject" label="Subject">
              <input
                id="editClassSubject"
                type="text"
                maxLength={80}
                value={editForm.subject}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, subject: event.target.value }))
                }
                className={inputClasses}
              />
            </Field>

            <Field id="editClassGrade" label="Grade" hint="Optional.">
              <select
                id="editClassGrade"
                value={editForm.grade}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, grade: event.target.value }))
                }
                className={inputClasses}
              >
                <option value="">Not set</option>
                {[8, 9, 10, 11, 12].map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={archiveOpen}
        onClose={() => (archiving ? null : setArchiveOpen(false))}
        title="Archive this class"
        description="Archived classes keep their roster and learning history, but students cannot sign in and the class code stops working."
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="secondary" icon={Archive} onClick={confirmArchive} loading={archiving}>
              Archive class
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Archive <span className="font-semibold text-ink-950">{classroom.name}</span>? You can restore it
          from your class list at any time. Nothing is deleted.
        </p>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => (importing ? null : setImportOpen(false))}
        title="Import a roster"
        description="Paste one student name per line. The first column is used; an optional header row is ignored."
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button variant="mint" icon={Upload} onClick={submitImport} loading={importing}>
              Import students
            </Button>
          </>
        }
      >
        <form onSubmit={submitImport} className="space-y-4" noValidate>
          {importError ? <Alert tone="error">{importError}</Alert> : null}

          <Field
            id="rosterCsv"
            label="Student names"
            hint="One name per line, or paste a name column from a spreadsheet. Up to 100 names at a time."
          >
            <textarea
              id="rosterCsv"
              rows={8}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              className={`${inputClasses} font-mono text-xs`}
              placeholder={"Naledi Mokoena\nThabo Dlamini\nAnele Jacobs"}
            />
          </Field>

          <p className="text-xs leading-5 text-slate-500">
            Names already on the roster are skipped. Each new student gets a fresh 4-digit PIN that is
            shown once, after the import.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(importResult)}
        onClose={() => setImportResult(null)}
        title="Roster imported"
        description="Give each student their PIN now. It cannot be read again."
        footer={
          <>
            <Button
              variant="secondary"
              icon={Printer}
              onClick={printImported}
              disabled={!importResult?.imported?.length}
            >
              Print PIN slips
            </Button>
            <Button variant="mint" onClick={() => setImportResult(null)}>
              Done
            </Button>
          </>
        }
      >
        {importResult ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Imported <span className="font-semibold text-ink-950">{importResult.imported.length}</span>{" "}
              student{importResult.imported.length === 1 ? "" : "s"}
              {importResult.skipped.length
                ? ` and skipped ${importResult.skipped.length} row${
                    importResult.skipped.length === 1 ? "" : "s"
                  }`
                : ""}
              .
            </p>

            {importResult.imported.length ? (
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Student</th>
                      <th className="px-3 py-2 font-semibold">PIN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importResult.imported.map((entry) => (
                      <tr key={entry.student.id}>
                        <td className="px-3 py-2 font-medium text-ink-950">
                          {entry.student.displayName}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold tracking-[0.18em]">
                          {entry.pin}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {importResult.skipped.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">
                  Skipped rows
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">
                  {importResult.skipped.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <span className="font-semibold">{item.name}</span> — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => (deleting ? null : setDeleteOpen(false))}
        title="Delete this class permanently"
        description="This erases the class, every student, every PIN and every learning session. It cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={confirmDeleteClass}
              loading={deleting}
              disabled={deleteText !== classroom.name}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          <p>
            Type <span className="font-semibold text-ink-950">{classroom.name}</span> to confirm.
          </p>
          <Field id="deleteClassConfirm" label="Class name">
            <input
              id="deleteClassConfirm"
              type="text"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              className={inputClasses}
              autoComplete="off"
              placeholder={classroom.name}
            />
          </Field>
        </div>
      </Modal>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        Share only the class code and each student's own PIN. A student should never use another student's PIN.
      </p>
    </div>
  );
}
