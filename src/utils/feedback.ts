import crypto from 'crypto';
import { FeedbackRequest } from '../models';

export async function createFeedbackRequest(assignmentId: string, employeeId: string) {
  const existing = await FeedbackRequest.findOne({ assignmentId, employeeId });
  if (existing) return existing;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return FeedbackRequest.create({ assignmentId, employeeId, token, expiresAt });
}

export const buildFeedbackUrl = (token: string) =>
  `${process.env.FEEDBACK_BASE_URL || 'http://localhost:5000/feedback'}/${token}`;