import { AppError } from "./errors.js";

export const parseBody = (schema, body, label) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      400,
      `Invalid ${label} request.`,
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
};
