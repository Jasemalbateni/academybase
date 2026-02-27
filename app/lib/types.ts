export type StaffRole = "مدرب" | "إداري" | "موظف";

export type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;

  /** إذا كان role = "موظف" */
  jobTitle?: string;

  monthlySalary: number; // راتب شهري
  branchIds: string[]; // الفروع المعيّن عليها (1 أو أكثر أو كل الفروع)
  assignMode: "single" | "multi" | "all";
  isActive: boolean;
};