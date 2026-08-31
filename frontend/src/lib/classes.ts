// src/lib/classes.ts
import { api } from "@/shared/lib/api";

export type StudentClass = {
  id: string;
  title: string;
  instructor: string;
  code: string;
  assignmentsDue: number;
};

export async function fetchStudentClasses(): Promise<StudentClass[]> {
  return api<StudentClass[]>("/student/classes", { method: "GET" });
}

export async function joinStudentClass(input: { classCode: string; enrollmentKey: string }) {
  return api<StudentClass>("/student/classes/join", {
    method: "POST",
    body: input,
  });
}
