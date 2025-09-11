import { z } from "zod";

// Optional: set your tenant domain via env, else allow any domain
const tenantDomain = process.env.NEXT_PUBLIC_TENANT_EMAIL_DOMAIN;

export const importEmailSchema = z.object({
  mailbox: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .refine(
      (e) => {
        if (!tenantDomain) return true;
        return e.toLowerCase().endsWith(`@${tenantDomain.toLowerCase()}`);
      },
      { message: tenantDomain ? `Mailbox must be in @${tenantDomain}` : "Invalid mailbox domain" }
    ),
  text: z.string().trim().min(2, "Enter at least 2 characters"),
  top: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(25),
});

export type ImportEmailInput = z.infer<typeof importEmailSchema>;