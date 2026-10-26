import { z } from 'zod';

const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const preserveEmptyNumber = value => value === null ? null : value === '' ? undefined : value;
const nonnegative = z.preprocess(preserveEmptyNumber, z.coerce.number().finite().nonnegative().optional().nullable());
const optionalInteger = z.preprocess(preserveEmptyNumber, z.coerce.number().int().nonnegative().optional().nullable());
export const idSchema = z.string().uuid();
const dateInput = z.union([
  z.string().datetime({ offset: true }),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))),
]);

const APPLICATION_STATUSES = [
  'INTERESTED', 'DRAFT', 'SUBMITTED', 'UNDER_EVALUATION', 'RESULT_RELEASED',
  'CLOSED', 'RECEIVED', 'UNDER_REVIEW', 'SHORTLISTED', 'REJECTED',
  'AWARDED', 'NOT_SELECTED', 'WITHDRAWN'
];

export const applicationCreateSchema = z.object({
  tenderId: text(200),
  status: z.enum(['INTERESTED', 'DRAFT', 'SUBMITTED']).default('INTERESTED'),
  notes: optionalText(5000),
  submittedSnapshot: z.any().optional().nullable(),
  submittedDocuments: z.any().optional().nullable(),
});

export const applicationUpdateSchema = z.object({
  status: z.enum(['INTERESTED', 'DRAFT']).optional(),
  notes: optionalText(5000),
}).refine(value => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const applicationWithdrawSchema = z.object({
  reason: optionalText(1000),
});

export const applicationReviewSchema = z.object({
  status: z.enum(['RECEIVED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'REJECTED', 'AWARDED', 'NOT_SELECTED']),
  reviewNotes: optionalText(5000),
  rejectionReason: optionalText(5000),
}).strict();

export const applicantQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
}).strict();

export const applicationInternalNoteSchema = z.object({
  reviewNotes: optionalText(5000),
}).strict().refine(value => value.reviewNotes !== undefined, 'An internal note field must be supplied.');

export const clarificationCreateSchema = z.object({
  subject: text(180),
  message: text(5000),
  responseDeadline: dateInput.nullable().optional(),
}).strict();

export const clarificationMessageSchema = z.object({
  message: text(5000),
}).strict();

export const tenderFaqQuestionSchema = z.object({
  question: text(3000),
}).strict();

export const tenderFaqCreateSchema = z.object({
  question: text(3000),
  answer: text(5000),
}).strict();

export const tenderFaqReviewSchema = z.object({
  answer: optionalText(5000),
  status: z.enum(['PUBLISHED', 'REJECTED']),
}).strict().refine(value => value.status !== 'PUBLISHED' || Boolean(value.answer?.trim()), {
  path: ['answer'], message: 'An answer is required before publishing a FAQ.',
});

export const partnerSchema = z.object({
  companyName: text(180), offeredCapabilities: text(3000), contactPerson: text(180),
  contactEmail: z.string().trim().email().max(254), contactPhone: optionalText(40),
});

export const procurementSchema = z.object({
  title: text(180), category: text(100), description: text(10000), estimatedValue: nonnegative,
  location: optionalText(160), quantity: optionalText(120), openingDate: dateInput.nullable().optional(),
  deliveryDuration: optionalText(160), submissionDeadline: z.string().datetime({ offset: true }),
  minTurnover: nonnegative,
  minExperienceYears: optionalInteger,
  requiredCertifications: z.array(text(100)).max(50).default([]),
  locationRestrictions: z.array(text(160)).max(50).default([]),
  requiredDocuments: z.array(text(180)).max(40).default([]),
  intent: z.enum(['draft', 'publish']).default('publish'),
});

export const procurementUpdateSchema = procurementSchema.partial().omit({ intent: true }).extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
})
  .refine(value => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const verificationSchema = z.object({
  type: z.enum(['BUSINESS', 'ORGANIZATION']), organizationName: text(180),
  organizationType: optionalText(120), address: optionalText(1000),
  businessName: optionalText(180), contactPerson: text(180),
  email: z.string().trim().email().max(254), contactPhone: optionalText(40),
  registrationNo: optionalText(100),
  documents: z.array(z.object({ name: text(180), url: z.string().url().max(2048) })).max(20).default([]),
}).refine(value => value.type !== 'ORGANIZATION' || Boolean(value.organizationType && value.address), {
  path: ['address'], message: 'Organization type and address are required for organization verification.',
});

export const decisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']), decisionNote: optionalText(3000),
}).refine(value => value.status !== 'REJECTED' || Boolean(value.decisionNote?.trim()), { path: ['decisionNote'], message: 'A reason is required when rejecting a request.' });

export const tenderResultPublishSchema = z.object({
  summary: text(5000),
}).strict();

export const verificationFilterSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).optional(),
  type: z.enum(['BUSINESS', 'ORGANIZATION']).optional(),
});

const criteriaSchema = z.object({
  minTurnover: nonnegative,
  minExperienceYears: optionalInteger,
  requiredCertifications: z.array(text(100)).max(50).optional().nullable(),
  locationRestrictions: z.array(text(160)).max(50).optional().nullable(),
}).passthrough();

export const eligibilityEvaluateSchema = z.object({
  criteria: criteriaSchema.optional(),
  minTurnover: nonnegative,
  minExperienceYears: optionalInteger,
  requiredCertifications: z.array(text(100)).max(50).optional().nullable(),
  locationRestrictions: z.array(text(160)).max(50).optional().nullable(),
  businessProfile: z.object({
    businessName: optionalText(180),
    category: optionalText(100),
    location: optionalText(160),
    annualTurnover: nonnegative,
    yearsOfExperience: optionalInteger,
    certifications: z.array(text(100)).max(50).optional().nullable(),
    productsServices: z.array(text(120)).max(50).optional().nullable(),
    previousProjects: optionalText(10000),
  }).passthrough().optional().nullable(),
}).passthrough();

export const profileUpdateSchema = z.object({
  businessName: text(180),
  category: text(100),
  location: text(160),
  annualTurnover: z.preprocess(
    preserveEmptyNumber,
    z.coerce.number().finite().nonnegative('Annual turnover cannot be negative.')
  ),
  yearsOfExperience: z.preprocess(
    preserveEmptyNumber,
    z.coerce.number().int('Years of experience must be an integer.').nonnegative('Years of experience cannot be negative.')
  ),
  certifications: z.array(text(100)).max(50).default([]),
  shareInDirectory: z.boolean().default(false),
  publicContactEmail: z.preprocess(value => value === '' ? null : value, z.string().trim().email().max(254).nullable().optional()),
  contactPerson: optionalText(180),
  contactEmail: z.preprocess(value => value === '' ? null : value, z.string().trim().email().max(254).nullable().optional()),
  contactPhone: optionalText(40),
  description: optionalText(5000),
  registrationNo: optionalText(100),
  productsServices: z.array(text(120)).max(50).default([]),
  previousProjects: optionalText(10000),
});

export const documentUploadSchema = z.object({
  name: text(180),
  category: text(100),
  fileName: z.string().trim().min(1).max(255).refine(value => !/[\\/\u0000-\u001f]/.test(value), 'Use a plain file name without path characters.'),
  fileBase64: z.string().min(1).max(11_184_812).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'The document file data is invalid.'),
  mimeType: z.string().trim().max(100).default('application/pdf'),
}).refine(value => value.fileBase64.length % 4 === 0, { path: ['fileBase64'], message: 'The document file data is incomplete.' });

export const documentUpdateSchema = z.object({
  name: text(180).optional(),
  category: text(100).optional(),
}).refine(value => Object.keys(value).length > 0, 'At least one field must be supplied.');

export const tenderExtractSchema = z.object({
  text: z.string().trim().max(100000).optional(),
  tenderId: optionalText(100),
  fileName: z.string().trim().min(1).max(180).optional(),
  fileBase64: z.string().max(11_184_812).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
}).refine(value => Boolean(value.text || value.fileBase64), { message: 'Paste tender text or upload a PDF before extracting.' });

export const procurementPdfSchema = z.object({
  fileName: z.string().trim().min(1).max(180).refine(value => !/[\\/\u0000-\u001f]/.test(value), 'Use a plain file name without path characters.'),
  fileBase64: z.string().min(1).max(11_184_812).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'The PDF file data is invalid.'),
}).refine(value => value.fileBase64.length % 4 === 0, { path: ['fileBase64'], message: 'The PDF file data is incomplete.' });

export const tenderListQuerySchema = z.object({
  search: z.string().trim().min(1).max(180).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().min(1).max(160).optional(),
  deadlineFrom: dateInput.optional(),
  deadlineTo: dateInput.optional(),
  minValue: nonnegative,
  maxValue: nonnegative,
  status: z.string().trim().max(50).optional(),
  eligibility: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).refine(value => {
  if (!value.deadlineFrom || !value.deadlineTo) return true;
  return new Date(value.deadlineFrom).getTime() <= new Date(value.deadlineTo).getTime();
}, { path: ['deadlineTo'], message: 'deadlineTo must be on or after deadlineFrom.' })
.refine(value => {
  if (value.minValue != null && value.maxValue != null) {
    return value.minValue <= value.maxValue;
  }
  return true;
}, { path: ['maxValue'], message: 'maxValue must be greater than or equal to minValue.' });

export const tenderCreateSchema = z.object({
  referenceNumber: text(120), title: text(300), category: optionalText(100),
  issuingAuthority: optionalText(200), location: optionalText(160), quantity: optionalText(120),
  openingDate: dateInput.nullable().optional(), deliveryDuration: optionalText(160),
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED', 'UPCOMING']).default('ACTIVE'),
  submissionDeadline: dateInput.nullable().optional(), estimatedValue: nonnegative,
  officialLink: z.string().url().max(2048).optional().nullable(),
});

export const tenderUpdateSchema = z.object({
  title: text(300).optional(),
  category: optionalText(100),
  issuingAuthority: optionalText(200),
  location: optionalText(160),
  quantity: optionalText(120),
  openingDate: dateInput.nullable().optional(),
  deliveryDuration: optionalText(160),
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED', 'UPCOMING']).optional(),
  submissionDeadline: dateInput.nullable().optional(),
  estimatedValue: nonnegative,
  officialLink: z.string().url().max(2048).optional().nullable(),
  description: optionalText(10000),
  requiredDocuments: z.array(text(180)).max(40).optional(),
}).refine(value => Object.keys(value).length > 0, 'At least one field must be supplied.');
