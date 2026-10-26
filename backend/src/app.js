import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { authenticate, requireRole } from './auth.js';
import { errorHandler, asyncRoute, HttpError } from './errors.js';
import { applicationCreateSchema, applicationReviewSchema, applicationWithdrawSchema, decisionSchema, idSchema, applicationUpdateSchema, partnerSchema, procurementSchema, procurementPdfSchema, procurementUpdateSchema, verificationFilterSchema, verificationSchema, eligibilityEvaluateSchema, profileUpdateSchema, documentUploadSchema, documentUpdateSchema, tenderExtractSchema, tenderListQuerySchema, tenderCreateSchema, tenderUpdateSchema, applicantQuerySchema, applicationInternalNoteSchema, clarificationCreateSchema, clarificationMessageSchema, tenderFaqQuestionSchema, tenderFaqCreateSchema, tenderFaqReviewSchema, tenderResultPublishSchema } from './validation.js';
import { evaluateEligibility } from './services/eligibilityEngine.js';
import { extractTenderDetails } from './services/tenderExtractor.js';
import { extractPdfDocument } from './services/pdfDocumentExtractor.js';
import { getDb } from './db.js';

const BUSINESS = 'BUSINESS';
const ORG = 'ORGANIZATION';
const ADMIN = 'ADMIN';
const parse = (schema, input) => schema.parse(input);
const tenderWithApplication = { tender: true };
const redactDocumentBinary = document => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return document;
  const { fileBase64, ...metadata } = document;
  return metadata;
};
const businessApplicationView = item => {
  if (!item || typeof item !== 'object') return item;
  const { reviewNotes, ...visible } = item;
  const finalStatuses = ['AWARDED', 'NOT_SELECTED', 'REJECTED', 'RESULT_RELEASED'];
  const resultPublished = Boolean(item.tender?.result?.publishedAt);
  const resultPending = finalStatuses.includes(item.status) && !resultPublished;
  if (resultPending) {
    visible.status = 'UNDER_EVALUATION';
    delete visible.rejectionReason;
  }
  return {
    ...visible,
    ...(item.tender ? { tender: { ...item.tender, result: resultPublished ? item.tender.result : null } } : {}),
    ...(Array.isArray(item.statusHistory) ? { statusHistory: item.statusHistory.filter(entry => !resultPending || !finalStatuses.includes(entry?.status)).map(entry => {
      if (['Procuring Organization', 'Administrator'].includes(entry?.changedBy)) {
        const { note, ...publicEntry } = entry;
        return publicEntry;
      }
      return entry;
    }) } : {}),
  };
};
const tenderSnapshotFields = [
  'title', 'description', 'category', 'issuingAuthority', 'location', 'quantity', 'openingDate',
  'deliveryDuration', 'status', 'submissionDeadline', 'estimatedValue', 'officialLink',
  'eligibilityCriteria', 'requiredDocuments',
];
function tenderSnapshot(tender) {
  return Object.fromEntries(tenderSnapshotFields.map(field => {
    let value = tender?.[field] ?? null;
    if ((field === 'submissionDeadline' || field === 'openingDate') && value) value = new Date(value).toISOString();
    if (field === 'estimatedValue' && value !== null) value = String(value);
    if (field === 'requiredDocuments') value = Array.isArray(value) ? value : [];
    return [field, value];
  }));
}
function extractionMetadata(extraction, sourceType, appliedFields = null, processing = {}) {
  const suggestedFields = Object.keys(extraction?.fieldConfidence || {});
  const sourceFields = appliedFields || suggestedFields.filter(field => Number(extraction?.fieldConfidence?.[field]) > 0);
  return {
    sourceType,
    extractor: extraction?.source || 'DETERMINISTIC_PARSER',
    extractedAt: new Date().toISOString(),
    overallConfidence: Number(extraction?.overallConfidence || 0),
    fieldConfidence: extraction?.fieldConfidence || {},
    fieldEvidence: extraction?.fieldEvidence || {},
    fieldEvidencePages: extraction?.fieldEvidencePages || {},
    fieldSources: Object.fromEntries(sourceFields.map(field => [field, 'EXTRACTED_SUGGESTION'])),
    missingInformation: extraction?.missingInformation || [],
    ocrStatus: processing.ocrStatus || 'NOT_APPLICABLE',
    pagesProcessed: Number(processing.pagesProcessed || 0),
    reviewStatus: 'NEEDS_REVIEW',
  };
}
function extractionValues(extraction) {
  return {
    summary: extraction.summary,
    metadata: extraction.metadata,
    eligibilityCriteria: extraction.eligibilityCriteria,
    requiredDocuments: extraction.requiredDocuments,
  };
}
function pdfSourceType(processing) {
  if (processing?.method === 'OCR') return 'PDF_OCR';
  if (processing?.method === 'TEXT_LAYER') return 'PDF_TEXT';
  return 'PDF_UNREADABLE';
}
function extractedDate(value) {
  if (!value) return null;
  const dmy = String(value).trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM|IST)?)?$/i);
  let date;
  if (dmy) {
    let hour = Number(dmy[4] || 0);
    if (/PM/i.test(dmy[6] || '') && hour < 12) hour += 12;
    if (/AM/i.test(dmy[6] || '') && hour === 12) hour = 0;
    date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), hour, Number(dmy[5] || 0)));
  } else date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
const sameVersionValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function tenderFaqView(item) {
  if (!item) return item;
  const { askedByAuthId, answeredByAuthId, ...visible } = item;
  return visible;
}
async function recordTenderVersion(db, tender, { actorId = null, source = 'ORGANIZATION_EDIT', previous = null } = {}) {
  if (!tender?.id || !db?.tenderVersion?.create || !db?.tenderVersion?.findFirst) return null;
  const currentSnapshot = tenderSnapshot(tender);
  let latest = await db.tenderVersion.findFirst({ where: { tenderId: tender.id }, orderBy: { versionNumber: 'desc' } });
  if (!latest && previous) {
    const previousSnapshot = tenderSnapshot(previous);
    await db.tenderVersion.create({ data: {
      tenderId: tender.id, versionNumber: 1, snapshot: previousSnapshot,
      changedFields: [], source: 'BASELINE', createdByAuthId: null,
    } });
    latest = { versionNumber: 1, snapshot: previousSnapshot };
  }
  if (latest && sameVersionValue(tenderSnapshot(latest.snapshot), currentSnapshot)) return latest;
  const previousSnapshot = latest?.snapshot ? tenderSnapshot(latest.snapshot) : null;
  const changedFields = previousSnapshot
    ? tenderSnapshotFields.filter(field => !sameVersionValue(previousSnapshot[field], currentSnapshot[field]))
    : tenderSnapshotFields;
  return db.tenderVersion.create({ data: {
    tenderId: tender.id,
    versionNumber: (latest?.versionNumber || 0) + 1,
    snapshot: currentSnapshot,
    changedFields,
    createdByAuthId: actorId,
    source,
  } });
}
function tenderReminderState(tender) {
  if (String(tender?.status || '').toUpperCase() === 'CLOSED') return 'CLOSED';
  if (!tender?.submissionDeadline) return 'NO_DEADLINE';
  const days = Math.ceil((new Date(tender.submissionDeadline).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return 'PAST_DUE';
  if (days <= 7) return 'DUE_WITHIN_7_DAYS';
  if (days <= 30) return 'DUE_WITHIN_30_DAYS';
  return 'UPCOMING';
}
async function writeAuditEvent(db, { actorAuthId, actorRole, action, entityType, entityId, metadata = {} }) {
  if (!db?.adminAuditEvent?.create) return null;
  return db.adminAuditEvent.create({ data: { actorAuthId, actorRole, action, entityType, entityId: String(entityId), metadata } });
}
async function resolveTenderId(db, value) {
  const tender = idSchema.safeParse(value).success
    ? await db.tender.findUnique({ where: { id: value }, select: { id: true } })
    : await db.tender.findUnique({ where: { referenceNumber: value }, select: { id: true } });
  if (!tender) throw new HttpError(404, 'Tender not found.');
  return tender.id;
}
async function latestApprovedOrganization(db, ownerAuthId) {
  const latest = await db.verificationRequest.findFirst({
    where: { ownerAuthId, type: 'ORGANIZATION' }, orderBy: { createdAt: 'desc' },
  });
  return latest?.status === 'APPROVED' && latest.organizationType && latest.address ? latest : null;
}

export function createApp({ db = getDb(), auth = authenticate } = {}) {
  const app = express();
  const origins = (process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  app.disable('x-powered-by');
  app.use(cors({ origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new HttpError(403, 'This website is not allowed to access the API.'));
  }, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use(express.json({ limit: '12mb', strict: true }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ status: 'ok' }));
  api.use(auth);

  async function addLatestTenderVersion(item) {
    if (!item?.tender?.id) return item;
    const [latest, result] = await Promise.all([
      db?.tenderVersion?.findFirst ? db.tenderVersion.findFirst({
        where: { tenderId: item.tender.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      }) : Promise.resolve(null),
      db?.tenderResult?.findUnique
        ? db.tenderResult.findUnique({ where: { tenderId: item.tender.id } })
        : Promise.resolve(null),
    ]);
    return { ...item, tender: { ...item.tender, latestVersionNumber: latest?.versionNumber || 0, result } };
  }

  async function addLatestTenderVersions(items) {
    return Promise.all((items || []).map(addLatestTenderVersion));
  }

  async function findApplicationForRole(id, identity) {
    const item = await db.application.findUnique({ where: { id }, include: tenderWithApplication });
    if (!item) throw new HttpError(404, 'Application not found.');
    if (identity.role === BUSINESS && item.ownerAuthId !== identity.id) throw new HttpError(404, 'Application not found.');
    if (identity.role === ORG) {
      const tenderRef = item.tender?.referenceNumber;
      const procurement = tenderRef && await db.organizationProcurement.findFirst({
        where: { referenceNumber: tenderRef, ownerAuthId: identity.id },
      });
      if (!procurement) throw new HttpError(404, 'Application not found.');
    }
    return item;
  }

  function publicClarification(item) {
    if (!item) return item;
    const { createdByAuthId, messages, ...visible } = item;
    return {
      ...visible,
      messages: (Array.isArray(messages) ? messages : []).map(({ senderAuthId, ...message }) => message),
    };
  }

  api.get('/me', (req, res) => res.json({ item: { id: req.auth.id, email: req.auth.email, role: req.auth.role } }));

  api.get('/applications', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const items = await db.application.findMany({
      where: { ownerAuthId: req.auth.id },
      include: tenderWithApplication,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ items: (await addLatestTenderVersions(items)).map(businessApplicationView) });
  }));

  api.get('/applications/:id', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const item = await db.application.findUnique({
      where: { id },
      include: tenderWithApplication,
    });
    if (!item) throw new HttpError(404, 'Application not found.');

    if (req.auth.role === BUSINESS) {
      if (item.ownerAuthId !== req.auth.id) {
        throw new HttpError(404, 'Application not found.');
      }
    } else if (req.auth.role === ORG) {
      const tenderRef = item.tender?.referenceNumber;
      if (!tenderRef || !db.organizationProcurement?.findFirst) {
        throw new HttpError(404, 'Application not found.');
      }
      const procurement = await db.organizationProcurement.findFirst({
        where: { referenceNumber: tenderRef, ownerAuthId: req.auth.id },
      });
      if (!procurement) {
        throw new HttpError(404, 'Application not found.');
      }
    } else if (req.auth.role !== ADMIN) {
      throw new HttpError(404, 'Application not found.');
    }

    const withLatestVersion = await addLatestTenderVersion(item);
    res.json({ item: req.auth.role === BUSINESS ? businessApplicationView(withLatestVersion) : withLatestVersion });
  }));

  api.get('/applications/:id/documents/:docId/download', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const docId = String(req.params.docId || '').trim();

    const application = await db.application.findUnique({
      where: { id },
      include: tenderWithApplication,
    });
    if (!application) throw new HttpError(404, 'Application not found.');

    if (req.auth.role === BUSINESS) {
      if (application.ownerAuthId !== req.auth.id) {
        throw new HttpError(404, 'Application not found.');
      }
    } else if (req.auth.role === ORG) {
      const tenderRef = application.tender?.referenceNumber;
      if (!tenderRef || !db.organizationProcurement?.findFirst) {
        throw new HttpError(404, 'Application not found.');
      }
      const procurement = await db.organizationProcurement.findFirst({
        where: { referenceNumber: tenderRef, ownerAuthId: req.auth.id },
      });
      if (!procurement) {
        throw new HttpError(404, 'Application not found.');
      }
    } else if (req.auth.role !== ADMIN) {
      throw new HttpError(404, 'Application not found.');
    }

    const docs = Array.isArray(application.submittedDocuments) ? application.submittedDocuments : [];
    let doc = docs.find(d => String(d.id) === docId || String(d.requirementName) === docId || String(d.name) === docId);
    if (!doc && Array.isArray(application.revisions)) {
      for (const rev of application.revisions) {
        const revDocs = Array.isArray(rev?.submittedDocuments) ? rev.submittedDocuments : [];
        doc = revDocs.find(d => String(d.id) === docId || String(d.requirementName) === docId || String(d.name) === docId);
        if (doc) break;
      }
    }
    if (!doc) throw new HttpError(404, 'Document not found in this application.');

    let fileBuffer = null;
    if (doc.fileBase64) {
      fileBuffer = Buffer.from(doc.fileBase64, 'base64');
    } else if (doc.id && db.businessDocument?.findUnique) {
      const vaultDoc = await db.businessDocument.findUnique({ where: { id: doc.id }, select: { fileData: true, mimeType: true } });
      fileBuffer = vaultDoc?.fileData || null;
    }

    if (!fileBuffer) throw new HttpError(404, 'Document binary data is not available.');

    res.set({
      'Content-Type': doc.mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName || 'document.pdf')}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(fileBuffer);
  }));

  api.post('/applications', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const allowedClientStatuses = ['INTERESTED', 'DRAFT', 'SUBMITTED'];
    if (req.body.status && !allowedClientStatuses.includes(req.body.status)) {
      throw new HttpError(400, 'Invalid application status. Business users may only create draft, interested, or submitted applications.');
    }

    if (req.body.reviewNotes !== undefined || req.body.rejectionReason !== undefined) {
      throw new HttpError(400, 'Review notes and rejection reasons can only be set by organizations or administrators.');
    }

    const { tenderId: tenderReference, ...data } = parse(applicationCreateSchema, req.body);
    const tenderId = await resolveTenderId(db, tenderReference);

    let tender = null;
    if (db.tender?.findUnique) {
      tender = await db.tender.findUnique({ where: { id: tenderId } });
    }
    if (!tender && db.tender) {
      throw new HttpError(404, 'Tender not found.');
    }

    if (tender?.status && ['CLOSED', 'ARCHIVED'].includes(tender.status.toUpperCase())) {
      throw new HttpError(400, 'This tender is closed or archived and no longer accepting applications.');
    }

    if (tender?.submissionDeadline && new Date() > new Date(tender.submissionDeadline)) {
      throw new HttpError(400, 'The submission deadline for this tender has passed.');
    }

    const existing = await db.application.findUnique({
      where: { ownerAuthId_tenderId: { ownerAuthId: req.auth.id, tenderId } },
    });

    const isSubmitting = data.status === 'SUBMITTED';
    const latestTenderVersion = isSubmitting && db?.tenderVersion?.findFirst
      ? await db.tenderVersion.findFirst({
        where: { tenderId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true },
      })
      : null;
    const submittedTenderVersionNumber = latestTenderVersion?.versionNumber || existing?.tenderVersionNumber || null;
    let updatedRevisions = Array.isArray(existing?.revisions) ? [...existing.revisions] : [];

    if (existing) {
      if (['WITHDRAWN', 'CLOSED', 'AWARDED'].includes(existing.status)) {
        throw new HttpError(400, `Cannot modify an application that is ${existing.status.toLowerCase()}.`);
      }

      if (['SUBMITTED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'NOT_SELECTED', 'REJECTED'].includes(existing.status)) {
        if (!isSubmitting) {
          throw new HttpError(400, 'An application has already been submitted for this tender and cannot be overwritten with a draft.');
        }

        // When resubmitting, retain the previous submitted snapshot and documents as a separate immutable revision
        if (existing.submittedSnapshot || existing.submissionDate) {
          const priorRevision = {
            revisionNumber: updatedRevisions.length + 1,
            referenceNo: existing.referenceNo,
            submissionDate: existing.submissionDate ? new Date(existing.submissionDate).toISOString() : null,
            submittedSnapshot: existing.submittedSnapshot,
            submittedDocuments: existing.submittedDocuments,
            tenderVersionNumber: existing.tenderVersionNumber ?? null,
            notes: existing.notes,
            archivedAt: new Date().toISOString(),
          };
          updatedRevisions.push(priorRevision);
        }
      }
    }

    let preservedDocuments = [];
    const now = new Date();
    const nowIso = now.toISOString();

    const MAX_PER_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB per vault file limit
    const MAX_TOTAL_DOCUMENTS_BYTES = 25 * 1024 * 1024; // 25 MB supported total size limit across all attachments

    if (isSubmitting) {
      const submittedList = Array.isArray(data.submittedDocuments) ? data.submittedDocuments : [];

      const requiredDocs = Array.isArray(tender?.requiredDocuments) ? tender.requiredDocuments : [];
      if (requiredDocs.length > 0) {
        for (const reqDoc of requiredDocs) {
          const reqName = typeof reqDoc === 'string' ? reqDoc : reqDoc.name;
          const found = submittedList.some(d => (d.requirementName || d.name) === reqName);
          if (!found) {
            throw new HttpError(400, `Missing required document: "${reqName}". All required documents must be attached before submission.`);
          }
        }
      }

      let totalAttachedBytes = 0;

      for (const doc of submittedList) {
        if (!doc.id || !db.businessDocument?.findFirst) {
          if (doc.fileBase64) {
            const inlineBytes = Buffer.byteLength(doc.fileBase64, 'base64');
            if (inlineBytes > MAX_PER_DOCUMENT_BYTES) {
              throw new HttpError(400, `Document "${doc.fileName || doc.name || 'file'}" exceeds the supported per-file limit of 8 MB.`);
            }
            totalAttachedBytes += inlineBytes;
          }
          preservedDocuments.push({ ...doc, submittedAt: nowIso });
          continue;
        }

        const vaultDoc = await db.businessDocument.findFirst({
          where: { id: doc.id, ownerAuthId: req.auth.id },
        });

        if (!vaultDoc) {
          throw new HttpError(400, `Document "${doc.name || doc.id}" does not exist in your vault or does not belong to your account.`);
        }

        const fileSize = vaultDoc.fileSize || (vaultDoc.fileData ? vaultDoc.fileData.length : 0);
        if (fileSize > MAX_PER_DOCUMENT_BYTES) {
          throw new HttpError(400, `Document "${vaultDoc.fileName}" exceeds the supported per-file limit of 8 MB.`);
        }
        totalAttachedBytes += fileSize;

        preservedDocuments.push({
          id: vaultDoc.id,
          name: vaultDoc.name,
          fileName: vaultDoc.fileName,
          fileSize: vaultDoc.fileSize,
          mimeType: vaultDoc.mimeType || 'application/pdf',
          category: vaultDoc.category,
          requirementName: doc.requirementName || vaultDoc.name,
          submittedAt: nowIso,
          fileBase64: vaultDoc.fileData ? vaultDoc.fileData.toString('base64') : (doc.fileBase64 || null),
        });
      }

      if (totalAttachedBytes > MAX_TOTAL_DOCUMENTS_BYTES) {
        throw new HttpError(400, `Total document size (${(totalAttachedBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the supported limit of 25 MB across all attachments. Please optimize file sizes.`);
      }
    } else {
      preservedDocuments = Array.isArray(data.submittedDocuments) ? data.submittedDocuments : (existing?.submittedDocuments || []);
    }

    const referenceNo = existing?.referenceNo || (isSubmitting
      ? `APP-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`
      : null);

    const submissionDate = isSubmitting
      ? (existing?.submissionDate && !isSubmitting ? existing.submissionDate : now)
      : null;

    let updatedHistory;
    if (existing && Array.isArray(existing.statusHistory) && existing.statusHistory.length > 0) {
      updatedHistory = [
        ...existing.statusHistory,
        ...(isSubmitting && existing.status !== 'SUBMITTED' ? [{
          status: 'SUBMITTED',
          timestamp: nowIso,
          note: updatedRevisions.length > 0
            ? `Application revised and resubmitted before tender closing deadline (Revision #${updatedRevisions.length + 1}).`
            : 'Application officially submitted with verified credentials and profile snapshot.',
          changedBy: 'Applicant',
        }] : isSubmitting ? [{
          status: 'SUBMITTED',
          timestamp: nowIso,
          note: `Application revised and resubmitted before tender closing deadline (Revision #${updatedRevisions.length + 1}).`,
          changedBy: 'Applicant',
        }] : []),
      ];
    } else {
      updatedHistory = [{
        status: data.status,
        timestamp: nowIso,
        note: isSubmitting
          ? 'Application officially submitted with verified credentials and profile snapshot.'
          : 'Application draft created in workspace.',
        changedBy: 'Applicant',
      }];
    }

    let item;
    if (existing) {
      item = await db.application.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          referenceNo,
          submissionDate: submissionDate || existing.submissionDate,
          submittedSnapshot: data.submittedSnapshot !== undefined ? data.submittedSnapshot : existing.submittedSnapshot,
          submittedDocuments: preservedDocuments,
          tenderVersionNumber: isSubmitting ? submittedTenderVersionNumber : (existing.tenderVersionNumber ?? null),
          revisions: updatedRevisions,
          statusHistory: updatedHistory,
        },
        include: tenderWithApplication,
      });
    } else {
      item = await db.application.create({
        data: {
          ownerAuthId: req.auth.id,
          tenderId,
          status: data.status,
          notes: data.notes || null,
          referenceNo,
          submissionDate,
          submittedSnapshot: data.submittedSnapshot || null,
          submittedDocuments: preservedDocuments,
          tenderVersionNumber: isSubmitting ? submittedTenderVersionNumber : null,
          revisions: [],
          statusHistory: updatedHistory,
        },
        include: tenderWithApplication,
      });
    }

    res.status(201).json({ item: businessApplicationView(await addLatestTenderVersion(item)) });
  }));

  api.put('/applications/:id', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);

    if (req.body.status === 'SUBMITTED') {
      throw new HttpError(400, 'Applications cannot be submitted via PUT. Submissions must be performed through the application submission workflow.');
    }

    if (req.body.status && !['INTERESTED', 'DRAFT'].includes(req.body.status)) {
      throw new HttpError(400, 'Business users cannot set organization review or decision statuses.');
    }

    if (
      req.body.submittedSnapshot !== undefined ||
      req.body.submittedDocuments !== undefined ||
      req.body.referenceNo !== undefined ||
      req.body.submissionDate !== undefined ||
      req.body.statusHistory !== undefined ||
      req.body.reviewNotes !== undefined ||
      req.body.rejectionReason !== undefined ||
      req.body.revisions !== undefined
    ) {
      throw new HttpError(400, 'Cannot modify submitted snapshots, submitted documents, official reference, submission timestamp, status history, or review fields via PUT.');
    }

    const data = parse(applicationUpdateSchema, req.body);

    const existing = db.application?.findFirst
      ? await db.application.findFirst({
          where: { id, ownerAuthId: req.auth.id },
          include: { tender: true },
        })
      : db.application?.findUnique
      ? await db.application.findUnique({
          where: { id },
          include: { tender: true },
        })
      : null;

    if (!existing && db.application) {
      throw new HttpError(404, 'Application not found.');
    }

    if (existing) {
      if (['WITHDRAWN', 'CLOSED', 'AWARDED'].includes(existing.status)) {
        throw new HttpError(400, `Cannot modify an application that is ${existing.status.toLowerCase()}.`);
      }
      if (existing.tender?.submissionDeadline && new Date() > new Date(existing.tender.submissionDeadline)) {
        throw new HttpError(400, 'Application editing is not permitted because the submission deadline has passed.');
      }

      const wasPreviouslySubmitted = [
        'SUBMITTED',
        'UNDER_REVIEW',
        'UNDER_EVALUATION',
        'SHORTLISTED',
        'NOT_SELECTED',
        'REJECTED',
        'RECEIVED',
      ].includes(existing.status) || !!existing.submissionDate || !!existing.submittedSnapshot;

      if (wasPreviouslySubmitted) {
        if (data.status && ['DRAFT', 'INTERESTED'].includes(data.status)) {
          throw new HttpError(400, 'Cannot change an already submitted or reviewed application back to draft or interested. Revisions must be submitted through the application submission workflow.');
        }
        if (data.notes !== undefined) {
          throw new HttpError(400, 'Cannot edit notes on an already submitted or reviewed application directly via PUT. Please use the supported submission workflow to submit a new revision.');
        }
        throw new HttpError(400, 'Cannot edit an already submitted or reviewed application directly via PUT. Please use the supported submission workflow to submit a new revision.');
      }
    }

    const result = await db.application.updateMany({
      where: { id, ownerAuthId: req.auth.id },
      data: {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    if (!result.count) throw new HttpError(404, 'Application not found.');
    res.json({ item: businessApplicationView(await db.application.findUnique({ where: { id }, include: tenderWithApplication })) });
  }));

  api.post('/applications/:id/withdraw', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { reason } = parse(applicationWithdrawSchema, req.body || {});

    const existing = await db.application.findFirst({
      where: { id, ownerAuthId: req.auth.id },
      include: { tender: true },
    });
    if (!existing) throw new HttpError(404, 'Application not found.');

    if (existing.status === 'WITHDRAWN') {
      throw new HttpError(400, 'This application has already been withdrawn.');
    }
    if (['AWARDED', 'CLOSED'].includes(existing.status)) {
      throw new HttpError(400, `Cannot withdraw an application that is ${existing.status.toLowerCase()}.`);
    }
    if (existing.tender?.submissionDeadline && new Date() > new Date(existing.tender.submissionDeadline)) {
      throw new HttpError(400, 'Application cannot be withdrawn after the submission deadline.');
    }

    const now = new Date().toISOString();
    const updatedHistory = [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      {
        status: 'WITHDRAWN',
        timestamp: now,
        note: `Application formally withdrawn by applicant. Reason: ${reason || 'Applicant request'}`,
        changedBy: 'Applicant',
      },
    ];

    const updated = await db.application.update({
      where: { id },
      data: {
        status: 'WITHDRAWN',
        rejectionReason: reason || 'Withdrawn by applicant',
        statusHistory: updatedHistory,
      },
      include: tenderWithApplication,
    });

    res.json({ item: businessApplicationView(updated), message: 'Application successfully withdrawn.' });
  }));

  api.get('/saved-opportunities', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const rows = await db.savedOpportunity.findMany({ where: { ownerAuthId: req.auth.id }, include: { tender: true }, orderBy: { createdAt: 'desc' } });
    const items = await Promise.all(rows.map(async row => {
      const latest = await db.tenderVersion?.findFirst?.({ where: { tenderId: row.tenderId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      const latestVersionNumber = latest?.versionNumber || 0;
      return {
        ...row,
        latestVersionNumber,
        unseenVersionCount: Math.max(0, latestVersionNumber - (row.seenVersion || 0)),
        reminderState: tenderReminderState(row.tender),
      };
    }));
    res.json({ items });
  }));
  api.post('/saved-opportunities/:tenderId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.tenderId);
    const latest = await db.tenderVersion?.findFirst?.({ where: { tenderId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    const item = await db.savedOpportunity.upsert({ where: { ownerAuthId_tenderId: { ownerAuthId: req.auth.id, tenderId } }, create: { ownerAuthId: req.auth.id, tenderId, seenVersion: latest?.versionNumber || 0 }, update: {}, include: { tender: true } });
    res.status(201).json({ item });
  }));
  api.post('/saved-opportunities/:tenderId/acknowledge', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.tenderId);
    const latest = await db.tenderVersion?.findFirst?.({ where: { tenderId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    const result = await db.savedOpportunity.updateMany({ where: { ownerAuthId: req.auth.id, tenderId }, data: { seenVersion: latest?.versionNumber || 0 } });
    if (!result.count) throw new HttpError(404, 'Saved opportunity not found.');
    res.json({ item: { tenderId, seenVersion: latest?.versionNumber || 0 } });
  }));
  api.delete('/saved-opportunities/:tenderId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.tenderId);
    await db.savedOpportunity.deleteMany({ where: { ownerAuthId: req.auth.id, tenderId } });
    res.status(204).end();
  }));

  api.get('/jv/:tenderId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.tenderId);
    const items = await db.partnerListing.findMany({ where: { tenderId }, orderBy: { createdAt: 'desc' } });
    res.json({ items });
  }));
  api.post('/jv/:tenderId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.tenderId);
    const data = parse(partnerSchema, req.body);
    const item = await db.partnerListing.create({ data: { ...data, tenderId, ownerAuthId: req.auth.id } });
    res.status(201).json({ item });
  }));
  api.get('/jv-partners', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const items = await db.businessProfile.findMany({
      where: { shareInDirectory: true, ownerAuthId: { not: req.auth.id } },
      select: { id: true, businessName: true, category: true, location: true, annualTurnover: true, yearsOfExperience: true, certifications: true, publicContactEmail: true, updatedAt: true },
      orderBy: { businessName: 'asc' },
    });
    res.json({ items });
  }));
  api.get('/jv-partners/saved', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const items = await db.savedPartner.findMany({ where: { ownerAuthId: req.auth.id, partnerProfile: { shareInDirectory: true } }, include: { partnerProfile: true }, orderBy: { createdAt: 'desc' } });
    res.json({ items: items.map(({ partnerProfile, ...saved }) => ({ ...saved, partner: {
      id: partnerProfile.id, businessName: partnerProfile.businessName, category: partnerProfile.category,
      location: partnerProfile.location, annualTurnover: partnerProfile.annualTurnover,
      yearsOfExperience: partnerProfile.yearsOfExperience, certifications: partnerProfile.certifications,
      publicContactEmail: partnerProfile.publicContactEmail,
    } })) });
  }));
  api.post('/jv-partners/saved/:profileId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const partnerProfileId = parse(idSchema, req.params.profileId);
    const partner = await db.businessProfile.findUnique({ where: { id: partnerProfileId } });
    if (!partner || !partner.shareInDirectory || partner.ownerAuthId === req.auth.id) throw new HttpError(404, 'Shared partner profile not found.');
    const item = await db.savedPartner.upsert({ where: { ownerAuthId_partnerProfileId: { ownerAuthId: req.auth.id, partnerProfileId } }, create: { ownerAuthId: req.auth.id, partnerProfileId }, update: {} });
    res.status(201).json({ item });
  }));
  api.delete('/jv-partners/saved/:profileId', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const partnerProfileId = parse(idSchema, req.params.profileId);
    await db.savedPartner.deleteMany({ where: { ownerAuthId: req.auth.id, partnerProfileId } });
    res.status(204).end();
  }));

  api.get('/organization/procurements', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const items = await db.organizationProcurement.findMany({
      where: req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }, orderBy: { createdAt: 'desc' },
      omit: { pdfData: true },
    });
    res.json({ items });
  }));
  api.get('/organization/verification-status', requireRole(BUSINESS, ORG), asyncRoute(async (req, res) => {
    const item = await db.verificationRequest.findFirst({ where: { ownerAuthId: req.auth.id, type: 'ORGANIZATION' }, orderBy: { createdAt: 'desc' } });
    res.json({ item: item || null });
  }));
  api.post('/organization/procurements', requireRole(ORG), asyncRoute(async (req, res) => {
    const { intent, ...data } = parse(procurementSchema, req.body);
    let approved = null;
    if (intent === 'publish') {
      approved = await latestApprovedOrganization(db, req.auth.id);
      if (!approved) throw new HttpError(403, 'Complete your organization profile before publishing a tender.');
    }
    const item = await db.organizationProcurement.create({ data: {
      ...data, ownerAuthId: req.auth.id,
      ...(data.submissionDeadline ? { submissionDeadline: new Date(data.submissionDeadline) } : {}),
      ...(data.openingDate ? { openingDate: new Date(data.openingDate) } : {}),
      status: intent === 'draft' ? 'DRAFT' : 'PUBLISHED',
      referenceNumber: `ORG-${randomUUID().slice(0, 8).toUpperCase()}`,
    } });
    if (item.status === 'PUBLISHED' && db?.tender?.create) {
      const tender = await db.tender.create({ data: {
        referenceNumber: item.referenceNumber, title: item.title, description: item.description, category: item.category,
        issuingAuthority: approved?.organizationName || item.ownerAuthId, status: 'ACTIVE',
        submissionDeadline: item.submissionDeadline, estimatedValue: item.estimatedValue, location: item.location,
        quantity: item.quantity, openingDate: item.openingDate, deliveryDuration: item.deliveryDuration,
        extractionMetadata: item.extractionMetadata,
        eligibilityCriteria: { minTurnover: item.minTurnover, minExperienceYears: item.minExperienceYears, requiredCertifications: item.requiredCertifications, locationRestrictions: item.locationRestrictions },
        requiredDocuments: item.requiredDocuments,
        officialLink: null,
      } });
      await recordTenderVersion(db, tender, { actorId: req.auth.id, source: 'INITIAL_PUBLISH' });
    }
    res.status(201).json({ item });
  }));
  api.post('/organization/procurements/:id/pdf', requireRole(ORG), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { fileName, fileBase64 } = parse(procurementPdfSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ownerAuthId: req.auth.id }, select: { id: true } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const bytes = Buffer.from(fileBase64, 'base64');
    if (bytes.length < 8 || bytes.length > 8 * 1024 * 1024 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new HttpError(400, 'Upload a valid PDF file no larger than 8 MB.');
    }
    let pdfExtraction;
    try { pdfExtraction = await extractPdfDocument(bytes); }
    catch (error) { if (error instanceof TypeError) throw new HttpError(400, error.message); throw error; }
    const extractedText = String(pdfExtraction?.text || '').slice(0, 100_000);
    let extraction = null;
    if (extractedText) extraction = await extractTenderDetails(extractedText, { localOnly: true });
    const extractionSourceType = pdfSourceType(pdfExtraction);
    const metadata = extraction
      ? extractionMetadata(extraction, extractionSourceType, null, pdfExtraction)
      : {
        sourceType: extractionSourceType, extractor: 'NO_TEXT_EXTRACTED', extractedAt: new Date().toISOString(),
        overallConfidence: 0, fieldConfidence: {}, fieldEvidence: {}, fieldEvidencePages: {}, fieldSources: {},
        missingInformation: [pdfExtraction?.message || 'No text could be extracted from the PDF.'],
        ocrStatus: pdfExtraction?.ocrStatus || 'FAILED', pagesProcessed: Number(pdfExtraction?.pagesProcessed || 0),
        reviewStatus: 'NEEDS_MANUAL_INPUT',
      };
    await db.organizationProcurement.update({ where: { id }, data: {
      pdfFileName: fileName, pdfData: bytes, extractedText: extractedText || null,
      extractionMetadata: metadata,
    } });
    if (db?.tenderExtraction?.create) {
      await db.tenderExtraction.create({ data: {
        procurementId: id, sourceType: extractionSourceType, sourceName: fileName,
        extractor: extraction?.source || 'NO_TEXT_EXTRACTED', overallConfidence: extraction?.overallConfidence || 0,
        extractedValues: extraction ? extractionValues(extraction) : {}, fieldConfidence: extraction?.fieldConfidence || {},
        fieldEvidence: extraction?.fieldEvidence || {}, fieldEvidencePages: extraction?.fieldEvidencePages || {},
        missingInformation: metadata.missingInformation,
        reviewStatus: extraction ? 'NEEDS_REVIEW' : 'NEEDS_MANUAL_INPUT',
        createdByAuthId: req.auth.id,
      } });
    }
    const message = pdfExtraction.message || (pdfExtraction.method === 'OCR'
      ? `PDF stored. Local OCR read ${pdfExtraction.pagesProcessed} page(s). Verify every value against the notice before publishing.`
      : (extractedText
        ? 'PDF stored. Review the extracted information and edit requirements before publishing.'
        : 'PDF stored, but no readable text was extracted. Enter confirmed requirements manually.'));
    res.json({ item: { fileName, extractedText, extraction, extractionMethod: pdfExtraction.method, ocrStatus: pdfExtraction.ocrStatus, pagesProcessed: pdfExtraction.pagesProcessed, message } });
  }));
  api.get('/organization/procurements/:id/pdf', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const procurement = await db.organizationProcurement.findFirst({
      where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) },
      select: { pdfData: true, pdfFileName: true },
    });
    if (!procurement?.pdfData) throw new HttpError(404, 'PDF not found.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(procurement.pdfFileName || 'tender.pdf')}`, 'X-Content-Type-Options': 'nosniff' });
    res.send(procurement.pdfData);
  }));
  api.patch('/organization/procurements/:id', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const data = parse(procurementUpdateSchema, req.body);
    if (data.status === 'PUBLISHED' && req.auth.role !== ADMIN) {
      const approved = await latestApprovedOrganization(db, req.auth.id);
      if (!approved) throw new HttpError(403, 'Complete your organization profile before publishing a tender.');
    }
    const result = await db.organizationProcurement.updateMany({
      where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) },
      data: {
        ...data,
        ...(data.submissionDeadline ? { submissionDeadline: new Date(data.submissionDeadline) } : {}),
        ...(data.openingDate ? { openingDate: new Date(data.openingDate) } : {}),
      },
    });
    if (!result.count) throw new HttpError(404, 'Procurement listing not found.');
    let item = await db.organizationProcurement.findUnique({ where: { id }, omit: { pdfData: true } });
    const manuallyConfirmed = ['title', 'category', 'description', 'estimatedValue', 'location', 'quantity', 'openingDate', 'deliveryDuration', 'submissionDeadline', 'minTurnover', 'minExperienceYears', 'requiredCertifications', 'locationRestrictions', 'requiredDocuments'].filter(field => Object.hasOwn(data, field));
    if (item?.extractionMetadata && manuallyConfirmed.length) {
      const fieldSources = { ...(item.extractionMetadata.fieldSources || {}) };
      const fieldConfidence = { ...(item.extractionMetadata.fieldConfidence || {}) };
      for (const field of manuallyConfirmed) { fieldSources[field] = 'MANUALLY_CONFIRMED'; fieldConfidence[field] = 1; }
      const confirmedMetadata = {
        ...item.extractionMetadata, fieldSources, fieldConfidence,
        reviewStatus: 'REVIEWED', reviewedAt: new Date().toISOString(),
      };
      await db.organizationProcurement.update({ where: { id }, data: { extractionMetadata: confirmedMetadata } });
      if (db?.tenderExtraction?.updateMany) {
        await db.tenderExtraction.updateMany({ where: { procurementId: id, reviewStatus: 'NEEDS_REVIEW' }, data: { reviewStatus: 'REVIEWED', reviewedByAuthId: req.auth.id, reviewedAt: new Date() } });
      }
      item = { ...item, extractionMetadata: confirmedMetadata };
    }
    if (item && db?.tender?.upsert && item.status !== 'DRAFT') {
      const previousTender = await db.tender.findUnique({ where: { referenceNumber: item.referenceNumber } });
      const tender = await db.tender.upsert({
        where: { referenceNumber: item.referenceNumber },
        create: { referenceNumber: item.referenceNumber, title: item.title, description: item.description, category: item.category, issuingAuthority: item.ownerAuthId, status: item.status === 'PUBLISHED' ? 'ACTIVE' : 'CLOSED', submissionDeadline: item.submissionDeadline, estimatedValue: item.estimatedValue, location: item.location, quantity: item.quantity, openingDate: item.openingDate, deliveryDuration: item.deliveryDuration, extractionMetadata: item.extractionMetadata, eligibilityCriteria: { minTurnover: item.minTurnover, minExperienceYears: item.minExperienceYears, requiredCertifications: item.requiredCertifications, locationRestrictions: item.locationRestrictions }, requiredDocuments: item.requiredDocuments },
        update: { title: item.title, description: item.description, category: item.category, status: item.status === 'PUBLISHED' ? 'ACTIVE' : 'CLOSED', submissionDeadline: item.submissionDeadline, estimatedValue: item.estimatedValue, location: item.location, quantity: item.quantity, openingDate: item.openingDate, deliveryDuration: item.deliveryDuration, extractionMetadata: item.extractionMetadata, eligibilityCriteria: { minTurnover: item.minTurnover, minExperienceYears: item.minExperienceYears, requiredCertifications: item.requiredCertifications, locationRestrictions: item.locationRestrictions }, requiredDocuments: item.requiredDocuments },
      });
      await recordTenderVersion(db, tender, { actorId: req.auth.id, source: 'ORGANIZATION_EDIT', previous: previousTender });
    } else if (item?.status === 'DRAFT' && db?.tender?.updateMany) {
      const previousTender = await db.tender.findUnique({ where: { referenceNumber: item.referenceNumber } });
      await db.tender.updateMany({ where: { referenceNumber: item.referenceNumber }, data: { status: 'CLOSED' } });
      const tender = await db.tender.findUnique({ where: { referenceNumber: item.referenceNumber } });
      if (tender) await recordTenderVersion(db, tender, { actorId: req.auth.id, source: 'ORGANIZATION_EDIT', previous: previousTender });
    }
    res.json({ item });
  }));

  api.get('/organization/procurements/:id/applications', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const filters = parse(applicantQuerySchema, req.query);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const rows = await db.application.findMany({ where: { tender: { referenceNumber: procurement.referenceNumber }, ...(filters.status ? { status: filters.status } : {}) }, include: { tender: true }, orderBy: { createdAt: 'desc' } });
    let items = await Promise.all(rows.map(async row => {
      const profile = await db.businessProfile?.findUnique?.({ where: { ownerAuthId: row.ownerAuthId } });
      const safeRow = {
        ...row,
        ...(Array.isArray(row.submittedDocuments) ? { submittedDocuments: row.submittedDocuments.map(redactDocumentBinary) } : {}),
        ...(Array.isArray(row.revisions) ? { revisions: row.revisions.map(revision => ({
          ...revision,
          ...(Array.isArray(revision?.submittedDocuments) ? { submittedDocuments: revision.submittedDocuments.map(redactDocumentBinary) } : {}),
        })) } : {}),
      };
      return { ...safeRow, applicant: profile ? {
        companyName: profile.businessName, category: profile.category, location: profile.location,
        annualTurnover: profile.annualTurnover, yearsOfExperience: profile.yearsOfExperience,
        certifications: profile.certifications,
      } : null };
    }));
    if (filters.search) {
      const needle = filters.search.toLocaleLowerCase();
      items = items.filter(row => `${row.applicant?.companyName || ''} ${row.applicant?.category || ''} ${row.applicant?.location || ''} ${row.referenceNo || ''} ${row.tender?.referenceNumber || ''}`.toLocaleLowerCase().includes(needle));
    }
    res.json({ items });
  }));
  api.patch('/organization/procurements/:id/applications/:applicationId', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const applicationId = parse(idSchema, req.params.applicationId);
    const { status, reviewNotes, rejectionReason } = parse(applicationReviewSchema, req.body);

    const procurement = await db.organizationProcurement.findFirst({
      where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) },
    });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');

    const existing = await db.application.findFirst({
      where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } },
    });
    if (!existing) throw new HttpError(404, 'Application not found for this procurement.');

    if (existing.status === 'WITHDRAWN') {
      throw new HttpError(400, 'Cannot update an application that has been withdrawn by the applicant.');
    }
    if (existing.status === 'CLOSED') {
      throw new HttpError(400, 'Cannot update a closed application.');
    }

    // Terminal outcome checks: cannot transition from terminal states back to active review
    if (['AWARDED', 'REJECTED', 'NOT_SELECTED'].includes(existing.status)) {
      throw new HttpError(400, `Cannot change status of an application in terminal state "${existing.status}".`);
    }

    if (['DRAFT', 'INTERESTED'].includes(existing.status)) {
      throw new HttpError(400, `Cannot review an unsubmitted application (current status: "${existing.status}").`);
    }

    const ALLOWED_REVIEW_TRANSITIONS = {
      SUBMITTED: ['RECEIVED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
      RECEIVED: ['UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
      UNDER_REVIEW: ['RECEIVED', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
      UNDER_EVALUATION: ['UNDER_REVIEW', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
      SHORTLISTED: ['UNDER_REVIEW', 'UNDER_EVALUATION', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
      AWARDED: [],
      REJECTED: [],
      NOT_SELECTED: [],
      WITHDRAWN: [],
      CLOSED: [],
      DRAFT: [],
      INTERESTED: [],
    };

    const allowedNext = ALLOWED_REVIEW_TRANSITIONS[existing.status] || [];
    if (existing.status !== status && !allowedNext.includes(status)) {
      throw new HttpError(400, `Invalid status transition from "${existing.status}" to "${status}".`);
    }

    const now = new Date().toISOString();
    const historyEntry = {
      status,
      timestamp: now,
      note: reviewNotes || `Application status changed to ${status} by reviewing organization.`,
      changedBy: req.auth.role === ADMIN ? 'Administrator' : 'Procuring Organization',
    };
    const updatedHistory = [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      historyEntry,
    ];

    await db.application.updateMany({
      where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } },
      data: {
        status,
        ...(reviewNotes !== undefined ? { reviewNotes } : {}),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
        statusHistory: updatedHistory,
      },
    });
    await writeAuditEvent(db, {
      actorAuthId: req.auth.id, actorRole: req.auth.role, action: 'APPLICATION_REVIEWED',
      entityType: 'APPLICATION', entityId: applicationId,
      metadata: { procurementReference: procurement.referenceNumber, status },
    });

    res.json({ item: await db.application.findUnique({ where: { id: applicationId }, include: { tender: true } }) });
  }));

  api.patch('/organization/procurements/:id/applications/:applicationId/internal-notes', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const applicationId = parse(idSchema, req.params.applicationId);
    const { reviewNotes } = parse(applicationInternalNoteSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const application = await db.application.findFirst({
      where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } },
    });
    if (!application) throw new HttpError(404, 'Application not found for this procurement.');
    const updated = await db.application.updateMany({
      where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } },
      data: { reviewNotes: reviewNotes ?? null },
    });
    if (!updated.count) throw new HttpError(404, 'Application not found for this procurement.');
    const item = await db.application.findUnique({ where: { id: applicationId }, select: { id: true, reviewNotes: true, updatedAt: true } });
    res.json({ item });
  }));

  api.get('/organization/procurements/:id/results', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const procurement = await db.organizationProcurement.findFirst({
      where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) },
    });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const tender = await db.tender.findUnique({ where: { referenceNumber: procurement.referenceNumber }, select: { id: true } });
    if (!tender) throw new HttpError(404, 'Tender catalogue record not found.');
    const item = await db.tenderResult.findUnique({ where: { tenderId: tender.id } });
    res.json({ item: item || null });
  }));

  api.post('/organization/procurements/:id/results', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { summary } = parse(tenderResultPublishSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({
      where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) },
    });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const tender = await db.tender.findUnique({ where: { referenceNumber: procurement.referenceNumber } });
    if (!tender) throw new HttpError(404, 'Tender catalogue record not found.');

    const applications = await db.application.findMany({ where: { tenderId: tender.id }, select: { id: true, status: true } });
    const submittedApplications = applications.filter(application => !['DRAFT', 'INTERESTED', 'WITHDRAWN'].includes(application.status));
    if (!submittedApplications.length) throw new HttpError(400, 'There are no submitted applications to release results for.');
    const finalStatuses = new Set(['AWARDED', 'NOT_SELECTED', 'REJECTED', 'CLOSED']);
    const stillInReview = submittedApplications.filter(application => !finalStatuses.has(application.status));
    if (stillInReview.length) throw new HttpError(400, 'Move every submitted application to a final review outcome before publishing results.');

    const previous = await db.tenderResult.findUnique({ where: { tenderId: tender.id } });
    const publishedAt = new Date();
    const persistResultAndAudit = async client => {
      const result = await client.tenderResult.upsert({
        where: { tenderId: tender.id },
        create: { tenderId: tender.id, summary, publishedByAuthId: req.auth.id, publishedAt },
        update: { summary, publishedByAuthId: req.auth.id, publishedAt },
      });
      await writeAuditEvent(client, {
        actorAuthId: req.auth.id, actorRole: req.auth.role,
        action: previous ? 'TENDER_RESULTS_UPDATED' : 'TENDER_RESULTS_PUBLISHED',
        entityType: 'TENDER_RESULT', entityId: tender.id,
        metadata: { procurementReference: procurement.referenceNumber, summary, previousSummary: previous?.summary || null },
      });
      return result;
    };
    const item = db.$transaction ? await db.$transaction(persistResultAndAudit) : await persistResultAndAudit(db);
    res.status(previous ? 200 : 201).json({ item });
  }));

  api.get('/applications/:id/clarifications', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const applicationId = parse(idSchema, req.params.id);
    await findApplicationForRole(applicationId, req.auth);
    const items = await db.applicationClarification.findMany({
      where: { applicationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: items.map(publicClarification) });
  }));

  api.post('/organization/procurements/:id/applications/:applicationId/clarifications', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const applicationId = parse(idSchema, req.params.applicationId);
    const data = parse(clarificationCreateSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const application = await db.application.findFirst({
      where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } },
      include: { tender: true },
    });
    if (!application) throw new HttpError(404, 'Application not found for this procurement.');
    if (!['SUBMITTED', 'RECEIVED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED'].includes(application.status)) {
      throw new HttpError(400, 'Clarifications can only be requested for active submitted applications.');
    }
    const deadline = data.responseDeadline ? new Date(data.responseDeadline) : null;
    if (deadline && deadline <= new Date()) throw new HttpError(400, 'The clarification response deadline must be in the future.');
    const item = await db.applicationClarification.create({
      data: {
        applicationId,
        subject: data.subject,
        responseDeadline: deadline,
        createdByAuthId: req.auth.id,
        messages: { create: { senderAuthId: req.auth.id, senderRole: req.auth.role, body: data.message } },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    res.status(201).json({ item: publicClarification(item) });
  }));

  api.post('/applications/:id/clarifications/:clarificationId/messages', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const applicationId = parse(idSchema, req.params.id);
    const clarificationId = parse(idSchema, req.params.clarificationId);
    const { message } = parse(clarificationMessageSchema, req.body);
    await findApplicationForRole(applicationId, req.auth);
    const clarification = await db.applicationClarification.findFirst({ where: { id: clarificationId, applicationId } });
    if (!clarification) throw new HttpError(404, 'Clarification not found for this application.');
    if (clarification.status !== 'OPEN') throw new HttpError(400, 'This clarification is no longer open for a response.');
    if (clarification.responseDeadline && new Date() > new Date(clarification.responseDeadline)) {
      throw new HttpError(400, 'The clarification response deadline has passed.');
    }
    const item = await db.applicationClarification.update({
      where: { id: clarificationId },
      data: {
        status: 'RESPONDED',
        respondedAt: new Date(),
        messages: { create: { senderAuthId: req.auth.id, senderRole: req.auth.role, body: message } },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    res.status(201).json({ item: publicClarification(item) });
  }));

  api.patch('/organization/procurements/:id/applications/:applicationId/clarifications/:clarificationId/close', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const applicationId = parse(idSchema, req.params.applicationId);
    const clarificationId = parse(idSchema, req.params.clarificationId);
    if (Object.keys(req.body || {}).length) throw new HttpError(400, 'Closing a clarification does not accept additional fields.');
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const application = await db.application.findFirst({ where: { id: applicationId, tender: { referenceNumber: procurement.referenceNumber } } });
    if (!application) throw new HttpError(404, 'Application not found for this procurement.');
    const clarification = await db.applicationClarification.findFirst({ where: { id: clarificationId, applicationId } });
    if (!clarification) throw new HttpError(404, 'Clarification not found for this application.');
    if (clarification.status !== 'RESPONDED') throw new HttpError(400, 'A clarification can be closed after the applicant responds.');
    const item = await db.applicationClarification.update({
      where: { id: clarificationId },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    res.json({ item: publicClarification(item) });
  }));

  api.post('/verification-requests', requireRole(BUSINESS, ORG), asyncRoute(async (req, res) => {
    const data = parse(verificationSchema, req.body);
    const item = await db.verificationRequest.create({ data: {
      ...data, ownerAuthId: req.auth.id,
      ...(data.type === 'ORGANIZATION' ? { status: 'APPROVED', reviewedAt: new Date(), decisionNote: 'Organization self-registration; profile details saved.' } : {}),
    } });
    if (data.type === 'ORGANIZATION') {
      await db.accountRoleAssignment.upsert({
        where: { ownerAuthId: req.auth.id },
        create: { ownerAuthId: req.auth.id, role: 'ORGANIZATION' },
        update: { role: 'ORGANIZATION' },
      });
    }
    res.status(201).json({ item });
  }));
  api.get('/admin/verification-requests', requireRole(ADMIN), asyncRoute(async (req, res) => {
    const { status, type } = parse(verificationFilterSchema, {
      ...(req.query.status ? { status: String(req.query.status).toUpperCase() } : {}),
      ...(req.query.type ? { type: String(req.query.type).toUpperCase() } : {}),
    });
    const items = await db.verificationRequest.findMany({
      where: { ...(status ? { status } : {}), ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' },
    });
    res.json({ items });
  }));
  api.get('/admin/overview', requireRole(ADMIN), asyncRoute(async (_req, res) => {
    const [businesses, organizations, pending, verified, tenders, published, applications, releasedResults] = await Promise.all([
      db.businessProfile.count(),
      db.accountRoleAssignment.count({ where: { role: 'ORGANIZATION' } }),
      db.verificationRequest.count({ where: { type: 'ORGANIZATION', status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      db.verificationRequest.count({ where: { type: 'ORGANIZATION', status: 'APPROVED' } }),
      db.tender.count(),
      db.organizationProcurement.count({ where: { status: 'PUBLISHED' } }),
      db.application.count(),
      db?.tenderResult?.count ? db.tenderResult.count() : Promise.resolve(0),
    ]);
    res.json({ item: { businesses, organizations, pendingVerifications: pending, verifiedOrganizations: verified, tenders, publishedTenders: published, applications, releasedResults } });
  }));
  api.get('/admin/audit-events', requireRole(ADMIN), asyncRoute(async (_req, res) => {
    const items = await db.adminAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ items });
  }));
  api.patch('/admin/verification-requests/:id', requireRole(ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { status, decisionNote } = parse(decisionSchema, req.body);
    const result = await db.verificationRequest.updateMany({
      where: { id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      data: { status, decisionNote, reviewedBy: req.auth.id, reviewedAt: new Date() },
    });
    if (!result.count) throw new HttpError(404, 'Pending verification request not found.');
    const item = await db.verificationRequest.findUnique({ where: { id } });
    if (item?.type === 'ORGANIZATION' && db?.accountRoleAssignment?.upsert) {
      await db.accountRoleAssignment.upsert({
        where: { ownerAuthId: item.ownerAuthId },
        create: { ownerAuthId: item.ownerAuthId, role: status === 'APPROVED' ? 'ORGANIZATION' : 'BUSINESS', assignedBy: req.auth.id },
        update: { role: status === 'APPROVED' ? 'ORGANIZATION' : 'BUSINESS', assignedBy: req.auth.id },
      });
    }
    await writeAuditEvent(db, {
      actorAuthId: req.auth.id, actorRole: ADMIN, action: `VERIFICATION_${status}`,
      entityType: 'VERIFICATION_REQUEST', entityId: id,
      metadata: { ownerAuthId: item?.ownerAuthId, requestType: item?.type, decisionNote: decisionNote || null },
    });
    res.json({ item });
  }));

  api.post('/eligibility/evaluate', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const data = parse(eligibilityEvaluateSchema, req.body);
    const criteria = data.criteria || {
      minTurnover: data.minTurnover,
      minExperienceYears: data.minExperienceYears,
      requiredCertifications: data.requiredCertifications,
      locationRestrictions: data.locationRestrictions,
    };

    let businessProfile = null;
    if (db?.businessProfile?.findUnique) {
      businessProfile = await db.businessProfile.findUnique({ where: { ownerAuthId: req.auth.id } });
    } else if (db?.businessProfile?.findFirst) {
      businessProfile = await db.businessProfile.findFirst({ where: { ownerAuthId: req.auth.id } });
    }

    if (businessProfile && typeof businessProfile.annualTurnover === 'object' && businessProfile.annualTurnover !== null && typeof businessProfile.annualTurnover.toNumber === 'function') {
      businessProfile = { ...businessProfile, annualTurnover: businessProfile.annualTurnover.toNumber() };
    }

    if (!businessProfile && data.businessProfile) {
      const { id, ownerAuthId, userId, ...safeProfile } = data.businessProfile;
      businessProfile = safeProfile;
    }

    const profileToEvaluate = businessProfile || {};

    let result;
    try {
      result = evaluateEligibility(profileToEvaluate, criteria);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }

    if (!businessProfile && !data.businessProfile) {
      if (!result.missingInformation.includes('Business profile is not configured for this account.')) {
        result.missingInformation.unshift('Business profile is not configured for this account.');
      }
    }

    res.json({
      ...result,
      explanation: result.summary,
      item: result,
    });
  }));

  function formatProfile(item) {
    if (!item) return null;
    const turnover = item.annualTurnover && typeof item.annualTurnover === 'object' && typeof item.annualTurnover.toNumber === 'function'
      ? item.annualTurnover.toNumber()
      : item.annualTurnover;

    let completion = 0;
    const missing = [];
    if (item.businessName && item.category && item.location) {
      completion += 20;
    } else {
      missing.push('Company basics (Name, category, location)');
    }

    if (item.contactPerson || item.contactEmail || item.publicContactEmail || item.contactPhone) {
      completion += 20;
    } else {
      missing.push('Contact person & communication details');
    }

    if (turnover != null && item.yearsOfExperience != null) {
      completion += 20;
    } else {
      missing.push('Financial & experience qualifications');
    }

    if (Array.isArray(item.certifications) && item.certifications.length > 0) {
      completion += 15;
    } else {
      missing.push('Industry certifications');
    }

    if (Array.isArray(item.productsServices) && item.productsServices.length > 0) {
      completion += 15;
    } else {
      missing.push('Products and services offered');
    }

    if (item.previousProjects || item.description) {
      completion += 10;
    } else {
      missing.push('Past project highlights or company profile');
    }

    return {
      ...item,
      annualTurnover: turnover,
      profileCompletion: completion,
      missingSections: missing,
    };
  }

  api.get('/profile', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    if (!db?.businessProfile) {
      throw new HttpError(503, 'Profile storage is not available in the database.');
    }
    const item = await db.businessProfile.findUnique({
      where: { ownerAuthId: req.auth.id },
    });
    if (!item) {
      throw new HttpError(404, 'Profile not found.');
    }
    res.json({ item: formatProfile(item) });
  }));

  api.put('/profile', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    if (!db?.businessProfile) {
      throw new HttpError(503, 'Profile storage is not available in the database.');
    }
    const data = parse(profileUpdateSchema, req.body);
    const item = await db.businessProfile.upsert({
      where: { ownerAuthId: req.auth.id },
      create: { ...data, ownerAuthId: req.auth.id },
      update: data,
    });
    res.json({ item: formatProfile(item) });
  }));

  /* --- Business Document Vault Routes --- */
  api.get('/business/documents', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    if (!db?.businessDocument) {
      throw new HttpError(503, 'Document vault storage is not available in the database.');
    }
    const items = await db.businessDocument.findMany({
      where: { ownerAuthId: req.auth.id },
      select: {
        id: true,
        name: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  }));

  api.post('/business/documents', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    if (!db?.businessDocument) {
      throw new HttpError(503, 'Document vault storage is not available in the database.');
    }
    const data = parse(documentUploadSchema, req.body);
    const bytes = Buffer.from(data.fileBase64, 'base64');
    if (bytes.length < 4 || bytes.length > 8 * 1024 * 1024) {
      throw new HttpError(400, 'Upload a valid document file no larger than 8 MB.');
    }
    const item = await db.businessDocument.create({
      data: {
        ownerAuthId: req.auth.id,
        name: data.name,
        category: data.category,
        fileName: data.fileName,
        fileSize: bytes.length,
        mimeType: data.mimeType || 'application/pdf',
        fileData: bytes,
      },
      select: {
        id: true,
        name: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.status(201).json({ item });
  }));

  api.get('/business/documents/:id', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const item = await db.businessDocument.findFirst({
      where: { id, ownerAuthId: req.auth.id },
      select: {
        id: true,
        name: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!item) throw new HttpError(404, 'Document not found.');
    res.json({ item });
  }));

  api.get('/business/documents/:id/download', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const item = await db.businessDocument.findFirst({
      where: { id, ownerAuthId: req.auth.id },
      select: { fileName: true, mimeType: true, fileData: true },
    });
    if (!item?.fileData) throw new HttpError(404, 'Document file not found.');
    res.set({
      'Content-Type': item.mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.fileName || 'document.pdf')}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(item.fileData);
  }));

  api.put('/business/documents/:id', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const data = parse(documentUpdateSchema, req.body);
    const exists = await db.businessDocument.findFirst({ where: { id, ownerAuthId: req.auth.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'Document not found.');
    const item = await db.businessDocument.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ item });
  }));

  api.delete('/business/documents/:id', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const result = await db.businessDocument.deleteMany({ where: { id, ownerAuthId: req.auth.id } });
    if (!result.count) throw new HttpError(404, 'Document not found.');
    res.status(204).end();
  }));

  /* --- Tender Discovery & Details --- */
  api.get('/tenders', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    if (!db?.tender) {
      throw new HttpError(503, 'Tender storage is not available in the database.');
    }
    const query = parse(tenderListQuerySchema, req.query);
    const deadlineWhere = {
      ...(query.deadlineFrom ? { gte: new Date(query.deadlineFrom) } : {}),
      ...(query.deadlineTo   ? { lte: new Date(query.deadlineTo)   } : {}),
    };
    const valueWhere = {
      ...(query.minValue != null ? { gte: query.minValue } : {}),
      ...(query.maxValue != null ? { lte: query.maxValue } : {}),
    };
    const searchConditions = query.search ? [
      { title:            { contains: query.search, mode: 'insensitive' } },
      { referenceNumber:  { contains: query.search, mode: 'insensitive' } },
      { issuingAuthority: { contains: query.search, mode: 'insensitive' } },
      { category:         { contains: query.search, mode: 'insensitive' } },
    ] : [];
    if (query.location) {
      searchConditions.push(
        { location: { contains: query.location, mode: 'insensitive' } },
        { issuingAuthority: { contains: query.location, mode: 'insensitive' } },
        { description:      { contains: query.location, mode: 'insensitive' } }
      );
    }
    const where = {
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(Object.keys(deadlineWhere).length ? { submissionDeadline: deadlineWhere } : {}),
      ...(Object.keys(valueWhere).length ? { estimatedValue: valueWhere } : {}),
      ...(query.status ? { status: { equals: query.status, mode: 'insensitive' } } : {}),
      ...(searchConditions.length ? { OR: searchConditions } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total, verifiedOrgs] = await Promise.all([
      db.tender.findMany({
        where,
        orderBy: [{ submissionDeadline: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      typeof db.tender.count === 'function'
        ? db.tender.count({ where })
        : Promise.resolve(undefined),
      db?.verificationRequest?.findMany
        ? db.verificationRequest.findMany({
            where: { type: 'ORGANIZATION', status: 'APPROVED' },
            select: { organizationName: true, organizationType: true, address: true },
          })
        : Promise.resolve([]),
    ]);

    const verifiedMap = new Map((verifiedOrgs || []).map(o => [String(o.organizationName || '').trim().toLowerCase(), o]));

    const enrichedItems = items.map(t => {
      const authKey = String(t.issuingAuthority || '').trim().toLowerCase();
      const verified = verifiedMap.get(authKey) || null;
      const { extractionMetadata: _privateExtractionMetadata, ...publicTender } = t;
      return {
        ...publicTender,
        organization: {
          name: t.issuingAuthority,
          verified: Boolean(verified),
          type: verified?.organizationType || 'Private Organization',
          location: verified?.address || null,
        },
      };
    });

    res.json({
      items: enrichedItems,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        ...(typeof total === 'number'
          ? { total, totalPages: Math.ceil(total / query.pageSize) }
          : {}),
      },
    });
  }));

  api.get('/tenders/:id', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    if (!db?.tender) {
      throw new HttpError(503, 'Tender storage is not available in the database.');
    }
    const idOrReference = String(req.params.id || '').trim();
    const where = idSchema.safeParse(idOrReference).success
      ? { id: idOrReference }
      : { referenceNumber: idOrReference };
    const item = await db.tender.findUnique({ where });
    if (!item) throw new HttpError(404, 'Tender not found.');
    const { extractionMetadata: _privateExtractionMetadata, ...publicTender } = item;
    const attachment = item.referenceNumber && db?.organizationProcurement?.findFirst
      ? await db.organizationProcurement.findFirst({
          where: { referenceNumber: item.referenceNumber },
          select: {
            id: true,
            pdfFileName: true,
            location: true,
            minTurnover: true,
            minExperienceYears: true,
            requiredCertifications: true,
            locationRestrictions: true,
            eligibilityCriteria: true,
            requiredDocuments: true,
            updatedAt: true,
          },
        })
      : null;

    let verifiedOrg = null;
    if (item.issuingAuthority && db?.verificationRequest?.findFirst) {
      verifiedOrg = await db.verificationRequest.findFirst({
        where: { organizationName: item.issuingAuthority, type: 'ORGANIZATION', status: 'APPROVED' },
        select: { organizationName: true, organizationType: true, address: true },
      });
    }
    const latestVersion = await db.tenderVersion?.findFirst?.({
      where: { tenderId: item.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true },
    });

    const mergedCriteria = item.eligibilityCriteria || (attachment ? {
      minTurnover: attachment.minTurnover != null ? Number(attachment.minTurnover) : null,
      minExperienceYears: attachment.minExperienceYears != null ? Number(attachment.minExperienceYears) : null,
      requiredCertifications: attachment.requiredCertifications || [],
      locationRestrictions: attachment.locationRestrictions || (attachment.location ? [attachment.location] : []),
      summary: item.description || null,
    } : null);

    const mergedDocuments = (Array.isArray(item.requiredDocuments) && item.requiredDocuments.length > 0)
      ? item.requiredDocuments
      : (Array.isArray(attachment?.requiredDocuments) && attachment.requiredDocuments.length > 0
        ? attachment.requiredDocuments
        : ['Company Registration / Certificate of Incorporation', 'GST / Tax Clearance Certificate', 'Audited Annual Turnover Statement (Past 3 Years)']);

    res.json({
      item: {
        ...publicTender,
        eligibilityCriteria: mergedCriteria,
        requiredDocuments: mergedDocuments,
        pdfAvailable: Boolean(attachment?.pdfFileName),
        location: item.location || attachment?.location || null,
        organization: {
          name: item.issuingAuthority,
          verified: Boolean(verifiedOrg),
          type: verifiedOrg?.organizationType || 'Private Organization',
          location: verifiedOrg?.address || attachment?.location || null,
        },
        keyDates: {
          publishedDate: item.createdAt,
          submissionDeadline: item.submissionDeadline,
          lastUpdated: item.updatedAt,
        },
        latestVersionNumber: latestVersion?.versionNumber || 0,
      },
    });
  }));

  api.get('/tenders/:id/versions', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.id);
    const items = await db.tenderVersion?.findMany?.({
      where: { tenderId }, orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true, snapshot: true, changedFields: true, source: true, createdAt: true },
    }) || [];
    res.json({ items });
  }));

  api.get('/tenders/:id/faqs', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.id);
    const tender = await db.tender.findUnique({ where: { id: tenderId }, select: { id: true, referenceNumber: true } });
    if (!tender) throw new HttpError(404, 'Tender not found.');
    if (req.auth.role === ORG) {
      const procurement = await db.organizationProcurement.findFirst({ where: { referenceNumber: tender.referenceNumber, ownerAuthId: req.auth.id } });
      if (!procurement) throw new HttpError(404, 'Tender not found.');
    }
    const where = req.auth.role === BUSINESS
      ? { tenderId, OR: [{ status: 'PUBLISHED' }, { askedByAuthId: req.auth.id }] }
      : { tenderId };
    const items = await db.tenderFaq?.findMany?.({ where, orderBy: { createdAt: 'desc' } }) || [];
    res.json({ items: items.map(tenderFaqView) });
  }));

  api.post('/tenders/:id/faqs', requireRole(BUSINESS), asyncRoute(async (req, res) => {
    const tenderId = await resolveTenderId(db, req.params.id);
    const { question } = parse(tenderFaqQuestionSchema, req.body);
    const tender = await db.tender.findUnique({ where: { id: tenderId }, select: { id: true, status: true, submissionDeadline: true } });
    if (!tender || String(tender.status || '').toUpperCase() === 'CLOSED') throw new HttpError(404, 'Tender is not accepting questions.');
    if (tender.submissionDeadline && new Date() > new Date(tender.submissionDeadline)) throw new HttpError(400, 'The question window for this tender has closed.');
    const item = await db.tenderFaq.create({ data: { tenderId, question, status: 'PENDING', askedByAuthId: req.auth.id } });
    res.status(201).json({ item: tenderFaqView(item) });
  }));

  api.post('/organization/procurements/:id/faqs', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { question, answer } = parse(tenderFaqCreateSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    if (procurement.status !== 'PUBLISHED') throw new HttpError(400, 'Publish the procurement before publishing a tender FAQ.');
    const tender = await db.tender.findUnique({ where: { referenceNumber: procurement.referenceNumber }, select: { id: true } });
    if (!tender) throw new HttpError(404, 'Published tender not found.');
    const item = await db.tenderFaq.create({ data: {
      tenderId: tender.id, question, answer, status: 'PUBLISHED',
      answeredByAuthId: req.auth.id, answeredAt: new Date(),
    } });
    res.status(201).json({ item: tenderFaqView(item) });
  }));

  api.patch('/organization/procurements/:id/faqs/:faqId', requireRole(ORG, ADMIN), asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const faqId = parse(idSchema, req.params.faqId);
    const data = parse(tenderFaqReviewSchema, req.body);
    const procurement = await db.organizationProcurement.findFirst({ where: { id, ...(req.auth.role === ADMIN ? {} : { ownerAuthId: req.auth.id }) } });
    if (!procurement) throw new HttpError(404, 'Procurement listing not found.');
    const tender = await db.tender.findUnique({ where: { referenceNumber: procurement.referenceNumber }, select: { id: true } });
    if (!tender) throw new HttpError(404, 'Tender not found for this procurement.');
    const current = await db.tenderFaq.findFirst({ where: { id: faqId, tenderId: tender.id } });
    if (!current) throw new HttpError(404, 'FAQ not found for this procurement.');
    const item = await db.tenderFaq.update({
      where: { id: faqId },
      data: { answer: data.status === 'PUBLISHED' ? data.answer : null, status: data.status, answeredByAuthId: req.auth.id, answeredAt: new Date() },
    });
    res.json({ item: tenderFaqView(item) });
  }));

  api.get('/tenders/:id/pdf', requireRole(BUSINESS, ORG, ADMIN), asyncRoute(async (req, res) => {
    const idOrReference = String(req.params.id || '').trim();
    const tender = await db.tender.findUnique({ where: idSchema.safeParse(idOrReference).success ? { id: idOrReference } : { referenceNumber: idOrReference }, select: { referenceNumber: true, status: true } });
    if (!tender || tender.status !== 'ACTIVE') throw new HttpError(404, 'Published tender PDF not found.');
    const procurement = await db.organizationProcurement.findFirst({ where: { referenceNumber: tender.referenceNumber, status: 'PUBLISHED' }, select: { pdfData: true, pdfFileName: true } });
    if (!procurement?.pdfData) throw new HttpError(404, 'PDF not found for this tender.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(procurement.pdfFileName || 'tender.pdf')}`, 'X-Content-Type-Options': 'nosniff' });
    res.send(procurement.pdfData);
  }));

  api.post('/admin/tenders', requireRole(ADMIN), asyncRoute(async (req, res) => {
    if (!db?.tender) throw new HttpError(503, 'Tender storage is not available in the database.');
    const data = parse(tenderCreateSchema, req.body);
    const item = await db.tender.create({ data: {
      ...data,
      ...(data.submissionDeadline ? { submissionDeadline: new Date(data.submissionDeadline) } : {}),
      ...(data.openingDate ? { openingDate: new Date(data.openingDate) } : {}),
    } });
    await recordTenderVersion(db, item, { actorId: req.auth.id, source: 'ADMIN_CREATE' });
    await writeAuditEvent(db, {
      actorAuthId: req.auth.id, actorRole: ADMIN, action: 'TENDER_CREATED',
      entityType: 'TENDER', entityId: item.id,
      metadata: { referenceNumber: item.referenceNumber, title: item.title },
    });
    res.status(201).json({ item });
  }));

  api.get('/admin/tenders/:id', requireRole(ADMIN), asyncRoute(async (req, res) => {
    if (!db?.tender) throw new HttpError(503, 'Tender storage is not available in the database.');
    const id = parse(idSchema, req.params.id);
    const item = await db.tender.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, 'Tender not found.');
    res.json({ item });
  }));

  api.patch('/admin/tenders/:id', requireRole(ADMIN), asyncRoute(async (req, res) => {
    if (!db?.tender) throw new HttpError(503, 'Tender storage is not available in the database.');
    const id = parse(idSchema, req.params.id);
    const data = parse(tenderUpdateSchema, req.body);

    const existing = await db.tender.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Tender not found.');

    const updateData = {
      ...data,
      ...(data.submissionDeadline !== undefined ? { submissionDeadline: data.submissionDeadline ? new Date(data.submissionDeadline) : null } : {}),
      ...(data.openingDate !== undefined ? { openingDate: data.openingDate ? new Date(data.openingDate) : null } : {}),
    };

    const updated = await db.tender.update({
      where: { id },
      data: updateData,
    });

    await recordTenderVersion(db, updated, { actorId: req.auth.id, source: 'ADMIN_EDIT', previous: existing });

    const isStatusChange = data.status !== undefined && data.status !== existing.status;
    const action = isStatusChange
      ? (['ARCHIVED', 'CLOSED'].includes(data.status) ? 'TENDER_ARCHIVED' : 'TENDER_RESTORED')
      : 'TENDER_UPDATED';

    await writeAuditEvent(db, {
      actorAuthId: req.auth.id,
      actorRole: ADMIN,
      action,
      entityType: 'TENDER',
      entityId: id,
      metadata: {
        referenceNumber: updated.referenceNumber,
        changedFields: Object.keys(data),
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    });

    res.json({ item: updated });
  }));

  api.post('/tenders/extract', asyncRoute(async (req, res) => {
    if (!req.body?.text?.trim() && !req.body?.fileBase64) {
      throw new HttpError(400, 'Paste tender text or upload a PDF before extracting.');
    }
    const data = parse(tenderExtractSchema, req.body);
    let sourceText = data.text || '';
    let documentProcessing = null;
    if (data.fileBase64) {
      const pdf = Buffer.from(data.fileBase64, 'base64');
      if (pdf.length > 8 * 1024 * 1024 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new HttpError(400, 'Upload a valid PDF file no larger than 8 MB.');
      }
      documentProcessing = await extractPdfDocument(pdf);
      sourceText = documentProcessing.text;
      if (!sourceText) throw new HttpError(422, `${documentProcessing.message || 'No readable text was found in this PDF.'} Paste the notice text or enter requirements manually.`);
    }
    if (!sourceText.trim()) throw new HttpError(400, 'Paste tender text or upload a readable PDF before extracting.');
    let extracted;
    try {
      extracted = await extractTenderDetails(sourceText, { localOnly: Boolean(data.fileBase64) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
    if (data.tenderId) {
      if (!['ORGANIZATION', ADMIN].includes(req.auth?.role)) {
        throw new HttpError(req.auth ? 403 : 401, 'Only the procuring organization or an administrator can update a tender record.');
      }
      const tenderId = await resolveTenderId(db, data.tenderId);
      const current = await db.tender.findUnique({ where: { id: tenderId } });
      let relatedProcurement = null;
      if (req.auth.role === ORG) {
        relatedProcurement = await db.organizationProcurement.findFirst({
          where: { referenceNumber: current.referenceNumber, ownerAuthId: req.auth.id },
          select: { id: true },
        });
        if (!relatedProcurement) throw new HttpError(404, 'Tender not found.');
      } else if (db?.organizationProcurement?.findFirst) {
        relatedProcurement = await db.organizationProcurement.findFirst({
          where: { referenceNumber: current.referenceNumber }, select: { id: true },
        });
      }
      const priorCriteria = current.eligibilityCriteria && typeof current.eligibilityCriteria === 'object' && !Array.isArray(current.eligibilityCriteria) ? current.eligibilityCriteria : {};
      const mergedCriteria = { ...priorCriteria };
      const appliedFields = [];
      for (const field of ['minTurnover', 'minExperienceYears']) {
        if (mergedCriteria[field] == null && extracted.eligibilityCriteria[field] != null) {
          mergedCriteria[field] = extracted.eligibilityCriteria[field]; appliedFields.push(field);
        }
      }
      for (const field of ['requiredCertifications', 'locationRestrictions']) {
        if ((!Array.isArray(mergedCriteria[field]) || !mergedCriteria[field].length) && extracted.eligibilityCriteria[field]?.length) {
          mergedCriteria[field] = extracted.eligibilityCriteria[field]; appliedFields.push(field);
        }
      }
      if (!mergedCriteria.summary && extracted.summary) mergedCriteria.summary = extracted.summary;
      mergedCriteria.missingInformation = extracted.missingInformation;
      mergedCriteria.extractionSource = extracted.source;
      const existingDocuments = Array.isArray(current.requiredDocuments) ? current.requiredDocuments : [];
      const nextDocuments = existingDocuments.length ? existingDocuments : extracted.requiredDocuments.map(document => document.name);
      if (!existingDocuments.length && nextDocuments.length) appliedFields.push('requiredDocuments');
      const extractedSubmissionDeadline = extractedDate(extracted.metadata.submissionDeadline);
      const extractedOpeningDate = extractedDate(extracted.metadata.openingDate);
      const updates = { eligibilityCriteria: mergedCriteria, requiredDocuments: nextDocuments };
      for (const field of ['category', 'issuingAuthority', 'quantity', 'deliveryDuration']) {
        if (!current[field] && extracted.metadata[field]) { updates[field] = extracted.metadata[field]; appliedFields.push(field); }
      }
      if (!current.submissionDeadline && extractedSubmissionDeadline) { updates.submissionDeadline = extractedSubmissionDeadline; appliedFields.push('submissionDeadline'); }
      if (!current.openingDate && extractedOpeningDate) { updates.openingDate = extractedOpeningDate; appliedFields.push('openingDate'); }
      if (current.estimatedValue == null && extracted.metadata.estimatedValue != null) { updates.estimatedValue = extracted.metadata.estimatedValue; appliedFields.push('estimatedValue'); }
      const extractionSourceType = data.fileBase64 ? pdfSourceType(documentProcessing) : 'PASTED_TEXT';
      const metadata = extractionMetadata(extracted, extractionSourceType, appliedFields, documentProcessing || {});
      updates.extractionMetadata = metadata;
      const item = await db.tender.update({ where: { id: tenderId }, data: updates });
      await recordTenderVersion(db, item, { actorId: req.auth.id, source: 'AI_EXTRACTION', previous: current });
      if (db?.tenderExtraction?.create) {
        await db.tenderExtraction.create({ data: {
          tenderId, procurementId: relatedProcurement?.id || null,
          sourceType: data.fileBase64 ? pdfSourceType(documentProcessing) : 'PASTED_TEXT',
          sourceName: data.fileName || null, extractor: extracted.source,
          overallConfidence: extracted.overallConfidence, extractedValues: extractionValues(extracted),
          fieldConfidence: extracted.fieldConfidence, fieldEvidence: extracted.fieldEvidence,
          fieldEvidencePages: extracted.fieldEvidencePages,
          missingInformation: extracted.missingInformation, createdByAuthId: req.auth.id,
        } });
      }
      extracted = { ...extracted, tenderId: item.id };
    }
    if (documentProcessing) {
      extracted = { ...extracted, documentProcessing: {
        method: documentProcessing.method, ocrStatus: documentProcessing.ocrStatus,
        pagesProcessed: documentProcessing.pagesProcessed, message: documentProcessing.message,
      } };
    }
    res.json({ item: extracted, ...extracted });
  }));

  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found.')));
  app.use(errorHandler);
  return app;
}
